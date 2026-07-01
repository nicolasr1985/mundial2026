// app/standings/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getMatches, getUserPicks, getAllUsers, getAllGroupStandings, Match, UserProfile } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { teamWithRank, canSeeRanking, getFifaRank, FIFA_RANKINGS } from "@/lib/fifa-ranking";
import { WC2026_TEAMS } from "@/lib/wc2026-data";

interface TeamStat {
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

interface R32Match {
  slot: string;
  homeDesc: string;
  awayDesc: string;
  homeTeam?: string;
  awayTeam?: string;
  isTBD?: boolean;
  awayIsThird?: boolean;   // true = away slot is a 3rd-place team
  awayThirdGroups?: string; // eligible groups for this 3rd slot
  homeGroupDone?: boolean;  // true = home team's group finished all 3 matches
  awayGroupDone?: boolean;  // true = away team's group finished all 3 matches
  // Score and advancement info (set after enrichment with actual R32 match data)
  displayHomeScore?: number | null;  // score shown in the bracket (real or user pick depending on view)
  displayAwayScore?: number | null;
  realWinner?: string;       // team name that actually advances (always based on real result)
  isFinished?: boolean;      // whether the actual R32 match is finished
  wonOnPenalties?: boolean;  // true when winner advanced via penalty shootout
  penaltyHome?: number | null;  // penalty shootout score for home team (in slot order)
  penaltyAway?: number | null;  // penalty shootout score for away team (in slot order)
}

// ─── STANDINGS CALCULATOR ────────────────────────────────────────────────────
// FIFA fair play score: yellow=-1, indirect red (2nd yellow)=-3, direct red=-4, yellow+direct red=-5
// We track: yellow, yellowRed (indirect), red (direct)
// yellow+red direct = player got yellow then direct red in same match — stored as yellow=1,red=1
// For simplicity: conductScore = yellow*(-1) + yellowRed*(-3) + red*(-4)
// Higher is better (less negative)
function conductScore(s: TeamStat): number {
  return s.yellow * (-1) + s.yellowRed * (-3) + s.red * (-4);
}

// Head-to-head stats between a subset of teams using only matches among them
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

// FIFA tiebreaker order (group stage):
// 1) Points  2-4) Head-to-head pts/GD/GF  5) GD  6) GF  7) Fair play  8) FIFA ranking
// 4) Conduct score (not tracked — skipped)
// 5-6) FIFA ranking (lower rank number = better)
function fifaRankOf(team: string): number {
  const FIFA_RANK: Record<string, number> = {
    "France":1,"Spain":2,"Argentina":3,"England":4,"Portugal":5,"Brazil":6,
    "Netherlands":7,"Morocco":8,"Belgium":9,"Germany":10,"Croatia":11,
    "Colombia":12,"Senegal":13,"Italy":14,"Mexico":15,"United States":16,
    "Uruguay":17,"Japan":18,"Switzerland":19,"Iran":20,"Turkey":22,
    "Ecuador":23,"Austria":24,"South Korea":25,"Australia":27,"Algeria":28,
    "Egypt":29,"Canada":30,"Norway":31,"Panama":33,"Ivory Coast":34,
    "Sweden":37,"Czechia":38,"Paraguay":41,"Scotland":43,"Tunisia":44,
    "Congo DR":46,"Uzbekistan":49,"Qatar":55,"Iraq":57,"South Africa":59,
    "Saudi Arabia":61,"Bosnia and Herzegovina":63,"Jordan":64,"Cape Verde":68,
    "Ghana":73,"Curacao":82,"Haiti":83,"New Zealand":85,
  };
  return FIFA_RANK[team] ?? 999;
}

function computeGroupStandings(
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
    // Accumulate cards: yellow, yellowRed (indirect/2nd yellow), red (direct)
    home.yellow += m.homeYellow ?? 0; home.red += m.homeRed ?? 0; home.yellowRed += (m as any).homeYellowRed ?? 0;
    away.yellow += m.awayYellow ?? 0; away.red += m.awayRed ?? 0; away.yellowRed += (m as any).awayYellowRed ?? 0;
  }
  const result: Record<string, TeamStat[]> = {};
  for (const g in standings) {
    const teams = Object.values(standings[g]);
    const groupFinishedMatches = allMatches.filter(m => m.group === g && m.homeScore !== null);

    // FIFA sort with full tiebreaker
    result[g] = teams.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      // Head-to-head among tied teams
      const tiedWithA = teams.filter(t => t.team !== a.team && t.points === a.points);
      const tiedWithB = teams.filter(t => t.team !== b.team && t.points === b.points);
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
      // Overall GD, GF
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      // Fair play
      const fpDiff = conductScore(b) - conductScore(a);
      if (fpDiff !== 0) return fpDiff;
      // FIFA ranking
      return fifaRankOf(a.team) - fifaRankOf(b.team);
    });
  }
  return result;
}

function getThirdPlaceTable(standings: Record<string, TeamStat[]>): (TeamStat & { qualifies: boolean })[] {
  const thirds: TeamStat[] = [];
  for (const g in standings) {
    if (standings[g].length >= 3) thirds.push(standings[g][2]);
  }
  const sorted = thirds.sort((a, b) =>
    b.points - a.points ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    conductScore(b) - conductScore(a) ||
    fifaRankOf(a.team) - fifaRankOf(b.team)
  );
  return sorted.map((t, i) => ({ ...t, qualifies: i < 8 }));
}

// ─── R32 BRACKET BUILDER ─────────────────────────────────────────────────────
function buildR32(standings: Record<string, TeamStat[]>, allGroupMatches?: Match[], confirmedThirdTeams?: Set<string>): R32Match[] {
  const get = (pos: number, group: string): string | undefined => {
    const teams = standings[group];
    if (!teams || teams.length < pos) return undefined;
    return teams[pos - 1]?.team;
  };

  // A group is "done" when all 3 of its matches are finished
  const groupDone: Record<string, boolean> = {};
  if (allGroupMatches) {
    const byGroup: Record<string, Match[]> = {};
    for (const m of allGroupMatches) {
      if (!m.group) continue;
      if (!byGroup[m.group]) byGroup[m.group] = [];
      byGroup[m.group].push(m);
    }
    for (const g in byGroup) {
      const total = byGroup[g].length;
      const finished = byGroup[g].filter(m => m.status === "finished" && m.homeScore !== null).length;
      groupDone[g] = total > 0 && finished === total;
    }
  }

  // Get the 8 qualifying thirds and their groups
  const thirds = getThirdPlaceTable(standings);
  const qualifyingThirdGroups = thirds.filter(t => t.qualifies).map(t => t.group).sort();
  const key = qualifyingThirdGroups.join("");

  // Assign thirds to slots based on FIFA lookup table
  // We implement the most important rule: thirds go to specific slots based on their group
  const thirdAssignments = assignThirds(qualifyingThirdGroups, thirds);

  // Thirds are "confirmed" (gold + bold) when EITHER:
  //  (a) admin has saved the team in a group standing's thirdPlaces list (authoritative), OR
  //  (b) all 12 groups have finished and the FIFA exact lookup is available.
  // Resolved per-team so each slot confirms independently as admin saves groups.
  const allGroupsDone = ["A","B","C","D","E","F","G","H","I","J","K","L"].every(g => !!groupDone[g]);
  const exactLookupReady = allGroupsDone && qualifyingThirdGroups.length === 8 && !!FIFA_R32_LOOKUP[key];
  const isThirdConfirmed = (team: string | undefined): boolean => {
    if (!team) return false;
    if (confirmedThirdTeams?.has(team)) return true;
    return exactLookupReady;
  };

  return [
    // LEFT SIDE — top to bottom
    { slot: "R32-1",  homeDesc: "1° Grupo E",  awayDesc: "3° (A/B/C/D/F)", homeTeam: get(1,"E"), awayTeam: thirdAssignments["ABCDF"], awayIsThird: true, awayThirdGroups: "ABCDF", isTBD: !thirdAssignments["ABCDF"], homeGroupDone: groupDone["E"], awayGroupDone: isThirdConfirmed(thirdAssignments["ABCDF"]) },
    { slot: "R32-2",  homeDesc: "1° Grupo I",  awayDesc: "3° (C/D/F/G/H)", homeTeam: get(1,"I"), awayTeam: thirdAssignments["CDFGH"], awayIsThird: true, awayThirdGroups: "CDFGH", isTBD: !thirdAssignments["CDFGH"], homeGroupDone: groupDone["I"], awayGroupDone: isThirdConfirmed(thirdAssignments["CDFGH"]) },
    { slot: "R32-3",  homeDesc: "2° Grupo A",  awayDesc: "2° Grupo B",     homeTeam: get(2,"A"), awayTeam: get(2,"B"), homeGroupDone: groupDone["A"], awayGroupDone: groupDone["B"] },
    { slot: "R32-4",  homeDesc: "1° Grupo F",  awayDesc: "2° Grupo C",     homeTeam: get(1,"F"), awayTeam: get(2,"C"), homeGroupDone: groupDone["F"], awayGroupDone: groupDone["C"] },
    { slot: "R32-5",  homeDesc: "2° Grupo K",  awayDesc: "2° Grupo L",     homeTeam: get(2,"K"), awayTeam: get(2,"L"), homeGroupDone: groupDone["K"], awayGroupDone: groupDone["L"] },
    { slot: "R32-6",  homeDesc: "1° Grupo H",  awayDesc: "2° Grupo J",     homeTeam: get(1,"H"), awayTeam: get(2,"J"), homeGroupDone: groupDone["H"], awayGroupDone: groupDone["J"] },
    { slot: "R32-7",  homeDesc: "1° Grupo D",  awayDesc: "3° (B/E/F/I/J)", homeTeam: get(1,"D"), awayTeam: thirdAssignments["BEFIJ"], awayIsThird: true, awayThirdGroups: "BEFIJ", isTBD: !thirdAssignments["BEFIJ"], homeGroupDone: groupDone["D"], awayGroupDone: isThirdConfirmed(thirdAssignments["BEFIJ"]) },
    { slot: "R32-8",  homeDesc: "1° Grupo G",  awayDesc: "3° (A/E/H/I/J)", homeTeam: get(1,"G"), awayTeam: thirdAssignments["AEHIJ"], awayIsThird: true, awayThirdGroups: "AEHIJ", isTBD: !thirdAssignments["AEHIJ"], homeGroupDone: groupDone["G"], awayGroupDone: isThirdConfirmed(thirdAssignments["AEHIJ"]) },
    // RIGHT SIDE — top to bottom
    { slot: "R32-9",  homeDesc: "1° Grupo C",  awayDesc: "2° Grupo F",     homeTeam: get(1,"C"), awayTeam: get(2,"F"), homeGroupDone: groupDone["C"], awayGroupDone: groupDone["F"] },
    { slot: "R32-10", homeDesc: "2° Grupo E",  awayDesc: "2° Grupo I",     homeTeam: get(2,"E"), awayTeam: get(2,"I"), homeGroupDone: groupDone["E"], awayGroupDone: groupDone["I"] },
    { slot: "R32-11", homeDesc: "1° Grupo A",  awayDesc: "3° (C/E/F/H/I)", homeTeam: get(1,"A"), awayTeam: thirdAssignments["CEFHI"], awayIsThird: true, awayThirdGroups: "CEFHI", isTBD: !thirdAssignments["CEFHI"], homeGroupDone: groupDone["A"], awayGroupDone: isThirdConfirmed(thirdAssignments["CEFHI"]) },
    { slot: "R32-12", homeDesc: "1° Grupo L",  awayDesc: "3° (E/H/I/J/K)", homeTeam: get(1,"L"), awayTeam: thirdAssignments["EHIJK"], awayIsThird: true, awayThirdGroups: "EHIJK", isTBD: !thirdAssignments["EHIJK"], homeGroupDone: groupDone["L"], awayGroupDone: isThirdConfirmed(thirdAssignments["EHIJK"]) },
    { slot: "R32-13", homeDesc: "1° Grupo J",  awayDesc: "2° Grupo H",     homeTeam: get(1,"J"), awayTeam: get(2,"H"), homeGroupDone: groupDone["J"], awayGroupDone: groupDone["H"] },
    { slot: "R32-14", homeDesc: "2° Grupo D",  awayDesc: "2° Grupo G",     homeTeam: get(2,"D"), awayTeam: get(2,"G"), homeGroupDone: groupDone["D"], awayGroupDone: groupDone["G"] },
    { slot: "R32-15", homeDesc: "1° Grupo B",  awayDesc: "3° (E/F/G/I/J)", homeTeam: get(1,"B"), awayTeam: thirdAssignments["EFGIJ"], awayIsThird: true, awayThirdGroups: "EFGIJ", isTBD: !thirdAssignments["EFGIJ"], homeGroupDone: groupDone["B"], awayGroupDone: isThirdConfirmed(thirdAssignments["EFGIJ"]) },
    { slot: "R32-16", homeDesc: "1° Grupo K",  awayDesc: "3° (D/E/I/J/L)", homeTeam: get(1,"K"), awayTeam: thirdAssignments["DEIJL"], awayIsThird: true, awayThirdGroups: "DEIJL", isTBD: !thirdAssignments["DEIJL"], homeGroupDone: groupDone["K"], awayGroupDone: isThirdConfirmed(thirdAssignments["DEIJL"]) },
  ];
}

