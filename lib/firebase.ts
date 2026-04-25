// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
} from "firebase/auth";
import {
  initializeFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  updateDoc,
  addDoc,
  Timestamp,
  onSnapshot,
  writeBatch,
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
  champion?: string;   // equipo campeón pronosticado
  topScorer?: string;  // goleador pronosticado
  championLocked?: boolean;
  topScorerLocked?: boolean;
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  matchDate: Timestamp;
  round: string; // "Fase de Grupos - Grupo A", "Octavos", "Cuartos", etc.
  group?: string; // Solo para fase de grupos
  status: "upcoming" | "live" | "finished";
  locked: boolean; // true = no más apuestas
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
  const deadline = new Date("2026-06-09T23:59:59");
  if (new Date() > deadline) throw new Error("La fecha límite para estas predicciones ya pasó.");
  await setDoc(doc(db, "users", uid), { champion, topScorer }, { merge: true });
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
  awayScore: number
) {
  await updateDoc(doc(db, "matches", matchId), {
    homeScore,
    awayScore,
    status: "finished",
    locked: true,
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
  if (match.data()?.locked) throw new Error("Este partido ya no acepta apuestas.");

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
  exactCount: number;
}

export async function getRanking(): Promise<RankingEntry[]> {
  const [users, picks, groupPicks] = await Promise.all([
    getAllUsers(),
    getDocs(collection(db, "picks")),
    getDocs(collection(db, "groupPicks")),
  ]);

  const allPicks = picks.docs.map((d) => d.data() as Pick);
  const allGroupPicks = groupPicks.docs.map((d) => d.data() as GroupPick);

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

      return {
        uid: u.uid,
        displayName: u.displayName,
        matchPoints,
        groupPoints,
        championPoints,
        topScorerPoints,
        totalPoints: matchPoints + groupPoints + championPoints + topScorerPoints,
        picksCount: userPicks.length,
        exactCount: userPicks.filter((p) => p.points === 5).length,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);
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
  if (predResult === realResult) pts += 3; // Resultado correcto

  // Goles acertados (1 pt por cada gol del equipo correcto acertado)
  if (predHome === realHome) pts += 1;
  if (predAway === realAway) pts += 1;

  // Si acertamos marcador exacto ya retornamos 5, aquí los puntos parciales
  // no deben superar 4 (para que el exacto siempre valga más)
  return Math.min(pts, 4);
}

export { Timestamp };
