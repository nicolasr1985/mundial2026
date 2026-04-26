// app/standings/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getMatches, getUserPicks, Match } from "@/lib/firebase";
import { teamWithRank, canSeeRanking } from "@/lib/fifa-ranking";

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
}

// ─── STANDINGS CALCULATOR ────────────────────────────────────────────────────
// FIFA tiebreaker order:
// 1) Points  2) Goal difference  3) Goals scored
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
    if (!standings[g][m.homeTeam]) standings[g][m.homeTeam] = { team: m.homeTeam, group: g, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
    if (!standings[g][m.awayTeam]) standings[g][m.awayTeam] = { team: m.awayTeam, group: g, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
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
  }
  const result: Record<string, TeamStat[]> = {};
  for (const g in standings) {
    result[g] = Object.values(standings[g]).sort((a, b) =>
      b.points - a.points ||          // 1. Points
      b.gd - a.gd ||                  // 2. Goal difference
      b.gf - a.gf ||                  // 3. Goals scored
      // 4. Conduct score — not tracked
      fifaRankOf(a.team) - fifaRankOf(b.team)  // 5-6. FIFA ranking
    );
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
    fifaRankOf(a.team) - fifaRankOf(b.team)
  );
  return sorted.map((t, i) => ({ ...t, qualifies: i < 8 }));
}

