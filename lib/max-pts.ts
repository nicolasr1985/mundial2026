// lib/max-pts.ts
// Single source of truth for computing each user's maximum achievable points.
// Consumed by dashboard (Ranking table) and admin (WhatsApp summary).

import type { Match, Pick, UserProfile } from "./firebase";

interface GroupPick {
  userId: string;
  group: string;
  firstPlace?: string;
  secondPlace?: string;
  thirdPlace?: string;
  points?: number | null;
}

interface ComputeMaxPtsInput {
  users: UserProfile[];
  allPicks: Pick[];
  allGroupPicks: GroupPick[];
  allMatches: Match[];
  savedGroupIds: string[];            // group letters whose official standing has been saved
  settingsChampion?: string;
  settingsTopScorer?: string;
  eliminatedTeams: Set<string>;
}

const KNOCKOUT_ROUNDS = new Set([
  "Ronda de 32", "Octavos de Final", "Cuartos de Final", "Semifinal", "Tercer Puesto", "Final",
]);

const EXPECTED_KNOCKOUT_COUNTS: Record<string, number> = {
  "Ronda de 32": 16,
  "Octavos de Final": 8,
  "Cuartos de Final": 4,
  "Semifinal": 2,
  "Tercer Puesto": 1,
  "Final": 1,
};

// Compute the maximum achievable points map: uid → max pts.
export function computeMaxPointsMap(input: ComputeMaxPtsInput): Record<string, number> {
  const { users, allPicks, allGroupPicks, allMatches, savedGroupIds, settingsChampion, settingsTopScorer, eliminatedTeams } = input;
  const championDecided = !!settingsChampion;
  const topScorerDecided = !!settingsTopScorer;

  const ALL_GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  const savedSet = new Set(savedGroupIds);
  const unsavedGroupCount = ALL_GROUPS.filter(g => !savedSet.has(g)).length;

  const liveMatchIds = new Set(
    allMatches.filter(m => m.status === "live" && m.homeScore !== null && m.awayScore !== null).map(m => m.id)
  );

  const calcPts = (ph: number, pa: number, rh: number, ra: number): number => {
    if (ph === rh && pa === ra) return 5;
    let pts = 0;
    if (Math.sign(ph - pa) === Math.sign(rh - ra)) pts += 2;
    if (ph === rh) pts += 1;
    if (pa === ra) pts += 1;
    return pts;
  };
  const liveAchievable = (ph: number, pa: number, lh: number, la: number): number => {
    let best = 0;
    const horizon = 10;
    for (let fh = lh; fh <= lh + horizon; fh++) {
      for (let fa = la; fa <= la + horizon; fa++) {
        const pts = calcPts(ph, pa, fh, fa);
        if (pts > best) best = pts;
        if (best === 5) return 5;
      }
    }
    return best;
  };

  const maxMap: Record<string, number> = {};
  for (const usr of users) {
    const lockedMatchPts = allPicks
      .filter(p => p.userId === usr.uid && p.points !== null && p.points !== undefined && !liveMatchIds.has(p.matchId))
      .reduce((s, p) => s + (p.points ?? 0), 0);
    const lockedGroupPts = allGroupPicks
      .filter(p => p.userId === usr.uid && p.points !== null && p.points !== undefined)
      .reduce((s, p) => s + (p.points ?? 0), 0);
    const lockedChampionPts = settingsChampion && usr.champion === settingsChampion ? 15 : 0;
    const lockedTopScorerPts = settingsTopScorer && usr.topScorer === settingsTopScorer ? 10 : 0;

    let groupPending = 0;
    for (const m of allMatches) {
      if (!m.group) continue;
      if (m.status === "finished") continue;
      if (m.status === "live") continue;
      const pick = allPicks.find(p => p.userId === usr.uid && p.matchId === m.id);
      if (pick && pick.points !== null && pick.points !== undefined) continue;
      groupPending++;
    }

    let knockoutPending = 0;
    for (const round of Object.keys(EXPECTED_KNOCKOUT_COUNTS)) {
      const expected = EXPECTED_KNOCKOUT_COUNTS[round];
      const finishedInRound = allMatches.filter(m => m.round === round && m.status === "finished").length;
      const liveInRound = allMatches.filter(m => m.round === round && m.status === "live" && m.homeScore !== null && m.awayScore !== null).length;
      knockoutPending += Math.max(0, expected - finishedInRound - liveInRound);
    }

    let liveMax = 0;
    for (const m of allMatches) {
      if (m.status !== "live") continue;
      if (m.homeScore === null || m.awayScore === null) continue;
      const pick = allPicks.find(p => p.userId === usr.uid && p.matchId === m.id);
      if (!pick) continue;
      liveMax += liveAchievable(pick.homeScore, pick.awayScore, m.homeScore, m.awayScore);
    }

    const pendingMatchMax = (groupPending + knockoutPending) * 5 + liveMax;
    const pendingGroupMax = unsavedGroupCount * 3;
    const pendingChampionMax = !championDecided && usr.champion && !eliminatedTeams.has(usr.champion) ? 15 : 0;
    const pendingTopScorerMax = !topScorerDecided && usr.topScorer ? 10 : 0;

    maxMap[usr.uid] =
      lockedMatchPts + lockedGroupPts + lockedChampionPts + lockedTopScorerPts +
      pendingMatchMax + pendingGroupMax + pendingChampionMax + pendingTopScorerMax;
  }
  return maxMap;
}

