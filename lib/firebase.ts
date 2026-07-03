// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User,
  updateProfile,
} from "firebase/auth";
import {
  initializeFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  writeBatch,
  collection,
  query,
  where,
  orderBy,
  addDoc,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// Reemplaza estos valores con los de tu proyecto Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });

// ─── TIPOS ────────────────────────────────────────────────────────────────────
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: Timestamp;
  champion?: string;
  topScorer?: string;
  championLocked?: boolean;
  topScorerLocked?: boolean;
  showFifaRanking?: boolean;
  hasPaid?: boolean;
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  homeYellow?: number;
  awayYellow?: number;
  homeRed?: number;
  awayRed?: number;
  homeYellowRed?: number;  // indirect red (2nd yellow)
  awayYellowRed?: number;
  matchDate: Timestamp;
  round: string;
  group?: string;
  status: "upcoming" | "live" | "finished";
  locked: boolean;
}

export interface Pick {
  id: string;
  userId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  points?: number;
  createdAt: Timestamp;
}

export interface GroupStanding {
  id: string;
  group: string; // "A", "B", etc.
  firstPlace: string;
  secondPlace: string;
  thirdPlaces: string[]; // equipos 3ros que pasan
}

export interface GroupPick {
  id: string;
  userId: string;
  group: string;
  firstPlace: string;
  secondPlace: string;
  thirdPlace?: string;
  points?: number;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export async function registerUser(email: string, password: string, displayName: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await setDoc(doc(db, "users", cred.user.uid), {
    uid: cred.user.uid,
    email,
    displayName,
    isAdmin: false,
    createdAt: Timestamp.now(),
  });
  return cred.user;
}

export async function loginUser(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logoutUser() {
  return signOut(auth);
}

export function onAuthChange(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => d.data() as UserProfile);
}

export async function updateChampionPick(uid: string, champion: string, topScorer: string) {
  const deadline = new Date("2026-06-11T14:00:00-05:00");
  if (new Date() > deadline) throw new Error("La fecha límite para estas predicciones ya pasó.");
  await setDoc(doc(db, "users", uid), { champion, topScorer }, { merge: true });
}

export async function setUserPaid(uid: string, paid: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid), { hasPaid: paid });
}

export async function updateUserProfile(
  uid: string,
  data: { displayName?: string; showFifaRanking?: boolean }
): Promise<void> {
  await updateDoc(doc(db, "users", uid), data);
  if (data.displayName) {
    const currentUser = auth.currentUser;
    if (currentUser) await updateProfile(currentUser, { displayName: data.displayName });
  }
}

// ─── PARTIDOS ─────────────────────────────────────────────────────────────────
export async function getMatches(): Promise<Match[]> {
  const snap = await getDocs(query(collection(db, "matches"), orderBy("matchDate", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Match));
}

export function onMatchesChange(cb: (matches: Match[]) => void) {
  return onSnapshot(
    query(collection(db, "matches"), orderBy("matchDate", "asc")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Match)))
  );
}

export async function createMatch(data: Omit<Match, "id">) {
  return addDoc(collection(db, "matches"), data);
}

export async function updateMatchResult(
  matchId: string,
  homeScore: number,
  awayScore: number,
  cards?: { homeYellow?: number; awayYellow?: number; homeRed?: number; awayRed?: number; homeYellowRed?: number; awayYellowRed?: number }
) {
  await updateDoc(doc(db, "matches", matchId), {
    homeScore,
    awayScore,
    status: "finished",
    locked: true,
    homeYellow: cards?.homeYellow ?? 0,
    awayYellow: cards?.awayYellow ?? 0,
    homeRed: cards?.homeRed ?? 0,
    awayRed: cards?.awayRed ?? 0,
    homeYellowRed: cards?.homeYellowRed ?? 0,
    awayYellowRed: cards?.awayYellowRed ?? 0,
  });
  await recalculatePicksForMatch(matchId, homeScore, awayScore);
}