const FIFA_R32_LOOKUP: Record<string, Record<string, string>> = {
  "ABCDEFGH": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "E"},
  "ABCDEFGI": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "I"},
  "ABCDEFGJ": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "J"},
  "ABCDEFGK": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "K"},
  "ABCDEFGL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "E"},
  "ABCDEFHI": {"1A": "H", "1B": "E", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "I"},
  "ABCDEFHJ": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "E"},
  "ABCDEFHK": {"1A": "H", "1B": "E", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "K"},
  "ABCDEFHL": {"1A": "H", "1B": "F", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "E"},
  "ABCDEFIJ": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "I"},
  "ABCDEFIK": {"1A": "C", "1B": "E", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABCDEFIL": {"1A": "C", "1B": "E", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABCDEFJK": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "K"},
  "ABCDEFJL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "E"},
  "ABCDEFKL": {"1A": "C", "1B": "E", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCDEGHI": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "E", "1L": "I"},
  "ABCDEGHJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "E", "1L": "J"},
  "ABCDEGHK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "E", "1L": "K"},
  "ABCDEGHL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "E"},
  "ABCDEGIJ": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "J"},
  "ABCDEGIK": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ABCDEGIL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ABCDEGJK": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "J", "1L": "K"},
  "ABCDEGJL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "J"},
  "ABCDEGKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCDEHIJ": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "E", "1L": "I"},
  "ABCDEHIK": {"1A": "H", "1B": "E", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ABCDEHIL": {"1A": "H", "1B": "E", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ABCDEHJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "E", "1L": "K"},
  "ABCDEHJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "E"},
  "ABCDEHKL": {"1A": "H", "1B": "E", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCDEIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ABCDEIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ABCDEIKL": {"1A": "E", "1B": "I", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCDEJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCDFGHI": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "I"},
  "ABCDFGHJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "J"},
  "ABCDFGHK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "K"},
  "ABCDFGHL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "H"},
  "ABCDFGIJ": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "J"},
  "ABCDFGIK": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABCDFGIL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABCDFGJK": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "J", "1L": "K"},
  "ABCDFGJL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "J"},
  "ABCDFGKL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCDFHIJ": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "I"},
  "ABCDFHIK": {"1A": "H", "1B": "F", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ABCDFHIL": {"1A": "H", "1B": "F", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ABCDFHJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "K"},
  "ABCDFHJL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "H"},
  "ABCDFHKL": {"1A": "H", "1B": "F", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCDFIJK": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABCDFIJL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABCDFIKL": {"1A": "C", "1B": "I", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCDFJKL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCDGHIJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "J"},
  "ABCDGHIK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ABCDGHIL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ABCDGHJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "J", "1L": "K"},
  "ABCDGHJL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "J"},
  "ABCDGHKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCDGIJK": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "I", "1L": "K"},
  "ABCDGIJL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "I"},
  "ABCDGIKL": {"1A": "I", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCDGJKL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABCDHIJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ABCDHIJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ABCDHIKL": {"1A": "H", "1B": "I", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCDHJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCDIJKL": {"1A": "I", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ABCEFGHI": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "E", "1L": "I"},
  "ABCEFGHJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "E", "1L": "J"},
  "ABCEFGHK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "E", "1L": "K"},
  "ABCEFGHL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "E"},
  "ABCEFGIJ": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "J"},
  "ABCEFGIK": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABCEFGIL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABCEFGJK": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "J", "1L": "K"},
  "ABCEFGJL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "J"},
  "ABCEFGKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCEFHIJ": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "E", "1L": "I"},
  "ABCEFHIK": {"1A": "H", "1B": "E", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABCEFHIL": {"1A": "H", "1B": "E", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABCEFHJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "E", "1L": "K"},
  "ABCEFHJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "E"},
  "ABCEFHKL": {"1A": "H", "1B": "E", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCEFIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABCEFIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABCEFIKL": {"1A": "E", "1B": "I", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCEFJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCEGHIJ": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "E", "1L": "I"},
  "ABCEGHIK": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "H", "1K": "I", "1L": "K"},
  "ABCEGHIL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "I"},
  "ABCEGHJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "E", "1L": "K"},
  "ABCEGHJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "L", "1L": "E"},
  "ABCEGHKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABCEGIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "I", "1L": "K"},
  "ABCEGIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "L", "1L": "I"},
  "ABCEGIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "A", "1G": "I", "1I": "C", "1K": "L", "1L": "K"},
  "ABCEGJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABCEHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "H", "1K": "I", "1L": "K"},
  "ABCEHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "I"},
  "ABCEHIKL": {"1A": "E", "1B": "I", "1D": "B", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABCEHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABCEIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "A", "1G": "I", "1I": "C", "1K": "L", "1L": "K"},
  "ABCFGHIJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "J"},
  "ABCFGHIK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABCFGHIL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABCFGHJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "J", "1L": "K"},
  "ABCFGHJL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "J"},
  "ABCFGHKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCFGIJK": {"1A": "C", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "I", "1L": "K"},
  "ABCFGIJL": {"1A": "C", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "I"},
  "ABCFGIKL": {"1A": "I", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCFGJKL": {"1A": "C", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABCFHIJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABCFHIJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABCFHIKL": {"1A": "H", "1B": "I", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCFHJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCFIJKL": {"1A": "I", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABCGHIJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "I", "1L": "K"},
  "ABCGHIJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "L", "1L": "I"},
  "ABCGHIKL": {"1A": "I", "1B": "G", "1D": "B", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABCGHJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABCGIJKL": {"1A": "I", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABCHIJKL": {"1A": "I", "1B": "J", "1D": "B", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABDEFGHI": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "I"},
  "ABDEFGHJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "J"},
  "ABDEFGHK": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "K"},
  "ABDEFGHL": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "E"},
  "ABDEFGIJ": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "J"},
  "ABDEFGIK": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABDEFGIL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABDEFGJK": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "J", "1L": "K"},
  "ABDEFGJL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "J"},
  "ABDEFGKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABDEFHIJ": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "I"},
  "ABDEFHIK": {"1A": "H", "1B": "E", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABDEFHIL": {"1A": "H", "1B": "E", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABDEFHJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "K"},
  "ABDEFHJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "E"},
  "ABDEFHKL": {"1A": "H", "1B": "E", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABDEFIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABDEFIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABDEFIKL": {"1A": "E", "1B": "I", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABDEFJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABDEGHIJ": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "E", "1L": "I"},
  "ABDEGHIK": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "H", "1K": "I", "1L": "K"},
  "ABDEGHIL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "I"},
  "ABDEGHJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "E", "1L": "K"},
  "ABDEGHJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "E"},
  "ABDEGHKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABDEGIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "I", "1L": "K"},
  "ABDEGIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "I"},
  "ABDEGIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "A", "1G": "I", "1I": "D", "1K": "L", "1L": "K"},
  "ABDEGJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABDEHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "H", "1K": "I", "1L": "K"},
  "ABDEHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "I"},
  "ABDEHIKL": {"1A": "E", "1B": "I", "1D": "B", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABDEHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABDEIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "A", "1G": "I", "1I": "D", "1K": "L", "1L": "K"},
  "ABDFGHIJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "J"},
  "ABDFGHIK": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABDFGHIL": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABDFGHJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "J", "1L": "K"},
  "ABDFGHJL": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "J"},
  "ABDFGHKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABDFGIJK": {"1A": "F", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "I", "1L": "K"},
  "ABDFGIJL": {"1A": "F", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "I"},
  "ABDFGIKL": {"1A": "I", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABDFGJKL": {"1A": "F", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABDFHIJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ABDFHIJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ABDFHIKL": {"1A": "H", "1B": "I", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABDFHJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABDFIJKL": {"1A": "I", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ABDGHIJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "I", "1L": "K"},
  "ABDGHIJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "I"},
  "ABDGHIKL": {"1A": "I", "1B": "G", "1D": "B", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABDGHJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABDGIJKL": {"1A": "I", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABDHIJKL": {"1A": "I", "1B": "J", "1D": "B", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABEFGHIJ": {"1A": "H", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "E", "1L": "I"},
  "ABEFGHIK": {"1A": "E", "1B": "G", "1D": "B", "1E": "F", "1G": "A", "1I": "H", "1K": "I", "1L": "K"},
  "ABEFGHIL": {"1A": "E", "1B": "G", "1D": "B", "1E": "F", "1G": "A", "1I": "H", "1K": "L", "1L": "I"},
  "ABEFGHJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "E", "1L": "K"},
  "ABEFGHJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "E"},
  "ABEFGHKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "F", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABEFGIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "I", "1L": "K"},
  "ABEFGIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "I"},
  "ABEFGIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "A", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "ABEFGJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABEFHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "H", "1K": "I", "1L": "K"},
  "ABEFHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "H", "1K": "L", "1L": "I"},
  "ABEFHIKL": {"1A": "E", "1B": "I", "1D": "B", "1E": "F", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABEFHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ABEFIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "A", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "ABEGHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "A", "1G": "H", "1I": "G", "1K": "I", "1L": "K"},
  "ABEGHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "A", "1G": "H", "1I": "G", "1K": "L", "1L": "I"},
  "ABEGHIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "A", "1G": "I", "1I": "H", "1K": "L", "1L": "K"},
  "ABEGHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "A", "1G": "H", "1I": "G", "1K": "L", "1L": "K"},
  "ABEGIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "A", "1G": "I", "1I": "G", "1K": "L", "1L": "K"},
  "ABEHIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "A", "1G": "I", "1I": "H", "1K": "L", "1L": "K"},
  "ABFGHIJK": {"1A": "H", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "I", "1L": "K"},
  "ABFGHIJL": {"1A": "H", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "I"},
  "ABFGHIKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "A", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "ABFGHJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABFGIJKL": {"1A": "I", "1B": "J", "1D": "B", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ABFHIJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "A", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "ABGHIJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "A", "1G": "I", "1I": "G", "1K": "L", "1L": "K"},
  "ACDEFGHI": {"1A": "H", "1B": "G", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "I"},
  "ACDEFGHJ": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "E"},
  "ACDEFGHK": {"1A": "H", "1B": "G", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "K"},
  "ACDEFGHL": {"1A": "H", "1B": "G", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "E"},
  "ACDEFGIJ": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "I"},
  "ACDEFGIK": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ACDEFGIL": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ACDEFGJK": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "K"},
  "ACDEFGJL": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "E"},
  "ACDEFGKL": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACDEFHIJ": {"1A": "H", "1B": "J", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "I"},
  "ACDEFHIK": {"1A": "H", "1B": "E", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ACDEFHIL": {"1A": "H", "1B": "E", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ACDEFHJK": {"1A": "H", "1B": "J", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "K"},
  "ACDEFHJL": {"1A": "H", "1B": "J", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "E"},
  "ACDEFHKL": {"1A": "H", "1B": "E", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDEFIJK": {"1A": "C", "1B": "J", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ACDEFIJL": {"1A": "C", "1B": "J", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ACDEFIKL": {"1A": "C", "1B": "E", "1D": "I", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACDEFJKL": {"1A": "C", "1B": "J", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACDEGHIJ": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "E", "1L": "I"},
  "ACDEGHIK": {"1A": "H", "1B": "G", "1D": "E", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ACDEGHIL": {"1A": "H", "1B": "G", "1D": "E", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ACDEGHJK": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "E", "1L": "K"},
  "ACDEGHJL": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "E"},
  "ACDEGHKL": {"1A": "H", "1B": "G", "1D": "E", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDEGIJK": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ACDEGIJL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ACDEGIKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDEGJKL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDEHIJK": {"1A": "H", "1B": "J", "1D": "E", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ACDEHIJL": {"1A": "H", "1B": "J", "1D": "E", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ACDEHIKL": {"1A": "H", "1B": "E", "1D": "I", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDEHJKL": {"1A": "H", "1B": "J", "1D": "E", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDEIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDFGHIJ": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "I"},
  "ACDFGHIK": {"1A": "H", "1B": "G", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ACDFGHIL": {"1A": "H", "1B": "G", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ACDFGHJK": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "D", "1L": "K"},
  "ACDFGHJL": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "H"},
  "ACDFGHKL": {"1A": "H", "1B": "G", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDFGIJK": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ACDFGIJL": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ACDFGIKL": {"1A": "C", "1B": "G", "1D": "I", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACDFGJKL": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACDFHIJK": {"1A": "H", "1B": "J", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ACDFHIJL": {"1A": "H", "1B": "J", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ACDFHIKL": {"1A": "H", "1B": "F", "1D": "I", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDFHJKL": {"1A": "H", "1B": "J", "1D": "F", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDFIJKL": {"1A": "C", "1B": "J", "1D": "I", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACDGHIJK": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "I", "1L": "K"},
  "ACDGHIJL": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "I"},
  "ACDGHIKL": {"1A": "H", "1B": "G", "1D": "I", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDGHJKL": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDGIJKL": {"1A": "I", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACDHIJKL": {"1A": "H", "1B": "J", "1D": "I", "1E": "C", "1G": "A", "1I": "D", "1K": "L", "1L": "K"},
  "ACEFGHIJ": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "E", "1L": "I"},
  "ACEFGHIK": {"1A": "H", "1B": "G", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ACEFGHIL": {"1A": "H", "1B": "G", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ACEFGHJK": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "E", "1L": "K"},
  "ACEFGHJL": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "E"},
  "ACEFGHKL": {"1A": "H", "1B": "G", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACEFGIJK": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ACEFGIJL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ACEFGIKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACEFGJKL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACEFHIJK": {"1A": "H", "1B": "J", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ACEFHIJL": {"1A": "H", "1B": "J", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ACEFHIKL": {"1A": "H", "1B": "E", "1D": "I", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACEFHJKL": {"1A": "H", "1B": "J", "1D": "E", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACEFIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACEGHIJK": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "H", "1K": "I", "1L": "K"},
  "ACEGHIJL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "I"},
  "ACEGHIKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ACEGHJKL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ACEGIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "C", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ACEHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "C", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ACFGHIJK": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ACFGHIJL": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ACFGHIKL": {"1A": "H", "1B": "G", "1D": "I", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACFGHJKL": {"1A": "H", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACFGIJKL": {"1A": "I", "1B": "G", "1D": "J", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACFHIJKL": {"1A": "H", "1B": "J", "1D": "I", "1E": "C", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ACGHIJKL": {"1A": "H", "1B": "J", "1D": "I", "1E": "C", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ADEFGHIJ": {"1A": "H", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "I"},
  "ADEFGHIK": {"1A": "H", "1B": "G", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ADEFGHIL": {"1A": "H", "1B": "G", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ADEFGHJK": {"1A": "H", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "E", "1L": "K"},
  "ADEFGHJL": {"1A": "H", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "E"},
  "ADEFGHKL": {"1A": "H", "1B": "G", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADEFGIJK": {"1A": "E", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ADEFGIJL": {"1A": "E", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ADEFGIKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADEFGJKL": {"1A": "E", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADEFHIJK": {"1A": "H", "1B": "J", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ADEFHIJL": {"1A": "H", "1B": "J", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ADEFHIKL": {"1A": "H", "1B": "E", "1D": "I", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADEFHJKL": {"1A": "H", "1B": "J", "1D": "E", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADEFIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADEGHIJK": {"1A": "E", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "H", "1K": "I", "1L": "K"},
  "ADEGHIJL": {"1A": "E", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "I"},
  "ADEGHIKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ADEGHJKL": {"1A": "E", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ADEGIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "ADEHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "D", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "ADFGHIJK": {"1A": "H", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "I", "1L": "K"},
  "ADFGHIJL": {"1A": "H", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "I"},
  "ADFGHIKL": {"1A": "H", "1B": "G", "1D": "I", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADFGHJKL": {"1A": "H", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADFGIJKL": {"1A": "I", "1B": "G", "1D": "J", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADFHIJKL": {"1A": "H", "1B": "J", "1D": "I", "1E": "D", "1G": "A", "1I": "F", "1K": "L", "1L": "K"},
  "ADGHIJKL": {"1A": "H", "1B": "J", "1D": "I", "1E": "D", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "AEFGHIJK": {"1A": "E", "1B": "G", "1D": "J", "1E": "F", "1G": "A", "1I": "H", "1K": "I", "1L": "K"},
  "AEFGHIJL": {"1A": "E", "1B": "G", "1D": "J", "1E": "F", "1G": "A", "1I": "H", "1K": "L", "1L": "I"},
  "AEFGHIKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "F", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "AEFGHJKL": {"1A": "E", "1B": "G", "1D": "J", "1E": "F", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "AEFGIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "AEFHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "F", "1G": "A", "1I": "H", "1K": "L", "1L": "K"},
  "AEGHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "A", "1G": "H", "1I": "G", "1K": "L", "1L": "K"},
  "AFGHIJKL": {"1A": "H", "1B": "J", "1D": "I", "1E": "F", "1G": "A", "1I": "G", "1K": "L", "1L": "K"},
  "BCDEFGHI": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "E", "1L": "I"},
  "BCDEFGHJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "D", "1L": "E"},
  "BCDEFGHK": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "E", "1L": "K"},
  "BCDEFGHL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "E"},
  "BCDEFGIJ": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "E", "1L": "I"},
  "BCDEFGIK": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "E", "1I": "F", "1K": "I", "1L": "K"},
  "BCDEFGIL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "E", "1I": "F", "1K": "L", "1L": "I"},
  "BCDEFGJK": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "E", "1L": "K"},
  "BCDEFGJL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "E"},
  "BCDEFGKL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "E", "1I": "F", "1K": "L", "1L": "K"},
  "BCDEFHIJ": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "E", "1L": "I"},
  "BCDEFHIK": {"1A": "C", "1B": "E", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "BCDEFHIL": {"1A": "C", "1B": "E", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "BCDEFHJK": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "E", "1L": "K"},
  "BCDEFHJL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "E"},
  "BCDEFHKL": {"1A": "C", "1B": "E", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BCDEFIJK": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "E", "1I": "F", "1K": "I", "1L": "K"},
  "BCDEFIJL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "E", "1I": "F", "1K": "L", "1L": "I"},
  "BCDEFIKL": {"1A": "C", "1B": "E", "1D": "B", "1E": "D", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BCDEFJKL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "E", "1I": "F", "1K": "L", "1L": "K"},
  "BCDEGHIJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "E", "1L": "I"},
  "BCDEGHIK": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "H", "1I": "D", "1K": "I", "1L": "K"},
  "BCDEGHIL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "H", "1I": "D", "1K": "L", "1L": "I"},
  "BCDEGHJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "E", "1L": "K"},
  "BCDEGHJL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "L", "1L": "E"},
  "BCDEGHKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "H", "1I": "D", "1K": "L", "1L": "K"},
  "BCDEGIJK": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "I", "1L": "K"},
  "BCDEGIJL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "L", "1L": "I"},
  "BCDEGIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "I", "1I": "D", "1K": "L", "1L": "K"},
  "BCDEGJKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "L", "1L": "K"},
  "BCDEHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "H", "1I": "D", "1K": "I", "1L": "K"},
  "BCDEHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "H", "1I": "D", "1K": "L", "1L": "I"},
  "BCDEHIKL": {"1A": "E", "1B": "I", "1D": "B", "1E": "C", "1G": "H", "1I": "D", "1K": "L", "1L": "K"},
  "BCDEHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "H", "1I": "D", "1K": "L", "1L": "K"},
  "BCDEIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "I", "1I": "D", "1K": "L", "1L": "K"},
  "BCDFGHIJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "D", "1L": "I"},
  "BCDFGHIK": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "BCDFGHIL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "BCDFGHJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "D", "1L": "K"},
  "BCDFGHJL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "J"},
  "BCDFGHKL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BCDFGIJK": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "I", "1L": "K"},
  "BCDFGIJL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "I"},
  "BCDFGIKL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BCDFGJKL": {"1A": "C", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "BCDFHIJK": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "BCDFHIJL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "BCDFHIKL": {"1A": "C", "1B": "I", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BCDFHJKL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BCDFIJKL": {"1A": "C", "1B": "J", "1D": "B", "1E": "D", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BCDGHIJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "I", "1L": "K"},
  "BCDGHIJL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "L", "1L": "I"},
  "BCDGHIKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "I", "1I": "D", "1K": "L", "1L": "K"},
  "BCDGHJKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "L", "1L": "K"},
  "BCDGIJKL": {"1A": "I", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "D", "1K": "L", "1L": "K"},
  "BCDHIJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "I", "1I": "D", "1K": "L", "1L": "K"},
  "BCEFGHIJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "E", "1L": "I"},
  "BCEFGHIK": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "BCEFGHIL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "BCEFGHJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "E", "1L": "K"},
  "BCEFGHJL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "L", "1L": "E"},
  "BCEFGHKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BCEFGIJK": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "I", "1L": "K"},
  "BCEFGIJL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "L", "1L": "I"},
  "BCEFGIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BCEFGJKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "BCEFHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "BCEFHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "BCEFHIKL": {"1A": "E", "1B": "I", "1D": "B", "1E": "C", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BCEFHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BCEFIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BCEGHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "H", "1I": "G", "1K": "I", "1L": "K"},
  "BCEGHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "H", "1I": "G", "1K": "L", "1L": "I"},
  "BCEGHIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "C", "1G": "I", "1I": "H", "1K": "L", "1L": "K"},
  "BCEGHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "H", "1I": "G", "1K": "L", "1L": "K"},
  "BCEGIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "I", "1I": "G", "1K": "L", "1L": "K"},
  "BCEHIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "C", "1G": "I", "1I": "H", "1K": "L", "1L": "K"},
  "BCFGHIJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "I", "1L": "K"},
  "BCFGHIJL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "L", "1L": "I"},
  "BCFGHIKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BCFGHJKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "BCFGIJKL": {"1A": "I", "1B": "G", "1D": "B", "1E": "C", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "BCFHIJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BCGHIJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "C", "1G": "I", "1I": "G", "1K": "L", "1L": "K"},
  "BDEFGHIJ": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "E", "1L": "I"},
  "BDEFGHIK": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "BDEFGHIL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "BDEFGHJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "E", "1L": "K"},
  "BDEFGHJL": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "E"},
  "BDEFGHKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BDEFGIJK": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "I", "1L": "K"},
  "BDEFGIJL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "I"},
  "BDEFGIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BDEFGJKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "BDEFHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "BDEFHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "BDEFHIKL": {"1A": "E", "1B": "I", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BDEFHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "BDEFIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BDEGHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "G", "1K": "I", "1L": "K"},
  "BDEGHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "G", "1K": "L", "1L": "I"},
  "BDEGHIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "D", "1G": "I", "1I": "H", "1K": "L", "1L": "K"},
  "BDEGHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "H", "1I": "G", "1K": "L", "1L": "K"},
  "BDEGIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "I", "1I": "G", "1K": "L", "1L": "K"},
  "BDEHIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "D", "1G": "I", "1I": "H", "1K": "L", "1L": "K"},
  "BDFGHIJK": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "I", "1L": "K"},
  "BDFGHIJL": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "I"},
  "BDFGHIKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BDFGHJKL": {"1A": "H", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "BDFGIJKL": {"1A": "I", "1B": "G", "1D": "B", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "BDFHIJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "BDGHIJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "D", "1G": "I", "1I": "G", "1K": "L", "1L": "K"},
  "BEFGHIJK": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "H", "1I": "G", "1K": "I", "1L": "K"},
  "BEFGHIJL": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "H", "1I": "G", "1K": "L", "1L": "I"},
  "BEFGHIKL": {"1A": "E", "1B": "G", "1D": "B", "1E": "F", "1G": "I", "1I": "H", "1K": "L", "1L": "K"},
  "BEFGHJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "H", "1I": "G", "1K": "L", "1L": "K"},
  "BEFGIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "I", "1I": "G", "1K": "L", "1L": "K"},
  "BEFHIJKL": {"1A": "E", "1B": "J", "1D": "B", "1E": "F", "1G": "I", "1I": "H", "1K": "L", "1L": "K"},
  "BEGHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "B", "1G": "H", "1I": "G", "1K": "L", "1L": "K"},
  "BFGHIJKL": {"1A": "H", "1B": "J", "1D": "B", "1E": "F", "1G": "I", "1I": "G", "1K": "L", "1L": "K"},
  "CDEFGHIJ": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "H", "1I": "F", "1K": "E", "1L": "I"},
  "CDEFGHIK": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "CDEFGHIL": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "CDEFGHJK": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "H", "1I": "F", "1K": "E", "1L": "K"},
  "CDEFGHJL": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "E"},
  "CDEFGHKL": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "CDEFGIJK": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "J", "1I": "F", "1K": "I", "1L": "K"},
  "CDEFGIJL": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "I"},
  "CDEFGIKL": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "CDEFGJKL": {"1A": "C", "1B": "G", "1D": "E", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "CDEFHIJK": {"1A": "C", "1B": "J", "1D": "E", "1E": "D", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "CDEFHIJL": {"1A": "C", "1B": "J", "1D": "E", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "CDEFHIKL": {"1A": "C", "1B": "E", "1D": "I", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "CDEFHJKL": {"1A": "C", "1B": "J", "1D": "E", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "CDEFIJKL": {"1A": "C", "1B": "J", "1D": "E", "1E": "D", "1G": "I", "1I": "F", "1K": "L", "1L": "K"},
  "CDEGHIJK": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "H", "1I": "D", "1K": "I", "1L": "K"},
  "CDEGHIJL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "H", "1I": "D", "1K": "L", "1L": "I"},
  "CDEGHIKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "C", "1G": "H", "1I": "D", "1K": "L", "1L": "K"},
  "CDEGHJKL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "H", "1I": "D", "1K": "L", "1L": "K"},
  "CDEGIJKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "C", "1G": "J", "1I": "D", "1K": "L", "1L": "K"},
  "CDEHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "C", "1G": "H", "1I": "D", "1K": "L", "1L": "K"},
  "CDFGHIJK": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "CDFGHIJL": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "CDFGHIKL": {"1A": "C", "1B": "G", "1D": "I", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "CDFGHJKL": {"1A": "C", "1B": "G", "1D": "J", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "CDFGIJKL": {"1A": "C", "1B": "G", "1D": "I", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "CDFHIJKL": {"1A": "C", "1B": "J", "1D": "I", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "CDGHIJKL": {"1A": "H", "1B": "G", "1D": "I", "1E": "C", "1G": "J", "1I": "D", "1K": "L", "1L": "K"},
  "CEFGHIJK": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "CEFGHIJL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "CEFGHIKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "C", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "CEFGHJKL": {"1A": "E", "1B": "G", "1D": "J", "1E": "C", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "CEFGIJKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "C", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "CEFHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "C", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "CEGHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "C", "1G": "H", "1I": "G", "1K": "L", "1L": "K"},
  "CFGHIJKL": {"1A": "H", "1B": "G", "1D": "I", "1E": "C", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "DEFGHIJK": {"1A": "E", "1B": "G", "1D": "J", "1E": "D", "1G": "H", "1I": "F", "1K": "I", "1L": "K"},
  "DEFGHIJL": {"1A": "E", "1B": "G", "1D": "J", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "I"},
  "DEFGHIKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "DEFGHJKL": {"1A": "E", "1B": "G", "1D": "J", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "DEFGIJKL": {"1A": "E", "1B": "G", "1D": "I", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "DEFHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "D", "1G": "H", "1I": "F", "1K": "L", "1L": "K"},
  "DEGHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "D", "1G": "H", "1I": "G", "1K": "L", "1L": "K"},
  "DFGHIJKL": {"1A": "H", "1B": "G", "1D": "I", "1E": "D", "1G": "J", "1I": "F", "1K": "L", "1L": "K"},
  "EFGHIJKL": {"1A": "E", "1B": "J", "1D": "I", "1E": "F", "1G": "H", "1I": "G", "1K": "L", "1L": "K"},
};

// Assign thirds to bracket slots using the official FIFA 495-row lookup table.
// When all 8 thirds are known, use exact lookup.
// When groups are still playing, show provisional best third from current standings.
function assignThirds(
  qualGroups: string[],
  allThirds: (TeamStat & { qualifies: boolean })[]
): Record<string, string | undefined> {
  const teamByGroup = Object.fromEntries(allThirds.map(t => [t.group, t.team]));

  // Slot -> which FIFA column feeds it
  // Columns: 1A->R32-5, 1B->R32-11, 1D->R32-12, 1E->R32-2, 1G->R32-8, 1I->R32-4, 1K->R32-16, 1L->R32-15
  const slotToCol: Record<string, string> = {
    "ABCDF": "1E",   // R32-2
    "CDFGH": "1I",   // R32-4
    "CEFHI": "1A",   // R32-5
    "AEHIJ": "1G",   // R32-8
    "EFGIJ": "1B",   // R32-11
    "BEFIJ": "1D",   // R32-12
    "EHIJK": "1L",   // R32-15
    "DEIJL": "1K",   // R32-16
  };

  // If we have exactly 8 qualifying thirds, do exact lookup
  if (qualGroups.length === 8) {
    const key = qualGroups.sort().join("");
    const row = FIFA_R32_LOOKUP[key];
    if (row) {
      const result: Record<string, string | undefined> = {};
      for (const [slotKey, col] of Object.entries(slotToCol)) {
        const thirdGroup = row[col];
        result[slotKey] = thirdGroup ? teamByGroup[thirdGroup] : undefined;
      }
      return result;
    }
  }

  // Provisional: show current best third from eligible groups for each slot
  const slotEligible: Record<string, string[]> = {
    "ABCDF": ["A","B","C","D","F"],
    "CDFGH": ["C","D","F","G","H"],
    "CEFHI": ["C","E","F","H","I"],
    "AEHIJ": ["A","E","H","I","J"],
    "EFGIJ": ["E","F","G","I","J"],
    "BEFIJ": ["B","E","F","I","J"],
    "EHIJK": ["E","H","I","J","K"],
    "DEIJL": ["D","E","I","J","L"],
  };

  const result: Record<string, string | undefined> = {};
  const usedGroups = new Set<string>();
  const sortedThirds = [...allThirds].sort((a,b) => b.points-a.points || b.gd-a.gd || b.gf-a.gf);

  for (const [slotKey, eligible] of Object.entries(slotEligible)) {
    const best = sortedThirds.find(t => eligible.includes(t.group) && !usedGroups.has(t.group));
    if (best) {
      result[slotKey] = best.team;
      usedGroups.add(best.group);
    }
  }

  return result;
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function StandingsPage() {
  const { user, profile, loading } = useAuth();
  const showRank = canSeeRanking(user?.email, profile?.showFifaRanking);
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [userPickMap, setUserPickMap] = useState<Record<string, { homeScore: number; awayScore: number }>>({});
  const [activeGroup, setActiveGroup] = useState("A");
  const [viewMode, setViewMode] = useState<"real" | "predicted">("real");
  const [activeTab, setActiveTab] = useState<"groups" | "thirds" | "r32" | "fifa" | "scorers">("groups");
  const [fetching, setFetching] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [adminConfirmedThirds, setAdminConfirmedThirds] = useState<Set<string>>(new Set());

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  // Real-time listener for matches
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "matches"), orderBy("matchDate", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const m = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
      setMatches(m);
      setFetching(false);
    }, (e) => { console.warn(e); setFetching(false); });
    return () => unsub();
  }, [user]);

  // Load user picks once
  useEffect(() => {
    if (!user) return;
    getUserPicks(user.uid).then((up) => {
      const pickMap: Record<string, { homeScore: number; awayScore: number }> = {};
      up.forEach((p) => { pickMap[p.matchId] = { homeScore: p.homeScore, awayScore: p.awayScore }; });
      setUserPickMap(pickMap);
    }).catch(console.warn);
  }, [user]);

  // Load all users for goalscorer picks display
  useEffect(() => {
    if (!user) return;
    getAllUsers().then(setUsers).catch(console.warn);
  }, [user]);

  // Load admin-saved group standings to know which third-place teams are officially confirmed as advancing.
  // A team is "confirmed" once admin saves its group standing with the team in the thirdPlaces list.
  useEffect(() => {
    if (!user) return;
    getAllGroupStandings().then((arr) => {
      const teams = new Set<string>();
      for (const s of arr) {
        const tp: unknown = (s as { thirdPlaces?: string[] }).thirdPlaces;
        if (Array.isArray(tp)) tp.forEach(t => { if (typeof t === "string" && t.length > 0) teams.add(t); });
      }
      setAdminConfirmedThirds(teams);
    }).catch(console.warn);
  }, [user]);

  const groupMatches = matches.filter((m) => m.round?.startsWith("Fase de Grupos"));
  const availableGroups = Array.from(new Set(groupMatches.map((m) => m.group).filter(Boolean) as string[])).sort();

  const realFinished = groupMatches.filter((m) => (m.status === "finished" || m.status === "live") && m.homeScore !== null);
  const realStandings = computeGroupStandings(realFinished, groupMatches);
  const realThirds = getThirdPlaceTable(realStandings);
  const realR32 = buildR32(realStandings, groupMatches, adminConfirmedThirds);

  const predictedMatches = groupMatches.map((m) => {
    const p = userPickMap[m.id];
    if (!p) return null;
    const hs = Number(p.homeScore), as_ = Number(p.awayScore);
    if (isNaN(hs) || isNaN(as_)) return null;
    return {
      ...m,
      homeScore: hs,
      awayScore: as_,
      status: "finished" as const,
      // Inherit real cards for tiebreaker
      homeYellow: m.homeYellow ?? 0,
      awayYellow: m.awayYellow ?? 0,
      homeRed: m.homeRed ?? 0,
      awayRed: m.awayRed ?? 0,
    };
  }).filter(Boolean) as Match[];
  const predictedStandings = computeGroupStandings(predictedMatches, groupMatches);
  const predictedThirds = getThirdPlaceTable(predictedStandings);
  const predictedR32 = buildR32(predictedStandings, groupMatches, adminConfirmedThirds);

  // Build simple standings map for display (team name by position)
  const displayStandings = viewMode === "real" ? realStandings : predictedStandings;
  const displayThirds = viewMode === "real" ? realThirds : predictedThirds;
  // The R32 bracket ALWAYS uses the real teams. In "Según Mis Picks" mode, only the score changes
  // (to the user's R32 pick); team matchups and the winner are still the real ones.
  const baseR32 = realR32;

  // Enrich R32 slots with real scores, user picks, and actual winner.
  // - Real view: show the real score from Firestore.
  // - Picks view: show the user's predicted score, but advancement still uses the real winner.
  const r32ActualMatches = matches.filter(m => m.round === "Ronda de 32");
  const displayR32: R32Match[] = baseR32.map(slot => {
    if (!slot.homeTeam || !slot.awayTeam) return slot;
    // Look up the actual R32 match (team order may be swapped)
    const actual = r32ActualMatches.find(m =>
      (m.homeTeam === slot.homeTeam && m.awayTeam === slot.awayTeam) ||
      (m.homeTeam === slot.awayTeam && m.awayTeam === slot.homeTeam)
    );
    if (!actual) return slot;
    const sameOrder = actual.homeTeam === slot.homeTeam;
    const realHs = actual.homeScore;
    const realAs = actual.awayScore;
    const isFinished = actual.status === "finished" && realHs !== null && realAs !== null;
    // Real winner — always based on real result; for knockout draws use the penalty winner
    let realWinner: string | undefined;
    if (isFinished && realHs !== null && realAs !== null) {
      if (realHs > realAs) realWinner = actual.homeTeam;
      else if (realHs < realAs) realWinner = actual.awayTeam;
      else if (actual.penaltyWinner === "home") realWinner = actual.homeTeam;
      else if (actual.penaltyWinner === "away") realWinner = actual.awayTeam;
      // else: tied with no penalty winner recorded → still pending
    }
    // What score to display
    let displayHs: number | null = null;
    let displayAs: number | null = null;
    if (viewMode === "real") {
      // Real scores in slot's team order
      displayHs = sameOrder ? realHs : realAs;
      displayAs = sameOrder ? realAs : realHs;
    } else {
      const pick = userPickMap[actual.id];
      if (pick) {
        const ph = Number(pick.homeScore);
        const pa = Number(pick.awayScore);
        if (!isNaN(ph) && !isNaN(pa)) {
          // pick is stored in actual match's team order — convert to slot order
          displayHs = sameOrder ? ph : pa;
          displayAs = sameOrder ? pa : ph;
        }
      }
    }
    return {
      ...slot,
      displayHomeScore: displayHs,
      displayAwayScore: displayAs,
      realWinner,
      isFinished,
      wonOnPenalties: isFinished && realHs === realAs && !!actual.penaltyWinner,
      // Convert penalty scores to slot order (same swap rule as displayHs/displayAs)
      penaltyHome: actual.penaltyHome != null ? (sameOrder ? actual.penaltyHome : actual.penaltyAway ?? null) : null,
      penaltyAway: actual.penaltyAway != null ? (sameOrder ? actual.penaltyAway : actual.penaltyHome ?? null) : null,
    };
  });
  const groupTable = displayStandings[activeGroup] || [];

  if (loading || fetching) return <Loading />;

  return (
    <div className="page animate-fade-up">
      <h1 style={{ fontSize: 36, marginBottom: 4 }}><span className="gold-text">TABLA</span></h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        Posiciones, terceros y cuadro de Ronda de 32
      </p>

      {/* View mode toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["real", "predicted"] as const).map((mode) => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding: "8px 18px", borderRadius: "var(--radius-sm)", cursor: "pointer",
            border: `1px solid ${viewMode === mode ? "var(--border-gold)" : "var(--border)"}`,
            background: viewMode === mode ? "rgba(201,168,76,0.12)" : "var(--surface2)",
            color: viewMode === mode ? "var(--gold)" : "var(--text-muted)",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 14, transition: "all 0.15s",
          }}>
            {mode === "real" ? "📊 Tabla Real" : "🔮 Según Mis Picks"}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
        {([
          { id: "groups", label: "📋 Grupos" },
          { id: "thirds", label: "🏅 Tabla de Terceros" },
          { id: "r32", label: "⚔️ Ronda de 32" },
          { id: "fifa", label: "🌍 Ranking FIFA" },
          { id: "scorers", label: "⚽ Goleadores" },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "10px 16px", fontSize: 13, cursor: "pointer", border: "none",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, letterSpacing: "0.04em",
            background: "transparent", transition: "all 0.15s", whiteSpace: "nowrap",
            color: activeTab === t.id ? "var(--gold)" : "var(--text-muted)",
            borderBottom: `2px solid ${activeTab === t.id ? "var(--gold)" : "transparent"}`,
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === "fifa" ? (
        <FifaRankingTab />
      ) : activeTab === "scorers" ? (
        <GoalscorersTab users={users} matches={matches} />
      ) : availableGroups.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <p>No hay partidos de grupos aún.</p>
        </div>
      ) : activeTab === "groups" ? (
        <GroupsTab
          availableGroups={availableGroups}
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          groupTable={groupTable}
          displayThirds={displayThirds}
          viewMode={viewMode}
          realStandings={realStandings}
          showRank={showRank}
        />
      ) : activeTab === "thirds" ? (
        <ThirdsTab displayThirds={displayThirds} viewMode={viewMode} showRank={showRank} />
      ) : (
        <R32Tab r32={displayR32} viewMode={viewMode} showRank={showRank} />
      )}
    </div>
  );
}

// ─── GROUPS TAB ───────────────────────────────────────────────────────────────
function GroupsTab({ availableGroups, activeGroup, setActiveGroup, groupTable, displayThirds, viewMode, realStandings, showRank }: {
  availableGroups: string[];
  activeGroup: string;
  setActiveGroup: (g: string) => void;
  groupTable: TeamStat[];
  displayThirds: (TeamStat & { qualifies: boolean })[];
  viewMode: "real" | "predicted";
  realStandings: Record<string, TeamStat[]>;
  showRank: boolean;
}) {
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {availableGroups.map((g) => (
          <button key={g} onClick={() => setActiveGroup(g)} style={{
            width: 36, height: 36, borderRadius: 6, fontFamily: "'Bebas Neue',sans-serif",
            fontSize: 16, cursor: "pointer", border: "none", transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: activeGroup === g ? "var(--gold)" : "var(--surface2)",
            color: activeGroup === g ? "var(--black)" : "var(--text-muted)",
          }}>{g}</button>
        ))}
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: "var(--gold)" }}>GRUPO {activeGroup}</span>
          <span className={`badge ${viewMode === "real" ? "badge-blue" : "badge-gold"}`} style={{ fontSize: 11 }}>
            {viewMode === "real" ? "Resultados Oficiales" : "Según Mis Predicciones"}
          </span>
        </div>
        {groupTable.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Sin resultados aún</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["#", "Equipo", "PJ", "G", "E", "P", "GF", "GC", "DG", "Pts"].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupTable.map((team, i) => {
                  const qualifies3rd = i === 2 && displayThirds.find(t => t.team === team.team)?.qualifies;
                  const advances = i < 2 || qualifies3rd;
                  return (
                    <tr key={team.team} style={{ borderBottom: "1px solid var(--border)", background: advances ? "rgba(201,168,76,0.04)" : "transparent" }}>
                      <td style={s.td}><span style={{ color: i < 2 ? "var(--gold)" : qualifies3rd ? "var(--green)" : "var(--text-muted)" }}>{i + 1}</span></td>
                      <td style={{ ...s.td, fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>
                        {teamWithRank(team.team, showRank)}
                        {i < 2 && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--gold)" }}>✓</span>}
                        {qualifies3rd && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--green)" }}>✓3°</span>}
                      </td>
                      <td style={s.td}>{team.played}</td>
                      <td style={s.td}>{team.won}</td>
                      <td style={s.td}>{team.drawn}</td>
                      <td style={s.td}>{team.lost}</td>
                      <td style={s.td}>{team.gf}</td>
                      <td style={s.td}>{team.ga}</td>
                      <td style={{ ...s.td, color: team.gd > 0 ? "var(--green)" : team.gd < 0 ? "var(--red)" : "var(--text-muted)" }}>
                        {team.gd > 0 ? `+${team.gd}` : team.gd}
                      </td>
                      <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)" }}>{team.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
          ✓ = Clasificado directo · ✓3° = Clasifica como mejor tercero<br/>
          <span style={{ opacity: 0.7 }}>Criterios FIFA: 1) Pts · 2) DG · 3) GF · 4) Conducta · 5-6) Ranking FIFA</span>
        </div>
      </div>
    </>
  );
}

// ─── THIRDS TAB ───────────────────────────────────────────────────────────────
function ThirdsTab({ displayThirds, viewMode, showRank }: { displayThirds: (TeamStat & { qualifies: boolean })[]; viewMode: string; showRank: boolean }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: "var(--gold)" }}>TABLA DE TERCEROS</span>
        <span className="badge badge-green" style={{ fontSize: 11 }}>Top 8 clasifican</span>
      </div>
      {displayThirds.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Los terceros aparecerán cuando haya resultados</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Equipo", "Grupo", "PJ", "G", "E", "P", "GF", "GC", "DG", "Pts", "Estado"].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayThirds.map((team, i) => (
                <tr key={team.team} style={{ borderBottom: "1px solid var(--border)", background: team.qualifies ? "rgba(46,204,113,0.04)" : "transparent" }}>
                  <td style={s.td}><span style={{ color: team.qualifies ? "var(--green)" : "var(--text-muted)" }}>{i + 1}</span></td>
                  <td style={{ ...s.td, fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>{teamWithRank(team.team, showRank)}</td>
                  <td style={{ ...s.td, color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif" }}>{team.group}</td>
                  <td style={s.td}>{team.played}</td>
                  <td style={s.td}>{team.won}</td>
                  <td style={s.td}>{team.drawn}</td>
                  <td style={s.td}>{team.lost}</td>
                  <td style={s.td}>{team.gf}</td>
                  <td style={s.td}>{team.ga}</td>
                  <td style={{ ...s.td, color: team.gd > 0 ? "var(--green)" : team.gd < 0 ? "var(--red)" : "var(--text-muted)" }}>
                    {team.gd > 0 ? `+${team.gd}` : team.gd}
                  </td>
                  <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)" }}>{team.points}</td>
                  <td style={s.td}>
                    {team.qualifies
                      ? <span className="badge badge-green" style={{ fontSize: 10 }}>Clasifica</span>
                      : <span className="badge badge-red" style={{ fontSize: 10 }}>Eliminado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
        Los mejores 8 terceros de los 12 grupos avanzan a Ronda de 32
      </div>
    </div>
  );
}

// ─── R32 TAB — VISUAL BRACKET ────────────────────────────────────────────────
function R32Tab({ r32, viewMode, showRank }: { r32: R32Match[]; viewMode: string; showRank: boolean }) {
  const bySlot: Record<string, R32Match> = Object.fromEntries(r32.map(m => [m.slot, m]));

  const leftSlots  = ["R32-1","R32-2","R32-3","R32-4","R32-5","R32-6","R32-7","R32-8"];
  const rightSlots = ["R32-9","R32-10","R32-11","R32-12","R32-13","R32-14","R32-15","R32-16"];

  // Build Octavos pseudo-slots from R32 winners. Adjacent R32 slots pair into one Octavos slot:
  //  (R32-1, R32-2) → OCT-1, (R32-3, R32-4) → OCT-2, etc.
  const octPairs: [string, string][] = [
    ["R32-1", "R32-2"], ["R32-3", "R32-4"], ["R32-5", "R32-6"], ["R32-7", "R32-8"],
    ["R32-9", "R32-10"], ["R32-11", "R32-12"], ["R32-13", "R32-14"], ["R32-15", "R32-16"],
  ];
  const leftOctSlots: string[] = [];
  const rightOctSlots: string[] = [];
  octPairs.forEach(([aKey, bKey], idx) => {
    const a = bySlot[aKey];
    const b = bySlot[bKey];
    const octKey = `OCT-${idx + 1}`;
    bySlot[octKey] = {
      slot: octKey,
      homeDesc: `Ganador ${aKey}`,
      awayDesc: `Ganador ${bKey}`,
      homeTeam: a?.realWinner,
      awayTeam: b?.realWinner,
      // Treat as "confirmed" (gold) once the winner is locked in
      homeGroupDone: !!a?.realWinner,
      awayGroupDone: !!b?.realWinner,
    };
    if (idx < 4) leftOctSlots.push(octKey); else rightOctSlots.push(octKey);
  });

  return (
    <div>
      {/* Legend */}
      <div style={{ marginBottom: 14, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span><span style={{ color: "var(--gold)", fontWeight: 700 }}>Negrita dorada</span> = clasificado confirmado</span>
        <span><span style={{ color: "var(--text)" }}>Blanco</span> = pendiente de confirmar</span>
        <span><span style={{ color: "var(--green)" }}>*</span> = tercero provisional</span>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>← Desliza para ver el bracket completo →</div>
      {/* Bracket scroll container */}
      <div style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 8, WebkitOverflowScrolling: "touch", maxWidth: "100vw" } as React.CSSProperties}>
        <div style={{ display: "flex", gap: 0, minWidth: 900, alignItems: "stretch" }}>

          {/* LEFT R32 */}
          <BracketRound title="Ronda de 32" slots={leftSlots} bySlot={bySlot} count={8} showRank={showRank} />
          <BracketConnectors count={4} />

          {/* LEFT R16 */}
          <BracketRound title="Octavos" slots={leftOctSlots} bySlot={bySlot} count={4} showRank={showRank} />
          <BracketConnectors count={2} />

          {/* LEFT QF */}
          <BracketRound title="Cuartos" slots={[]} bySlot={bySlot} count={2} tbd />
          <BracketConnectors count={1} />

          {/* SEMI LEFT */}
          <BracketRound title="Semi" slots={[]} bySlot={bySlot} count={1} tbd />
          <BracketConnectors count={1} half />

          {/* FINAL */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 140 }}>
            <div style={rStyle.roundTitle as React.CSSProperties}>
              <span style={{ color: "var(--gold)" }}>Final</span>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <BracketMatch home="Semi 1" away="Semi 2" tbd />
            </div>
          </div>

          <BracketConnectors count={1} half reverse />

          {/* SEMI RIGHT */}
          <BracketRound title="Semi" slots={[]} bySlot={bySlot} count={1} tbd />
          <BracketConnectors count={1} />

          {/* RIGHT QF */}
          <BracketRound title="Cuartos" slots={[]} bySlot={bySlot} count={2} tbd />
          <BracketConnectors count={2} />

          {/* RIGHT R16 */}
          <BracketRound title="Octavos" slots={rightOctSlots} bySlot={bySlot} count={4} showRank={showRank} />
          <BracketConnectors count={4} />

          {/* RIGHT R32 */}
          <BracketRound title="Ronda de 32" slots={rightSlots} bySlot={bySlot} count={8} showRank={showRank} />

        </div>
      </div>
    </div>
  );
}

const TEAM_BOX_W = 200;
const TEAM_BOX_H = 28;

const rStyle = {
  roundTitle: {
    fontSize: 10, fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
    letterSpacing: "0.08em", textTransform: "uppercase" as const,
    color: "var(--text-muted)", textAlign: "center" as const,
    padding: "4px 6px", borderBottom: "1px solid var(--border)", marginBottom: 6,
  },
  teamBox: (known: boolean, isThird?: boolean, confirmed?: boolean): React.CSSProperties => ({
    padding: "0 8px",
    fontSize: 11,
    height: TEAM_BOX_H,
    width: TEAM_BOX_W,
    minWidth: TEAM_BOX_W,
    maxWidth: TEAM_BOX_W,
    boxSizing: "border-box" as const,
    display: "flex",
    alignItems: "center",
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    color: confirmed ? "var(--gold)" : (isThird && known) ? "var(--green)" : known ? "var(--text)" : "var(--text-muted)",
    fontWeight: confirmed ? 700 : 400,
    fontStyle: known ? "normal" : "italic",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
};

function BracketMatch({ home, away, homeM, awayM, tbd, showRank }: {
  home?: string; away?: string;
  homeM?: R32Match; awayM?: R32Match;
  tbd?: boolean; showRank?: boolean;
}) {
  const homeLabel = homeM?.homeTeam ? teamWithRank(homeM.homeTeam, showRank ?? false) : (homeM?.homeDesc ?? (tbd ? "—" : home || "—"));
  const awayLabel = awayM ? (
    awayM.awayTeam ? teamWithRank(awayM.awayTeam, showRank ?? false) : awayM.awayDesc
  ) : (tbd ? "—" : away || "—");
  const homeKnown = !!(homeM?.homeTeam) || (!tbd && !!home);
  const awayKnown = !!(awayM?.awayTeam) || (!tbd && !!away);
  const awayIsThird = awayM?.awayIsThird;
  const awayConfirmed = awayKnown && !awayM?.isTBD && !!(awayM?.awayGroupDone);
  const awayProvisional = awayIsThird && awayKnown && !awayConfirmed;
  const homeConfirmed = homeKnown && !tbd && !!(homeM?.homeGroupDone);

  // Score + winner info — homeM and awayM are the same slot for R32, distinct refs for paired rounds
  const hScore = homeM?.displayHomeScore;
  const aScore = (awayM === homeM ? awayM?.displayAwayScore : awayM?.displayHomeScore);
  const hasScores = (hScore !== null && hScore !== undefined) && (aScore !== null && aScore !== undefined);
  const realWinner = homeM?.realWinner;
  const homeIsWinner = !!(realWinner && homeM?.homeTeam && realWinner === homeM.homeTeam);
  const awayIsWinner = !!(realWinner && awayM?.awayTeam && realWinner === awayM.awayTeam);
  const wonOnPens = !!homeM?.wonOnPenalties;
  // Penalty scores in slot order (only show when both are present)
  const hPen = homeM?.penaltyHome;
  const aPen = (awayM === homeM ? awayM?.penaltyAway : awayM?.penaltyHome);
  const hasPenScores = wonOnPens && hPen !== null && hPen !== undefined && aPen !== null && aPen !== undefined;

  return (
    <div style={{ marginBottom: 0 }}>
      {/* Home team */}
      <div style={{
        ...rStyle.teamBox(homeKnown, false, homeConfirmed),
        borderRadius: "4px 4px 0 0",
        borderBottom: "none",
        justifyContent: "space-between",
        opacity: realWinner && !homeIsWinner ? 0.55 : 1,
        fontWeight: homeIsWinner ? 700 : (homeConfirmed ? 700 : 400),
        background: homeIsWinner ? "rgba(46,204,113,0.08)" : "var(--surface2)",
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {homeLabel}
        </span>
        {hasScores && (
          <span style={{ marginLeft: 6, fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: homeIsWinner ? "var(--green)" : "var(--text)", flexShrink: 0 }}>
            {hScore}{hasPenScores && <span style={{ fontSize: 11, marginLeft: 4, color: "var(--green)", fontWeight: 700 }}>({hPen})</span>}
          </span>
        )}
      </div>
      {/* Away team */}
      <div style={{
        ...rStyle.teamBox(awayKnown, awayIsThird, awayConfirmed),
        borderRadius: "0 0 4px 4px",
        justifyContent: "space-between",
        opacity: realWinner && !awayIsWinner ? 0.55 : 1,
        fontWeight: awayIsWinner ? 700 : (awayConfirmed ? 700 : 400),
        background: awayIsWinner ? "rgba(46,204,113,0.08)" : "var(--surface2)",
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {awayLabel}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {awayIsThird && awayProvisional && (
            <span style={{ fontSize: 10, color: "var(--green)", opacity: 0.8 }}>*</span>
          )}
          {hasScores && (
            <span style={{ marginLeft: 2, fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: awayIsWinner ? "var(--green)" : "var(--text)" }}>
              {aScore}{hasPenScores && <span style={{ fontSize: 11, marginLeft: 4, color: "var(--green)", fontWeight: 700 }}>({aPen})</span>}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function BracketRound({ title, slots, bySlot, count, tbd, showRank }: {
  title: string; slots: string[]; bySlot: Record<string, R32Match>;
  count: number; tbd?: boolean; showRank?: boolean;
}) {
  const items = Array.from({ length: count }, (_, i) => {
    const slot = slots[i];
    const m = slot ? bySlot[slot] : undefined;
    return { slot, m };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 202, flex: "0 0 auto" }}>
      <div style={rStyle.roundTitle as React.CSSProperties}>{title}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 4, padding: "4px 0" }}>
        {items.map(({ slot, m }, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {m ? (
              <BracketMatch homeM={m} awayM={m} showRank={showRank} />
            ) : (
              <BracketMatch tbd home="—" away="—" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketConnectors({ count, half, reverse }: { count: number; half?: boolean; reverse?: boolean }) {
  return (
    <div style={{ width: 16, display: "flex", flexDirection: "column", justifyContent: "space-around", flex: "0 0 auto", paddingTop: 22 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ height: "50%", borderRight: half && !reverse ? "none" : "1px solid var(--border)", borderTop: reverse ? "none" : "1px solid var(--border)", borderBottom: reverse ? "1px solid var(--border)" : "none" }} />
          <div style={{ height: "50%", borderRight: half && !reverse ? "none" : "1px solid var(--border)", borderTop: "none", borderBottom: "none" }} />
        </div>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif", fontSize: 28 }}>Cargando...</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  th: { padding: "10px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "center", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" },
  td: { padding: "12px 8px", fontSize: 14, textAlign: "center", color: "var(--text)" },
};

// ─── FIFA RANKING TAB ─────────────────────────────────────────────────────────
function FifaRankingTab() {
  const participatingTeams = new Set(WC2026_TEAMS as string[]);
  const filtered = FIFA_RANKINGS.filter(e => participatingTeams.has(e.name)).sort((a, b) => a.rank - b.rank);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-gold)" }}>
            <th style={{ ...s.th, width: 60 }}>RK</th>
            <th style={{ ...s.th, textAlign: "left" }}>Equipo</th>
            <th style={{ ...s.th, width: 110 }}>Puntos FIFA</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e, i) => (
            <tr key={e.code} style={{
              borderBottom: "1px solid var(--border)",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
            }}>
              <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)" }}>
                {e.rank}
              </td>
              <td style={{ ...s.td, textAlign: "left", fontWeight: 600 }}>{e.name}</td>
              <td style={{ ...s.td, color: "var(--text-muted)" }}>{e.pts?.toFixed(2) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── GOALSCORERS TAB ──────────────────────────────────────────────────────────
// Source: Wikipedia (as of June 24, 2026)
interface GoalScorer {
  player: string;
  country: string;
  code: string;
  goals: number;
}

const GOAL_SCORERS_DATA: GoalScorer[] = [
  // 6 goals
  { player: "Lionel Messi", country: "Argentina", code: "ARG", goals: 6 },
  { player: "Kylian Mbappé", country: "France", code: "FRA", goals: 6 },
  // 5 goals
  { player: "Erling Haaland", country: "Norway", code: "NOR", goals: 5 },
  // 4 goals
  { player: "Vinícius Júnior", country: "Brazil", code: "BRA", goals: 4 },
  { player: "Ousmane Dembélé", country: "France", code: "FRA", goals: 4 },
  // 3 goals
  { player: "Matheus Cunha", country: "Brazil", code: "BRA", goals: 3 },
  { player: "Jonathan David", country: "Canada", code: "CAN", goals: 3 },
  { player: "Yoane Wissa", country: "Congo DR", code: "COD", goals: 3 },
  { player: "Harry Kane", country: "England", code: "ENG", goals: 3 },
  { player: "Kai Havertz", country: "Germany", code: "GER", goals: 3 },
  { player: "Deniz Undav", country: "Germany", code: "GER", goals: 3 },
  { player: "Ismael Saibari", country: "Morocco", code: "MAR", goals: 3 },
  { player: "Julián Quiñones", country: "Mexico", code: "MEX", goals: 3 },
  { player: "Brian Brobbey", country: "Netherlands", code: "NED", goals: 3 },
  { player: "Cody Gakpo", country: "Netherlands", code: "NED", goals: 3 },
  { player: "Elijah Just", country: "New Zealand", code: "NZL", goals: 3 },
  { player: "Ismaïla Sarr", country: "Senegal", code: "SEN", goals: 3 },
  { player: "Johan Manzambi", country: "Switzerland", code: "SUI", goals: 3 },
  // 2 goals
  { player: "Riyad Mahrez", country: "Algeria", code: "ALG", goals: 2 },
  { player: "Marko Arnautović", country: "Austria", code: "AUT", goals: 2 },
  { player: "Leandro Trossard", country: "Belgium", code: "BEL", goals: 2 },
  { player: "Ermin Mahmić", country: "Bosnia and Herzegovina", code: "BIH", goals: 2 },
  { player: "Cyle Larin", country: "Canada", code: "CAN", goals: 2 },
  { player: "Daniel Muñoz", country: "Colombia", code: "COL", goals: 2 },
  { player: "Jude Bellingham", country: "England", code: "ENG", goals: 2 },
  { player: "Ramin Rezaeian", country: "Iran", code: "IRN", goals: 2 },
  { player: "Amad Diallo", country: "Ivory Coast", code: "CIV", goals: 2 },
  { player: "Nicolas Pépé", country: "Ivory Coast", code: "CIV", goals: 2 },
  { player: "Daichi Kamada", country: "Japan", code: "JPN", goals: 2 },
  { player: "Ayase Ueda", country: "Japan", code: "JPN", goals: 2 },
  { player: "Raúl Jiménez", country: "Mexico", code: "MEX", goals: 2 },
  { player: "Crysencio Summerville", country: "Netherlands", code: "NED", goals: 2 },
  { player: "Cristiano Ronaldo", country: "Portugal", code: "POR", goals: 2 },
  { player: "Pape Gueye", country: "Senegal", code: "SEN", goals: 2 },
  { player: "Mikel Oyarzabal", country: "Spain", code: "ESP", goals: 2 },
  { player: "Yasin Ayari", country: "Sweden", code: "SWE", goals: 2 },
  { player: "Anthony Elanga", country: "Sweden", code: "SWE", goals: 2 },
  { player: "Rubén Vargas", country: "Switzerland", code: "SUI", goals: 2 },
  { player: "Bradley Barcola", country: "France", code: "FRA", goals: 2 },
  { player: "Folarin Balogun", country: "United States", code: "USA", goals: 2 },
  { player: "Maximiliano Araújo", country: "Uruguay", code: "URU", goals: 2 },
  // 1 goal (well-known players and all Colombians for display)
  { player: "Amine Gouiri", country: "Algeria", code: "ALG", goals: 1 },
  { player: "Giovani Lo Celso", country: "Argentina", code: "ARG", goals: 1 },
  { player: "Lautaro Martínez", country: "Argentina", code: "ARG", goals: 1 },
  { player: "Marcel Sabitzer", country: "Austria", code: "AUT", goals: 1 },
  { player: "Kevin De Bruyne", country: "Belgium", code: "BEL", goals: 1 },
  { player: "Romelu Lukaku", country: "Belgium", code: "BEL", goals: 1 },
  { player: "Kerim Alajbegović", country: "Bosnia and Herzegovina", code: "BIH", goals: 1 },
  { player: "Casemiro", country: "Brazil", code: "BRA", goals: 1 },
  { player: "Gabriel Martinelli", country: "Brazil", code: "BRA", goals: 1 },
  { player: "Promise David", country: "Canada", code: "CAN", goals: 1 },
  { player: "Jaminton Campaz", country: "Colombia", code: "COL", goals: 1 },
  { player: "Luis Díaz", country: "Colombia", code: "COL", goals: 1 },
  { player: "Ante Budimir", country: "Croatia", code: "CRO", goals: 1 },
  { player: "Nikola Vlašić", country: "Croatia", code: "CRO", goals: 1 },
  { player: "Fiston Mayele", country: "Congo DR", code: "COD", goals: 1 },
  { player: "Nilson Angulo", country: "Ecuador", code: "ECU", goals: 1 },
  { player: "Gonzalo Plata", country: "Ecuador", code: "ECU", goals: 1 },
  { player: "Mohamed Salah", country: "Egypt", code: "EGY", goals: 1 },
  { player: "Trézéguet", country: "Egypt", code: "EGY", goals: 1 },
  { player: "Marcus Rashford", country: "England", code: "ENG", goals: 1 },
  { player: "Désiré Doué", country: "France", code: "FRA", goals: 1 },
  { player: "Jamal Musiala", country: "Germany", code: "GER", goals: 1 },
  { player: "Leroy Sané", country: "Germany", code: "GER", goals: 1 },
  { player: "Wilson Isidor", country: "Haiti", code: "HAI", goals: 1 },
  { player: "Daizen Maeda", country: "Japan", code: "JPN", goals: 1 },
  { player: "Musa Al-Taamari", country: "Jordan", code: "JOR", goals: 1 },
  { player: "Achraf Hakimi", country: "Morocco", code: "MAR", goals: 1 },
  { player: "Soufiane Rahimi", country: "Morocco", code: "MAR", goals: 1 },
  { player: "Virgil van Dijk", country: "Netherlands", code: "NED", goals: 1 },
  { player: "Antonio Nusa", country: "Norway", code: "NOR", goals: 1 },
  { player: "Rafael Leão", country: "Portugal", code: "POR", goals: 1 },
  { player: "John McGinn", country: "Scotland", code: "SCO", goals: 1 },
  { player: "Iliman Ndiaye", country: "Senegal", code: "SEN", goals: 1 },
  { player: "Lamine Yamal", country: "Spain", code: "ESP", goals: 1 },
  { player: "Viktor Gyökeres", country: "Sweden", code: "SWE", goals: 1 },
  { player: "Alexander Isak", country: "Sweden", code: "SWE", goals: 1 },
  { player: "Breel Embolo", country: "Switzerland", code: "SUI", goals: 1 },
  { player: "Granit Xhaka", country: "Switzerland", code: "SUI", goals: 1 },
  { player: "Hazem Mastouri", country: "Tunisia", code: "TUN", goals: 1 },
  { player: "Arda Güler", country: "Turkey", code: "TUR", goals: 1 },
  { player: "Giovanni Reyna", country: "United States", code: "USA", goals: 1 },
  { player: "Eldor Shomurodov", country: "Uzbekistan", code: "UZB", goals: 1 },
];

// Maps a user's topScorer pick string (format: "(CODE) Lastname, Firstname") to current goals.
// Some players have multiple pick spellings in WC2026_SCORERS — we map all variants.
const PICK_TO_GOALS: Record<string, number> = {
  // 6 goals
  "(ARG) Messi, Lionel": 6,
  "(FRA) Mbappé, Kylian": 6,
  "(FRA) Mbappe, Kylian": 6,
  // 5 goals
  "(NOR) Haaland, Erling Braut": 5,
  // 4 goals
  "(BRA) Vinicius Jr.": 4,
  "(BRA) De Oliveira Junior, Vinicius": 4,
  "(FRA) Dembélé, Ousmane": 4,
  "(FRA) Dembele, Ousmane": 4,
  // 3 goals
  "(BRA) Cunha, Matheus": 3,
  "(CAN) David, Jonathan": 3,
  "(COD) Wissa, Yoane": 3,
  "(ENG) Kane, Harry": 3,
  "(GER) Havertz, Kai": 3,
  "(GER) Undav, Deniz": 3,
  "(MAR) Saibari, Ismael": 3,
  "(NED) Brobbey, Brian": 3,
  "(NED) Gakpo, Cody": 3,
  "(SEN) Sarr, Ismaila": 3,
  // 2 goals
  "(ALG) Mahrez, Riyad": 2,
  "(AUT) Arnautovic, Marko": 2,
  "(BEL) Trossard, Leandro": 2,
  "(CAN) Larin, Cyle": 2,
  "(ENG) Bellingham, Jude": 2,
  "(JPN) Kamada, Daichi": 2,
  "(JPN) Ueda, Ayase": 2,
  "(CIV) Diallo, Amad": 2,
  "(CIV) Pépé, Nicolas": 2,
  "(MEX) Quiñones, Julián": 3,
  "(MEX) Quinones, Julian": 3,
  "(NED) Summerville, Crysencio": 2,
  "(POR) Ronaldo, Cristiano": 2,
  "(ESP) Oyarzabal, Mikel": 2,
  "(ESP) Oyarzabal Ugarte, Mikiel": 2,
  "(SWE) Elanga, Anthony": 2,
  "(SUI) Vargas, Ruben": 2,
  "(USA) Balogun, Folarin": 2,
  "(FRA) Barcola, Bradley": 2,
  // 1 goal
  "(ALG) Gouiri, Amine": 1,
  "(ARG) Lautaro Martínez": 1,
  "(ARG) Martinez, Lautaro": 1,
  "(BEL) De Bruyne, Kevin": 1,
  "(BEL) Lukaku, Romelu": 1,
  "(BIH) Alajbegovic, Kerim": 1,
  "(CAN) David, Promise": 1,
  "(COL) Díaz, Luis": 1,
  "(COL) Diaz, Luis": 1,
  "(CRO) Budimir, Ante": 1,
  "(CRO) Vlašić, Nikola": 1,
  "(CRO) Vlasic, Nikola": 1,
  "(ECU) Angulo, Nilson": 1,
  "(ECU) Plata, Gonzalo": 1,
  "(EGY) Salah, Mohamed": 1,
  "(EGY) Trezeguet": 1,
  "(ENG) Rashford, Marcus": 1,
  "(FRA) Doué, Désiré": 1,
  "(FRA) Doue, Desire": 1,
  "(GER) Musiala, Jamal": 1,
  "(GER) Sane, Leroy": 1,
  "(HAI) Isidor, Wilson": 1,
  "(JOR) Al Taamari, Musa": 1,
  "(JPN) Maeda, Daizen": 1,
  "(UZB) Shomurodov, Eldor": 1,
  "(MEX) Raúl Jiménez": 2,
  "(MEX) Jimenez, Raul": 2,
  "(MAR) Hakimi, Achraf": 1,
  "(MAR) Rahimi, Soufiane": 1,
  "(NED) Van Dijk, Virgil": 1,
  "(NOR) Nusa, Antonio": 1,
  "(POR) Leão, Rafael": 1,
  "(POR) Leao, Rafael": 1,
  "(SCO) McGinn, John": 1,
  "(ESP) Yamal, Lamine": 1,
  "(SWE) Gyökeres, Viktor": 1,
  "(SWE) Gyokeres, Viktor": 1,
  "(SWE) Isak, Alexander": 1,
  "(SUI) Embolo, Breel": 1,
  "(SUI) Xhaka, Granit": 1,
  "(TUN) Mastouri, Hazem": 1,
  "(TUR) Güler, Arda": 1,
  "(TUR) Guler, Arda": 1,
  "(USA) Reyna, Giovanni": 1,
};

function GoalscorersTab({ users, matches }: { users: UserProfile[]; matches: Match[] }) {
  // Compute eliminated teams:
  // (a) Any team that lost a finished knockout match (including penalty loss)
  // (b) Any team that played group stage but didn't advance to R32
  const KO_ROUNDS = new Set(["Ronda de 32", "Octavos de Final", "Cuartos de Final", "Semifinal", "Tercer Puesto", "Final"]);
  const eliminatedTeams = new Set<string>();

  // (a) knockout losers
  for (const m of matches) {
    if (!KO_ROUNDS.has(m.round)) continue;
    if (m.status !== "finished") continue;
    if (m.homeScore === null || m.awayScore === null) continue;
    if (m.homeScore > m.awayScore) eliminatedTeams.add(m.awayTeam);
    else if (m.awayScore > m.homeScore) eliminatedTeams.add(m.homeTeam);
    else {
      if (m.penaltyWinner === "home") eliminatedTeams.add(m.awayTeam);
      else if (m.penaltyWinner === "away") eliminatedTeams.add(m.homeTeam);
    }
  }

  // (b) group-stage eliminated: only apply once the R32 bracket is fully set (all 16 matches created)
  const r32Matches = matches.filter(m => m.round === "Ronda de 32");
  if (r32Matches.length >= 16) {
    const r32Teams = new Set<string>();
    for (const m of r32Matches) { r32Teams.add(m.homeTeam); r32Teams.add(m.awayTeam); }
    for (const m of matches) {
      if (!m.group) continue; // only look at group-stage matches
      if (!r32Teams.has(m.homeTeam)) eliminatedTeams.add(m.homeTeam);
      if (!r32Teams.has(m.awayTeam)) eliminatedTeams.add(m.awayTeam);
    }
  }

  const isElim = (country: string) => eliminatedTeams.has(country);

  // Sort: goals desc → non-eliminated first → FIFA rank asc → player name
  const cmp = (a: GoalScorer, b: GoalScorer) =>
    b.goals - a.goals
    || (isElim(a.country) ? 1 : 0) - (isElim(b.country) ? 1 : 0)
    || getFifaRank(a.country) - getFifaRank(b.country)
    || a.player.localeCompare(b.player);

  const sorted = [...GOAL_SCORERS_DATA].sort(cmp);
  // Assign tie-aware positions (only goals tied → share position)
  const sortedWithPos: (GoalScorer & { pos: number })[] = [];
  {
    let lastG = -1, lastP = 0;
    sorted.forEach((sc, i) => {
      const pos = sc.goals === lastG ? lastP : i + 1;
      sortedWithPos.push({ ...sc, pos });
      lastG = sc.goals;
      lastP = pos;
    });
  }

  // Pinned players — always shown in the top list even if outside the top 10
  const PINNED_PLAYERS: { displayName: string; country: string; code: string }[] = [
    { displayName: "Michael Olise", country: "France", code: "FRA" },
    { displayName: "Harry Kane", country: "England", code: "ENG" },
    { displayName: "Kylian Mbappé", country: "France", code: "FRA" },
  ];

  // Start with top 10
  const topListSet: (GoalScorer & { pos: number; pinned?: boolean })[] = sortedWithPos.slice(0, 15);

  // Append pinned players that aren't already in the top 10
  for (const pp of PINNED_PLAYERS) {
    if (topListSet.some(t => t.player === pp.displayName)) continue;
    const found = sortedWithPos.find(sc => sc.player === pp.displayName);
    if (found) {
      topListSet.push({ ...found, pinned: true });
    } else {
      // Player hasn't scored — show with 0 goals and no position
      topListSet.push({ player: pp.displayName, country: pp.country, code: pp.code, goals: 0, pos: 0, pinned: true });
    }
  }

  // Mark already-in-top10 pinned players too
  for (const row of topListSet) {
    if (PINNED_PLAYERS.some(p => p.displayName === row.player)) row.pinned = true;
  }

  // Always include ALL Colombian players who have scored — no special distinction
  for (const sc of sortedWithPos) {
    if (sc.country !== "Colombia") continue;
    if (topListSet.some(t => t.player === sc.player)) continue;
    topListSet.push({ ...sc }); // no pinned flag
  }

  // Re-sort the combined list with the same rule (goals → eliminated last → FIFA → name)
  const topList = topListSet.sort(cmp);

  // Build picks list: every user that has a topScorer pick (admins included or excluded? exclude admins)
  const picksList = users
    .filter(u => !u.isAdmin && u.topScorer)
    .map(u => ({
      displayName: u.displayName,
      pick: u.topScorer as string,
      goals: PICK_TO_GOALS[u.topScorer as string] ?? 0,
    }))
    .sort((a, b) => b.goals - a.goals || a.displayName.localeCompare(b.displayName));

  return (
    <div>
      {/* Top 10 */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.06em", marginBottom: 4 }}>
          ⚽ TOP GOLEADORES
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Goleadores del Mundial 2026 — actualizado al 30 de junio, 2026 · <span style={{ color: "var(--gold)" }}>📌 = jugador destacado</span>
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-gold)" }}>
                <th style={{ ...s.th, width: 60 }}>Pos</th>
                <th style={{ ...s.th, textAlign: "left" }}>Nombre</th>
                <th style={{ ...s.th, textAlign: "left" }}>País</th>
                <th style={{ ...s.th, width: 80 }}>Goles</th>
              </tr>
            </thead>
            <tbody>
              {topList.map((sc, i) => (
                <tr key={i} style={{
                  borderBottom: "1px solid var(--border)",
                  background: sc.pinned ? "rgba(201,168,76,0.06)" : (i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"),
                }}>
                  <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: sc.pos > 0 ? "var(--gold)" : "var(--text-muted)" }}>
                    {sc.pos > 0 ? sc.pos : "—"}
                  </td>
                  <td style={{ ...s.td, textAlign: "left", fontWeight: 600 }}>
                    {sc.pinned && <span style={{ marginRight: 6, fontSize: 12 }}>📌</span>}
                    {sc.player}
                  </td>
                  <td style={{ ...s.td, textAlign: "left", color: "var(--text-muted)" }}>
                    <span style={{ opacity: isElim(sc.country) ? 0.6 : 1 }}>
                      {sc.country} <span style={{ fontSize: 11, opacity: 0.7 }}>({sc.code})</span>
                    </span>
                    {isElim(sc.country) && (
                      <span style={{
                        marginLeft: 8, fontSize: 10, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                        color: "var(--red)", background: "rgba(231,76,60,0.12)",
                        border: "1px solid rgba(231,76,60,0.35)", borderRadius: 4,
                        padding: "2px 6px", letterSpacing: "0.06em",
                      }}>ELIMINADO</span>
                    )}
                  </td>
                  <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: sc.goals > 0 ? "var(--text)" : "var(--text-muted)" }}>
                    {sc.goals}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Participants' picks */}
      <div>
        <h2 style={{ fontSize: 18, color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.06em", marginBottom: 4 }}>
          🎯 PICKS DE LOS PARTICIPANTES
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Goleadores escogidos por cada participante y sus goles actuales
        </p>
        {picksList.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
            Ningún participante ha registrado su pick de goleador.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-gold)" }}>
                  <th style={{ ...s.th, textAlign: "left" }}>Participante</th>
                  <th style={{ ...s.th, textAlign: "left" }}>Su Pick</th>
                  <th style={{ ...s.th, width: 80 }}>Goles</th>
                </tr>
              </thead>
              <tbody>
                {picksList.map((p, i) => (
                  <tr key={i} style={{
                    borderBottom: "1px solid var(--border)",
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                  }}>
                    <td style={{ ...s.td, textAlign: "left", fontWeight: 600 }}>{p.displayName}</td>
                    <td style={{ ...s.td, textAlign: "left", color: "var(--text-muted)", fontSize: 13 }}>{p.pick}</td>
                    <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: p.goals > 0 ? "var(--green)" : "var(--text-muted)" }}>
                      {p.goals}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