// Compute the set of users who cannot mathematically reach top 3 based on remaining events.
// Approach: for each user B, count rivals X such that maxAdvantage(B, X) < X.total - B.total,
// i.e. B cannot catch X under any outcome of the remaining events. If ≥3 rivals meet that condition,
// B is eliminated (they will always finish 4th or lower).
export function computeEliminatedUsers(input: ComputeMaxPtsInput & {
  totals: Record<string, number>;  // uid → current totalPoints
}): Set<string> {
  const { users, allPicks, allGroupPicks, allMatches, savedGroupIds, settingsChampion, settingsTopScorer, eliminatedTeams, totals } = input;
  const ALL_GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  const savedSet = new Set(savedGroupIds);

  // Precompute per-user match pick map for speed.
  const pickByUserMatch: Record<string, Pick> = {};
  for (const p of allPicks) pickByUserMatch[`${p.userId}::${p.matchId}`] = p;
  const gpByUserGroup: Record<string, GroupPick> = {};
  for (const p of allGroupPicks) gpByUserGroup[`${p.userId}::${p.group}`] = p;

  const pairMaxAdv = (bUid: string, xUid: string): number => {
    const bUser = users.find(u => u.uid === bUid);
    const xUser = users.find(u => u.uid === xUid);
    if (!bUser || !xUser) return Infinity;
    let adv = 0;

    // Existing (not-finished) matches
    for (const m of allMatches) {
      if (m.status === "finished") continue;
      const pB = pickByUserMatch[`${bUid}::${m.id}`];
      const pX = pickByUserMatch[`${xUid}::${m.id}`];
      // If picks still open (upcoming + not locked), both users can still submit different scores
      const stillOpen = m.status === "upcoming" && !m.locked;
      if (!pB && !pX) { if (stillOpen) adv += 5; continue; }
      if (!pB && pX) { if (stillOpen) adv += 5; continue; }
      if (pB && !pX) { adv += 5; continue; }
      if (pB.homeScore === pX.homeScore && pB.awayScore === pX.awayScore) continue;
      adv += 5;
    }

    // Not-yet-created knockout matches → safe upper bound of 5 each
    for (const [round, expected] of Object.entries(EXPECTED_KNOCKOUT_COUNTS)) {
      const existing = allMatches.filter(m => m.round === round).length;
      const missing = Math.max(0, expected - existing);
      adv += missing * 5;
    }

    // Group picks
    for (const g of ALL_GROUPS) {
      if (savedSet.has(g)) continue;
      const gpB = gpByUserGroup[`${bUid}::${g}`];
      const gpX = gpByUserGroup[`${xUid}::${g}`];
      if (!gpB && !gpX) continue;
      if (!gpB && gpX) continue;
      if (gpB && !gpX) { adv += 3; continue; }
      let diff = 0;
      if (gpB.firstPlace !== gpX.firstPlace) diff++;
      if (gpB.secondPlace !== gpX.secondPlace) diff++;
      if ((gpB.thirdPlace ?? "") !== (gpX.thirdPlace ?? "")) diff++;
      adv += diff;
    }

    // Champion
    if (!settingsChampion) {
      const cB = bUser.champion;
      const cX = xUser.champion;
      if (cB && cX && cB === cX) {
        // same pick → both hit or both miss → no gain
      } else if (!cB && !cX) {
        adv += 15;
      } else if (cB && !cX) {
        if (!eliminatedTeams.has(cB)) adv += 15;
      } else if (!cB && cX) {
        adv += 15;
      } else if (cB) {
        if (!eliminatedTeams.has(cB)) adv += 15;
      }
    }

    // Top scorer (we don't track top scorer eliminations, assume always live)
    if (!settingsTopScorer) {
      const tB = bUser.topScorer;
      const tX = xUser.topScorer;
      if (tB && tX && tB === tX) {
        // same → no gain
      } else {
        adv += 10;
      }
    }

    return adv;
  };

  const eliminatedUsers = new Set<string>();
  for (const B of users) {
    let cannotPass = 0;
    for (const X of users) {
      if (X.uid === B.uid) continue;
      const gap = (totals[X.uid] ?? 0) - (totals[B.uid] ?? 0);
      if (gap <= 0) continue;
      const maxAdv = pairMaxAdv(B.uid, X.uid);
      if (maxAdv < gap) cannotPass++;
    }
    if (cannotPass >= 3) eliminatedUsers.add(B.uid);
  }
  return eliminatedUsers;
}