export async function updateLiveMatchResult(
  matchId: string,
  homeScore: number,
  awayScore: number,
  cards?: { homeYellow?: number; awayYellow?: number; homeRed?: number; awayRed?: number; homeYellowRed?: number; awayYellowRed?: number }
) {
  // Updates score and recalculates picks without changing status to "finished"
  await updateDoc(doc(db, "matches", matchId), {
    homeScore,
    awayScore,
    homeYellow: cards?.homeYellow ?? 0,
    awayYellow: cards?.awayYellow ?? 0,
    homeRed: cards?.homeRed ?? 0,
    awayRed: cards?.awayRed ?? 0,
    homeYellowRed: cards?.homeYellowRed ?? 0,
    awayYellowRed: cards?.awayYellowRed ?? 0,
  });
  await recalculatePicksForMatch(matchId, homeScore, awayScore);
}

export async function lockMatch(matchId: string) {
  await updateDoc(doc(db, "matches", matchId), { locked: true, status: "live" });
}

export async function resetMatch(matchId: string) {
  // Reset match to upcoming, clear scores, unlock bets, and reset all pick points
  await updateDoc(doc(db, "matches", matchId), {
    homeScore: null,
    awayScore: null,
    status: "upcoming",
    locked: false,
  });
  // Reset points for all picks of this match
  const picks = await getDocs(
    query(collection(db, "picks"), where("matchId", "==", matchId))
  );
  const batch = writeBatch(db);
  for (const d of picks.docs) {
    batch.update(doc(db, "picks", d.id), { points: null });
  }
  await batch.commit();
}

// ─── APUESTAS ─────────────────────────────────────────────────────────────────
export async function submitPick(
  userId: string,
  matchId: string,
  homeScore: number,
  awayScore: number
) {
  const match = await getDoc(doc(db, "matches", matchId));
  const data = match.data();
  if (data?.locked) throw new Error("Este partido ya no acepta apuestas.");
  // Also reject if the match has already kicked off, even if admin never flipped `locked`
  const kickoff = data?.matchDate?.toDate?.();
  if (kickoff && new Date() >= kickoff) {
    throw new Error("Este partido ya empezó — las apuestas están cerradas.");
  }

  const existing = await getDocs(
    query(collection(db, "picks"), where("userId", "==", userId), where("matchId", "==", matchId))
  );

  if (!existing.empty) {
    await updateDoc(doc(db, "picks", existing.docs[0].id), { homeScore, awayScore, points: null });
  } else {
    await addDoc(collection(db, "picks"), {
      userId,
      matchId,
      homeScore,
      awayScore,
      points: null,
      createdAt: Timestamp.now(),
    });
  }
}