// ─── R32 BRACKET BUILDER ─────────────────────────────────────────────────────
function buildR32(standings: Record<string, TeamStat[]>): R32Match[] {
  const get = (pos: number, group: string): string | undefined => {
    const teams = standings[group];
    if (!teams || teams.length < pos) return undefined;
    return teams[pos - 1]?.team;
  };

  // Get the 8 qualifying thirds and their groups
  const thirds = getThirdPlaceTable(standings);
  const qualifyingThirdGroups = thirds.filter(t => t.qualifies).map(t => t.group).sort();
  const key = qualifyingThirdGroups.join("");

  // Assign thirds to slots based on FIFA lookup table
  // We implement the most important rule: thirds go to specific slots based on their group
  const thirdAssignments = assignThirds(qualifyingThirdGroups, thirds);

  return [
    // LEFT SIDE — top to bottom
    { slot: "R32-1",  homeDesc: "1° Grupo E",  awayDesc: "3° (A/B/C/D/F)", homeTeam: get(1,"E"), awayTeam: thirdAssignments["ABCDF"], awayIsThird: true, awayThirdGroups: "ABCDF", isTBD: !thirdAssignments["ABCDF"] },
    { slot: "R32-2",  homeDesc: "1° Grupo I",  awayDesc: "3° (C/D/F/G/H)", homeTeam: get(1,"I"), awayTeam: thirdAssignments["CDFGH"], awayIsThird: true, awayThirdGroups: "CDFGH", isTBD: !thirdAssignments["CDFGH"] },
    { slot: "R32-3",  homeDesc: "2° Grupo A",  awayDesc: "2° Grupo B",     homeTeam: get(2,"A"), awayTeam: get(2,"B") },
    { slot: "R32-4",  homeDesc: "1° Grupo F",  awayDesc: "2° Grupo C",     homeTeam: get(1,"F"), awayTeam: get(2,"C") },
    { slot: "R32-5",  homeDesc: "2° Grupo K",  awayDesc: "2° Grupo L",     homeTeam: get(2,"K"), awayTeam: get(2,"L") },
    { slot: "R32-6",  homeDesc: "1° Grupo H",  awayDesc: "2° Grupo J",     homeTeam: get(1,"H"), awayTeam: get(2,"J") },
    { slot: "R32-7",  homeDesc: "1° Grupo D",  awayDesc: "3° (B/E/F/I/J)", homeTeam: get(1,"D"), awayTeam: thirdAssignments["BEFIJ"], awayIsThird: true, awayThirdGroups: "BEFIJ", isTBD: !thirdAssignments["BEFIJ"] },
    { slot: "R32-8",  homeDesc: "1° Grupo G",  awayDesc: "3° (A/E/H/I/J)", homeTeam: get(1,"G"), awayTeam: thirdAssignments["AEHIJ"], awayIsThird: true, awayThirdGroups: "AEHIJ", isTBD: !thirdAssignments["AEHIJ"] },
    // RIGHT SIDE — top to bottom
    { slot: "R32-9",  homeDesc: "1° Grupo C",  awayDesc: "2° Grupo F",     homeTeam: get(1,"C"), awayTeam: get(2,"F") },
    { slot: "R32-10", homeDesc: "2° Grupo E",  awayDesc: "2° Grupo I",     homeTeam: get(2,"E"), awayTeam: get(2,"I") },
    { slot: "R32-11", homeDesc: "1° Grupo A",  awayDesc: "3° (C/E/F/H/I)", homeTeam: get(1,"A"), awayTeam: thirdAssignments["CEFHI"], awayIsThird: true, awayThirdGroups: "CEFHI", isTBD: !thirdAssignments["CEFHI"] },
    { slot: "R32-12", homeDesc: "1° Grupo L",  awayDesc: "3° (E/H/I/J/K)", homeTeam: get(1,"L"), awayTeam: thirdAssignments["EHIJK"], awayIsThird: true, awayThirdGroups: "EHIJK", isTBD: !thirdAssignments["EHIJK"] },
    { slot: "R32-13", homeDesc: "1° Grupo J",  awayDesc: "2° Grupo H",     homeTeam: get(1,"J"), awayTeam: get(2,"H") },
    { slot: "R32-14", homeDesc: "2° Grupo D",  awayDesc: "2° Grupo G",     homeTeam: get(2,"D"), awayTeam: get(2,"G") },
    { slot: "R32-15", homeDesc: "1° Grupo B",  awayDesc: "3° (E/F/G/I/J)", homeTeam: get(1,"B"), awayTeam: thirdAssignments["EFGIJ"], awayIsThird: true, awayThirdGroups: "EFGIJ", isTBD: !thirdAssignments["EFGIJ"] },
    { slot: "R32-16", homeDesc: "1° Grupo K",  awayDesc: "3° (D/E/I/J/L)", homeTeam: get(1,"K"), awayTeam: thirdAssignments["DEIJL"], awayIsThird: true, awayThirdGroups: "DEIJL", isTBD: !thirdAssignments["DEIJL"] },
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
  const { user, loading } = useAuth();
  const showRank = canSeeRanking(user?.email);
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [userPickMap, setUserPickMap] = useState<Record<string, { homeScore: number; awayScore: number }>>({});
  const [activeGroup, setActiveGroup] = useState("A");
  const [viewMode, setViewMode] = useState<"real" | "predicted">("real");
  const [activeTab, setActiveTab] = useState<"groups" | "thirds" | "r32">("groups");
  const [fetching, setFetching] = useState(true);

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [m, up] = await Promise.all([getMatches(), getUserPicks(user.uid)]);
      setMatches(m);
      const pickMap: Record<string, { homeScore: number; awayScore: number }> = {};
      up.forEach((p) => { pickMap[p.matchId] = { homeScore: p.homeScore, awayScore: p.awayScore }; });
      setUserPickMap(pickMap);
    } catch (e) { console.warn(e); }
    finally { setFetching(false); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const groupMatches = matches.filter((m) => m.round?.startsWith("Fase de Grupos"));
  const availableGroups = Array.from(new Set(groupMatches.map((m) => m.group).filter(Boolean) as string[])).sort();

  const realFinished = groupMatches.filter((m) => m.status === "finished" && m.homeScore !== null);
  const realStandings = computeGroupStandings(realFinished, groupMatches);
  const realThirds = getThirdPlaceTable(realStandings);
  const realR32 = buildR32(realStandings);

  const predictedMatches = groupMatches.map((m) => {
    const p = userPickMap[m.id];
    if (!p) return null;
    const hs = Number(p.homeScore), as_ = Number(p.awayScore);
    if (isNaN(hs) || isNaN(as_)) return null;
    return { ...m, homeScore: hs, awayScore: as_, status: "finished" as const };
  }).filter(Boolean) as Match[];
  const predictedStandings = computeGroupStandings(predictedMatches, groupMatches);
  const predictedThirds = getThirdPlaceTable(predictedStandings);
  const predictedR32 = buildR32(predictedStandings);

  // Build simple standings map for display (team name by position)
  const displayStandings = viewMode === "real" ? realStandings : predictedStandings;
  const displayThirds = viewMode === "real" ? realThirds : predictedThirds;
  const displayR32 = viewMode === "real" ? realR32 : predictedR32;
  const groupTable = displayStandings[activeGroup] || [];

  if (loading || fetching) return <Loading />;

  return (
    <div className="page animate-fade-up">
      <h1 style={{ fontSize: 36, marginBottom: 4 }}><span className="gold-text">TABLA</span></h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        Posiciones, terceros y cuadro de Ronda de 32
      </p>

      {/* View mode toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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
          { id: "r32",    label: "⚔️ Ronda de 32" },
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

      {availableGroups.length === 0 ? (
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
  const bySlot = Object.fromEntries(r32.map(m => [m.slot, m]));

  const leftSlots  = ["R32-1","R32-2","R32-3","R32-4","R32-5","R32-6","R32-7","R32-8"];
  const rightSlots = ["R32-9","R32-10","R32-11","R32-12","R32-13","R32-14","R32-15","R32-16"];

  return (
    <div>
      {/* Legend */}
      <div style={{ marginBottom: 14, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span><span style={{ color: "var(--gold)", fontWeight: 700 }}>Negrita dorada</span> = clasificado confirmado</span>
        <span><span style={{ color: "var(--text)" }}>Blanco</span> = pendiente de confirmar</span>
        <span><span style={{ color: "var(--green)" }}>*</span> = tercero provisional</span>
      </div>

      {/* Bracket scroll container */}
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ display: "flex", gap: 0, minWidth: 900, alignItems: "stretch" }}>

          {/* LEFT R32 */}
          <BracketRound title="Ronda de 32" slots={leftSlots} bySlot={bySlot} count={8} showRank={showRank} />
          <BracketConnectors count={4} />

          {/* LEFT R16 */}
          <BracketRound title="Octavos" slots={[]} bySlot={bySlot} count={4} tbd />
          <BracketConnectors count={2} />

          {/* LEFT QF */}
          <BracketRound title="Cuartos" slots={[]} bySlot={bySlot} count={2} tbd />
          <BracketConnectors count={1} />

          {/* SEMI LEFT */}
          <BracketRound title="Semi" slots={[]} bySlot={bySlot} count={1} tbd />
          <BracketConnectors count={1} half />

          {/* FINAL */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 150 }}>
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
          <BracketRound title="Octavos" slots={[]} bySlot={bySlot} count={4} tbd />
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
  const homeLabel = homeM?.homeTeam ? teamWithRank(homeM.homeTeam, showRank ?? false) : (tbd ? "—" : home || "—");
  const awayLabel = awayM ? (
    awayM.awayTeam ? teamWithRank(awayM.awayTeam, showRank ?? false) : awayM.awayDesc
  ) : (tbd ? "—" : away || "—");
  const homeKnown = !!(homeM?.homeTeam) || (!tbd && !!home);
  const awayKnown = !!(awayM?.awayTeam) || (!tbd && !!away);
  const awayIsThird = awayM?.awayIsThird;
  const awayConfirmed = awayIsThird && !awayM?.isTBD && awayKnown;
  const awayProvisional = awayIsThird && awayM?.isTBD && awayKnown;
  // Home is confirmed if it has a real team (1st or 2nd place is always confirmed once known)
  const homeConfirmed = homeKnown && !tbd;

  return (
    <div style={{ marginBottom: 0 }}>
      {/* Home team */}
      <div style={{ ...rStyle.teamBox(homeKnown, false, homeConfirmed), borderRadius: "4px 4px 0 0", borderBottom: "none" }}>
        {homeLabel}
      </div>
      {/* Away team */}
      <div style={{ ...rStyle.teamBox(awayKnown, awayIsThird, awayConfirmed), borderRadius: "0 0 4px 4px", justifyContent: "space-between" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {awayLabel}
        </span>
        {awayIsThird && awayProvisional && (
          <span style={{ fontSize: 10, color: "var(--green)", marginLeft: 4, flexShrink: 0, opacity: 0.8 }}>*</span>
        )}
        {awayIsThird && !awayKnown && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4, flexShrink: 0 }}>*</span>
        )}
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