// Compute best and worst possible final position for each user.
// bestPos = min rank achievable (1 = 1st). worstPos = max rank achievable.
export function computePositionRanges(input: ComputeMaxPtsInput & { totals: Record<string, number> }): Record<string, { best: number; worst: number }> {
  const { users, allPicks, allGroupPicks, allMatches, savedGroupIds, settingsChampion, settingsTopScorer, eliminatedTeams, totals } = input;
  const ALL_GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  const savedSet = new Set(savedGroupIds);

  const pickByUserMatch: Record<string, Pick> = {};
  for (const p of allPicks) pickByUserMatch[`${p.userId}::${p.matchId}`] = p;
  const gpByUserGroup: Record<string, GroupPick> = {};
  for (const p of allGroupPicks) gpByUserGroup[`${p.userId}::${p.group}`] = p;

  const pairAdv = (bUid: string, xUid: string): number => {
    const bUser = users.find(u => u.uid === bUid);
    const xUser = users.find(u => u.uid === xUid);
    if (!bUser || !xUser) return 0;
    let adv = 0;
    for (const m of allMatches) {
      if (m.status === "finished") continue;
      const pB = pickByUserMatch[`${bUid}::${m.id}`];
      const pX = pickByUserMatch[`${xUid}::${m.id}`];
      const stillOpen = m.status === "upcoming" && !m.locked;
      if (!pB && !pX) { if (stillOpen) adv += 5; continue; }
      if (!pB && pX) { if (stillOpen) adv += 5; continue; }
      if (pB && !pX) { adv += 5; continue; }
      if (pB.homeScore === pX.homeScore && pB.awayScore === pX.awayScore) continue;
      adv += 5;
    }
    for (const [round, expected] of Object.entries(EXPECTED_KNOCKOUT_COUNTS)) {
      const existing = allMatches.filter(m => m.round === round).length;
      adv += Math.max(0, expected - existing) * 5;
    }
    for (const g of ALL_GROUPS) {
      if (savedSet.has(g)) continue;
      const gpB = gpByUserGroup[`${bUid}::${g}`];
      const gpX = gpByUserGroup[`${xUid}::${g}`];
      if (!gpB && !gpX) continue;
      if (!gpB && gpX) continue;
      if (gpB && !gpX) { adv += 3; continue; }
      let diff = 0;
      if (gpB.firstPlace !== gpX.firstPlace) diff++;
      if (gpB.secondPlace !== gpX.secondPlace) diff++;
      if ((gpB.thirdPlace ?? "") !== (gpX.thirdPlace ?? "")) diff++;
      adv += diff;
    }
    if (!settingsChampion) {
      const cB = bUser.champion, cX = xUser.champion;
      if (cB && cX && cB === cX) {}
      else if (!cB && !cX) adv += 15;
      else if (cB && !cX) { if (!eliminatedTeams.has(cB)) adv += 15; }
      else if (!cB && cX) adv += 15;
      else if (cB) { if (!eliminatedTeams.has(cB)) adv += 15; }
    }
    if (!settingsTopScorer) {
      const tB = bUser.topScorer, tX = xUser.topScorer;
      if (!(tB && tX && tB === tX)) adv += 10;
    }
    return adv;
  };

  const result: Record<string, { best: number; worst: number }> = {};
  for (const u of users) {
    const uTotal = totals[u.uid] ?? 0;
    let definitelyAbove = 0;   // rivals U cannot catch → contribute to U's best position
    let couldOvertakeU = 0;    // rivals that could end above U → contribute to U's worst position
    for (const x of users) {
      if (x.uid === u.uid) continue;
      const xTotal = totals[x.uid] ?? 0;
      const uToX = pairAdv(u.uid, x.uid);
      const xToU = pairAdv(x.uid, u.uid);
      if (uTotal + uToX < xTotal) definitelyAbove++;
      if (xTotal + xToU > uTotal) couldOvertakeU++;
    }
    result[u.uid] = { best: definitelyAbove + 1, worst: couldOvertakeU + 1 };
  }
  return result;
}

export function computeEliminatedTeams(allMatches: Match[]): Set<string> {
  const elimSet = new Set<string>();
  for (const m of allMatches) {
    if (!KNOCKOUT_ROUNDS.has(m.round)) continue;
    if (m.status !== "finished") continue;
    if (m.homeScore === null || m.awayScore === null) continue;
    if (m.homeScore > m.awayScore) elimSet.add(m.awayTeam);
    else if (m.awayScore > m.homeScore) elimSet.add(m.homeTeam);
    else {
      if (m.penaltyWinner === "home") elimSet.add(m.awayTeam);
      else if (m.penaltyWinner === "away") elimSet.add(m.homeTeam);
    }
  }
  const r32Matches = allMatches.filter(m => m.round === "Ronda de 32");
  if (r32Matches.length >= 16) {
    const r32Teams = new Set<string>();
    for (const m of r32Matches) { r32Teams.add(m.homeTeam); r32Teams.add(m.awayTeam); }
    for (const m of allMatches) {
      if (!m.group) continue;
      if (!r32Teams.has(m.homeTeam)) elimSet.add(m.homeTeam);
      if (!r32Teams.has(m.awayTeam)) elimSet.add(m.awayTeam);
    }
  }
  return elimSet;
}