export async function getUserPicks(userId: string): Promise<Pick[]> {
  const snap = await getDocs(
    query(collection(db, "picks"), where("userId", "==", userId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pick));
}

export async function getAllPicksForMatch(matchId: string): Promise<Pick[]> {
  const snap = await getDocs(
    query(collection(db, "picks"), where("matchId", "==", matchId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pick));
}

export async function getAllPicks(): Promise<Pick[]> {
  const snap = await getDocs(collection(db, "picks"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pick));
}

async function recalculatePicksForMatch(
  matchId: string,
  realHome: number,
  realAway: number
) {
  const picks = await getAllPicksForMatch(matchId);
  const batch = writeBatch(db);
  for (const pick of picks) {
    const pts = calculateMatchPoints(pick.homeScore, pick.awayScore, realHome, realAway);
    batch.update(doc(db, "picks", pick.id), { points: pts });
  }
  await batch.commit();
}

// ─── STANDINGS DE GRUPO ───────────────────────────────────────────────────────
export async function deletePick(userId: string, matchId: string): Promise<void> {
  // Guard: cannot delete a pick after the match has kicked off or been locked
  const match = await getDoc(doc(db, "matches", matchId));
  const data = match.data();
  if (data?.locked) throw new Error("Este partido ya no acepta cambios.");
  const kickoff = data?.matchDate?.toDate?.();
  if (kickoff && new Date() >= kickoff) {
    throw new Error("Este partido ya empezó — no se puede eliminar la apuesta.");
  }
  const existing = await getDocs(
    query(collection(db, "picks"), where("userId", "==", userId), where("matchId", "==", matchId))
  );
  if (!existing.empty) {
    await deleteDoc(doc(db, "picks", existing.docs[0].id));
  }
}

export async function submitGroupPick(
  userId: string,
  group: string,
  firstPlace: string,
  secondPlace: string,
  thirdPlace?: string
) {
  const existing = await getDocs(
    query(
      collection(db, "groupPicks"),
      where("userId", "==", userId),
      where("group", "==", group)
    )
  );
  const data = { userId, group, firstPlace, secondPlace, thirdPlace: thirdPlace || "", points: null };
  if (!existing.empty) {
    await updateDoc(doc(db, "groupPicks", existing.docs[0].id), data);
  } else {
    await addDoc(collection(db, "groupPicks"), { ...data, createdAt: Timestamp.now() });
  }
}

export async function getUserGroupPicks(userId: string): Promise<GroupPick[]> {
  const snap = await getDocs(
    query(collection(db, "groupPicks"), where("userId", "==", userId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as GroupPick));
}

export async function setGroupStanding(standing: Omit<GroupStanding, "id">) {
  await setDoc(doc(db, "groupStandings", standing.group), standing);
  await recalculateGroupPicks(standing);
}

async function recalculateGroupPicks(standing: Omit<GroupStanding, "id">) {
  const picks = await getDocs(
    query(collection(db, "groupPicks"), where("group", "==", standing.group))
  );
  const batch = writeBatch(db);
  for (const d of picks.docs) {
    const pick = d.data() as GroupPick;
    let pts = 0;
    if (pick.firstPlace === standing.firstPlace) pts += 1;
    if (pick.secondPlace === standing.secondPlace) pts += 1;
    if (pick.thirdPlace && standing.thirdPlaces.includes(pick.thirdPlace)) pts += 1;
    batch.update(doc(db, "groupPicks", d.id), { points: pts });
  }
  await batch.commit();
}

// ─── RANKING ──────────────────────────────────────────────────────────────────
export interface RankingEntry {
  uid: string;
  displayName: string;
  totalPoints: number;
  matchPoints: number;
  groupPoints: number;
  championPoints: number;
  topScorerPoints: number;
  picksCount: number;
  exactCount: number;   // picks worth 5 pts (exact score)
  resultCount: number;  // picks with correct result (2-4 pts, non-exact)
  partialCount: number; // picks worth 1 pt (correct goals only)
  hasPaid: boolean;
  phasePoints: Record<string, number>;
}

export async function getRanking(): Promise<RankingEntry[]> {
  const [users, picks, groupPicks, matchesSnap] = await Promise.all([
    getAllUsers(),
    getDocs(collection(db, "picks")),
    getDocs(collection(db, "groupPicks")),
    getDocs(collection(db, "matches")),
  ]);

  const allPicks = picks.docs.map((d) => d.data() as Pick);
  const allGroupPicks = groupPicks.docs.map((d) => d.data() as GroupPick);
  const allMatches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Match));

  // Leer resultados de campeón/goleador
  const settingsSnap = await getDoc(doc(db, "settings", "tournament"));
  const settings = settingsSnap.exists() ? settingsSnap.data() : {};

  return users
    .map((u) => {
      const userPicks = allPicks.filter((p) => p.userId === u.uid && p.points !== null);
      const userGroupPicks = allGroupPicks.filter((p) => p.userId === u.uid && p.points !== null);

      const matchPoints = userPicks.reduce((s, p) => s + (p.points ?? 0), 0);
      const groupPoints = userGroupPicks.reduce((s, p) => s + (p.points ?? 0), 0);
      const championPoints = settings.champion && u.champion === settings.champion ? 15 : 0;
      const topScorerPoints = settings.topScorer && u.topScorer === settings.topScorer ? 10 : 0;

      const PHASES: [string, string][] = [
        ["Grupos", "Fase de Grupos"],
        ["Octavos", "Octavos de Final"],
        ["Cuartos", "Cuartos de Final"],
        ["Semis", "Semifinal"],
        ["Final", "Final"],
        ["3er Puesto", "Tercer Puesto"],
      ];
      const phasePoints: Record<string, number> = {};
      for (const [label, roundStr] of PHASES) {
        const pts = userPicks
          .filter((p) => {
            const match = allMatches.find((m) => m.id === p.matchId);
            return match && (match.round === roundStr || (match.round as string).startsWith(roundStr));
          })
          .reduce((s, p) => s + (p.points ?? 0), 0);
        if (pts > 0) phasePoints[label] = pts;
      }

      return {
        uid: u.uid,
        displayName: u.displayName,
        matchPoints,
        groupPoints,
        championPoints,
        topScorerPoints,
        totalPoints: matchPoints + groupPoints + championPoints + topScorerPoints,
        picksCount: userPicks.length,
        exactCount: userPicks.filter((p) => p.points !== null && p.points !== undefined && (p.points ?? 0) >= 5).length,
        resultCount: userPicks.filter((p) => p.points !== null && p.points !== undefined && (p.points ?? 0) >= 2 && (p.points ?? 0) < 5).length,
        partialCount: userPicks.filter((p) => p.points !== null && p.points !== undefined && ((p.points ?? 0) === 1 || (p.points ?? 0) === 3)).length,
        hasPaid: u.hasPaid ?? false,
        phasePoints,
      };
    })
    .sort((a, b) => {
      // 1st: total points
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      // 2nd: most exact scores (5 pts)
      if (b.exactCount !== a.exactCount) return b.exactCount - a.exactCount;
      // 3rd: most correct results (3 pts)
      if (b.resultCount !== a.resultCount) return b.resultCount - a.resultCount;
      // 4th: most partial goals (1 pt)
      return b.partialCount - a.partialCount;
    });
}

export function onRankingChange(cb: (ranking: RankingEntry[]) => void) {
  return onSnapshot(collection(db, "picks"), async () => {
    const ranking = await getRanking();
    cb(ranking);
  });
}

export async function setTournamentResult(field: "champion" | "topScorer", value: string) {
  await setDoc(doc(db, "settings", "tournament"), { [field]: value }, { merge: true });
}

export async function getTournamentSettings() {
  const snap = await getDoc(doc(db, "settings", "tournament"));
  return snap.exists() ? snap.data() : {};
}

// ─── PUNTUACIÓN (re-exportada desde scoring.ts) ───────────────────────────────
export function calculateMatchPoints(
  predHome: number,
  predAway: number,
  realHome: number,
  realAway: number
): number {
  if (predHome === realHome && predAway === realAway) return 5; // Marcador exacto

  let pts = 0;
  const predResult = Math.sign(predHome - predAway);
  const realResult = Math.sign(realHome - realAway);
  if (predResult === realResult) pts += 2; // Resultado correcto

  // Goles acertados (1 pt por cada gol del equipo correcto acertado)
  if (predHome === realHome) pts += 1;
  if (predAway === realAway) pts += 1;

  // Si acertamos marcador exacto ya retornamos 5, aquí los puntos parciales
  // no deben superar 4 (para que el exacto siempre valga más)
  return pts;
}

export async function sendUserPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// Delete user: removes Firestore profile + all picks
// Note: Firebase Auth account stays but is unusable without a profile
export async function deleteUserData(uid: string): Promise<void> {
  const batch = writeBatch(db);

  // Delete user profile
  batch.delete(doc(db, "users", uid));

  // Delete all picks
  const picksSnap = await getDocs(query(collection(db, "picks"), where("userId", "==", uid)));
  picksSnap.docs.forEach(d => batch.delete(d.ref));

  await batch.commit();
}

// Toggle admin status
export async function toggleUserAdmin(uid: string, isAdmin: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid), { isAdmin: !isAdmin });
}

export { Timestamp };

