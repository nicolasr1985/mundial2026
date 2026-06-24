// lib/group-standings-calc.ts
// Shared logic for computing group standings — used by both the standings page (display)
// and firebase.ts (auto-award group bonus points when admin saves the official standing).

import type { Match } from "./firebase";
import { getFifaRank } from "./fifa-ranking";

export interface TeamStat {
  team: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  yellow: number;
  red: number;       // direct red
  yellowRed: number; // indirect red (2nd yellow)
}

function conductScore(s: TeamStat): number {
  return s.yellow * (-1) + s.yellowRed * (-3) + s.red * (-4);
}

function headToHead(teams: string[], allMatches: Match[]): Record<string, { pts: number; gd: number; gf: number }> {
  const teamSet = new Set(teams);
  const h2h: Record<string, { pts: number; gd: number; gf: number }> = {};
  for (const t of teams) h2h[t] = { pts: 0, gd: 0, gf: 0 };
  for (const m of allMatches) {
    if (!teamSet.has(m.homeTeam) || !teamSet.has(m.awayTeam)) continue;
    if (m.homeScore === null || m.awayScore === null) continue;
    const hs = m.homeScore, as_ = m.awayScore;
    h2h[m.homeTeam].gf += hs; h2h[m.homeTeam].gd += hs - as_;
    h2h[m.awayTeam].gf += as_; h2h[m.awayTeam].gd += as_ - hs;
    if (hs > as_)      { h2h[m.homeTeam].pts += 3; }
    else if (hs < as_) { h2h[m.awayTeam].pts += 3; }
    else               { h2h[m.homeTeam].pts += 1; h2h[m.awayTeam].pts += 1; }
  }
  return h2h;
}

/**
 * Compute group standings table from a set of matches.
 * - `matches`: matches with results to count (finished or predicted)
 * - `allMatches`: all matches of every group (used to identify teams that exist in a group)
 */
export function computeGroupStandings(
  matches: Match[],
  allMatches: Match[]
): Record<string, TeamStat[]> {
  const standings: Record<string, Record<string, TeamStat>> = {};
  for (const m of allMatches) {
    if (!m.group) continue;
    const g = m.group;
    if (!standings[g]) standings[g] = {};
    if (!standings[g][m.homeTeam]) standings[g][m.homeTeam] = { team: m.homeTeam, group: g, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, yellow: 0, red: 0, yellowRed: 0 };
    if (!standings[g][m.awayTeam]) standings[g][m.awayTeam] = { team: m.awayTeam, group: g, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, yellow: 0, red: 0, yellowRed: 0 };
  }
  for (const m of matches) {
    if (!m.group || m.homeScore === null || m.awayScore === null) continue;
    const g = m.group;
    if (!standings[g]) continue;
    const home = standings[g][m.homeTeam];
    const away = standings[g][m.awayTeam];
    if (!home || !away) continue;
    const hs = Number(m.homeScore), as_ = Number(m.awayScore);
    if (isNaN(hs) || isNaN(as_)) continue;
    home.played++; away.played++;
    home.gf += hs; home.ga += as_; home.gd = home.gf - home.ga;
    away.gf += as_; away.ga += hs; away.gd = away.gf - away.ga;
    if (hs > as_)      { home.won++; home.points += 3; away.lost++; }
    else if (hs < as_) { away.won++; away.points += 3; home.lost++; }
    else               { home.drawn++; away.drawn++; home.points++; away.points++; }
    home.yellow += m.homeYellow ?? 0; home.red += m.homeRed ?? 0; home.yellowRed += (m as any).homeYellowRed ?? 0;
    away.yellow += m.awayYellow ?? 0; away.red += m.awayRed ?? 0; away.yellowRed += (m as any).awayYellowRed ?? 0;
  }
  const result: Record<string, TeamStat[]> = {};
  for (const g in standings) {
    const teams = Object.values(standings[g]);
    const groupFinishedMatches = allMatches.filter(m => m.group === g && m.homeScore !== null);

    result[g] = teams.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const tiedGroup = teams.filter(t => t.points === a.points).map(t => t.team);
      if (tiedGroup.includes(b.team)) {
        const h2h = headToHead(tiedGroup, groupFinishedMatches);
        const h2hPts = h2h[b.team].pts - h2h[a.team].pts;
        if (h2hPts !== 0) return h2hPts;
        const h2hGD = h2h[b.team].gd - h2h[a.team].gd;
        if (h2hGD !== 0) return h2hGD;
        const h2hGF = h2h[b.team].gf - h2h[a.team].gf;
        if (h2hGF !== 0) return h2hGF;
      }
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      const fpDiff = conductScore(b) - conductScore(a);
      if (fpDiff !== 0) return fpDiff;
      return getFifaRank(a.team) - getFifaRank(b.team);
    });
  }
  return result;
}
