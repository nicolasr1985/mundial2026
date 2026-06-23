export interface FifaEntry {
  rank: number;
  name: string;
  code: string;
  pts?: number;
}

export const FIFA_RANKINGS: FifaEntry[] = [
  { rank: 1, name: "Argentina", code: "ARG", pts: 1901.93 },
  { rank: 2, name: "France", code: "FRA", pts: 1894.4 },
  { rank: 3, name: "Spain", code: "ESP", pts: 1864.32 },
  { rank: 4, name: "England", code: "ENG", pts: 1847.68 },
  { rank: 5, name: "Brazil", code: "BRA", pts: 1772.01 },
  { rank: 6, name: "Morocco", code: "MAR", pts: 1769.98 },
  { rank: 7, name: "Netherlands", code: "NED", pts: 1764.4 },
  { rank: 8, name: "Germany", code: "GER", pts: 1760.46 },
  { rank: 9, name: "Portugal", code: "POR", pts: 1755.09 },
  { rank: 10, name: "Belgium", code: "BEL", pts: 1727.87 },
  { rank: 11, name: "Mexico", code: "MEX", pts: 1721.78 },
  { rank: 12, name: "Colombia", code: "COL", pts: 1712.6 },
  { rank: 13, name: "United States", code: "USA", pts: 1709.59 },
  { rank: 14, name: "Italy", code: "ITA", pts: 1704.73 },
  { rank: 15, name: "Croatia", code: "CRO", pts: 1695.21 },
  { rank: 16, name: "Japan", code: "JPN", pts: 1681.26 },
  { rank: 17, name: "Switzerland", code: "SUI", pts: 1654.94 },
  { rank: 18, name: "Uruguay", code: "URU", pts: 1649.96 },
  { rank: 19, name: "Senegal", code: "SEN", pts: 1638.36 },
  { rank: 20, name: "Denmark", code: "DEN", pts: 1619.47 },
  { rank: 21, name: "Iran", code: "IRN", pts: 1611.18 },
  { rank: 22, name: "Norway", code: "NOR", pts: 1606.48 },
  { rank: 23, name: "Austria", code: "AUT", pts: 1599.99 },
  { rank: 24, name: "South Korea", code: "KOR", pts: 1591.75 },
  { rank: 25, name: "Nigeria", code: "NGA", pts: 1585.02 },
  { rank: 26, name: "Australia", code: "AUS", pts: 1584.55 },
  { rank: 27, name: "Egypt", code: "EGY", pts: 1583.37 },
  { rank: 28, name: "Algeria", code: "ALG", pts: 1575.64 },
  { rank: 29, name: "Canada", code: "CAN", pts: 1572.13 },
  { rank: 30, name: "Ecuador", code: "ECU", pts: 1558.35 },
  { rank: 31, name: "Ivory Coast", code: "CIV", pts: 1551.71 },
  { rank: 32, name: "Turkey", code: "TUR", pts: 1550.13 },
  { rank: 33, name: "Ukraine", code: "UKR", pts: 1549.29 },
  { rank: 34, name: "Russia", code: "RUS", pts: 1529.6 },
  { rank: 35, name: "Poland", code: "POL", pts: 1526.18 },
  { rank: 36, name: "Sweden", code: "SWE", pts: 1517.99 },
  { rank: 37, name: "Paraguay", code: "PAR", pts: 1517.39 },
  { rank: 38, name: "Wales", code: "WAL", pts: 1516.95 },
  { rank: 39, name: "Hungary", code: "HUN", pts: 1506.39 },
  { rank: 40, name: "Panama", code: "PAN", pts: 1505.33 },
  { rank: 41, name: "Scotland", code: "SCO", pts: 1504.41 },
  { rank: 42, name: "Serbia", code: "SRB", pts: 1502.13 },
  { rank: 43, name: "Congo DR", code: "COD", pts: 1487.18 },
  { rank: 44, name: "Czechia", code: "CZE", pts: 1481.49 },
  { rank: 45, name: "Cameroon", code: "CMR", pts: 1481.24 },
  { rank: 46, name: "Slovakia", code: "SVK", pts: 1473.66 },
  { rank: 47, name: "Greece", code: "GRE", pts: 1473.19 },
  { rank: 48, name: "Venezuela", code: "VEN", pts: 1469.18 },
];

export function getFifaRank(team: string): number {
  const entry = FIFA_RANKINGS.find(e => e.name === team);
  return entry?.rank ?? 999;
}

export function teamWithRank(team: string, show: boolean): string {
  if (!show) return team;
  const rank = getFifaRank(team);
  return rank < 999 ? `${team} (${rank})` : team;
}

export function canSeeRanking(email?: string | null, pref?: boolean): boolean {
  if (email === "nicolasr9@gmail.com") return true;
  return pref === true;
}
