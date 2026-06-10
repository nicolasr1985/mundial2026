// lib/fifa-ranking.ts
// FIFA World Rankings — updated June 2026

export interface FifaEntry {
  rank: number;
  name: string;
  code: string;
}

export const FIFA_RANKINGS: FifaEntry[] = [
  { rank: 1, name: "Argentina", code: "ARG" },
  { rank: 2, name: "Spain", code: "ESP" },
  { rank: 3, name: "France", code: "FRA" },
  { rank: 4, name: "England", code: "ENG" },
  { rank: 5, name: "Portugal", code: "POR" },
  { rank: 6, name: "Brazil", code: "BRA" },
  { rank: 7, name: "Morocco", code: "MAR" },
  { rank: 8, name: "Netherlands", code: "NED" },
  { rank: 9, name: "Belgium", code: "BEL" },
  { rank: 10, name: "Germany", code: "GER" },
  { rank: 11, name: "Croatia", code: "CRO" },
  { rank: 12, name: "Italy", code: "ITA" },
  { rank: 13, name: "Colombia", code: "COL" },
  { rank: 14, name: "Mexico", code: "MEX" },
  { rank: 15, name: "Senegal", code: "SEN" },
  { rank: 16, name: "Uruguay", code: "URU" },
  { rank: 17, name: "United States", code: "USA" },
  { rank: 18, name: "Japan", code: "JPN" },
  { rank: 19, name: "Switzerland", code: "SUI" },
  { rank: 20, name: "Denmark", code: "DEN" },
  { rank: 21, name: "Iran", code: "IRN" },
  { rank: 22, name: "Turkey", code: "TUR" },
  { rank: 23, name: "Ecuador", code: "ECU" },
  { rank: 24, name: "Austria", code: "AUT" },
  { rank: 25, name: "South Korea", code: "KOR" },
  { rank: 26, name: "Nigeria", code: "NGA" },
  { rank: 27, name: "Australia", code: "AUS" },
  { rank: 28, name: "Algeria", code: "ALG" },
  { rank: 29, name: "Egypt", code: "EGY" },
  { rank: 30, name: "Canada", code: "CAN" },
  { rank: 31, name: "Norway", code: "NOR" },
  { rank: 32, name: "Ukraine", code: "UKR" },
  { rank: 33, name: "Ivory Coast", code: "CIV" },
  { rank: 34, name: "Panama", code: "PAN" },
  { rank: 35, name: "Russia", code: "RUS" },
  { rank: 36, name: "Poland", code: "POL" },
  { rank: 37, name: "Wales", code: "WAL" },
  { rank: 38, name: "Sweden", code: "SWE" },
  { rank: 39, name: "Czechia", code: "CZE" },
  { rank: 40, name: "Paraguay", code: "PAR" },
  { rank: 41, name: "Hungary", code: "HUN" },
  { rank: 42, name: "Scotland", code: "SCO" },
  { rank: 43, name: "Serbia", code: "SRB" },
  { rank: 44, name: "Cameroon", code: "CMR" },
  { rank: 45, name: "Congo DR", code: "COD" },
  { rank: 46, name: "Tunisia", code: "TUN" },
  { rank: 47, name: "Slovakia", code: "SVK" },
  { rank: 48, name: "Greece", code: "GRE" },
  { rank: 49, name: "Venezuela", code: "VEN" },
  { rank: 50, name: "Uzbekistan", code: "UZB" },
  { rank: 51, name: "Peru", code: "PER" },
  { rank: 52, name: "Costa Rica", code: "CRC" },
  { rank: 53, name: "Romania", code: "ROU" },
  { rank: 54, name: "Mali", code: "MLI" },
  { rank: 55, name: "Chile", code: "CHI" },
  { rank: 56, name: "Iraq", code: "IRQ" },
  { rank: 57, name: "Qatar", code: "QAT" },
  { rank: 58, name: "Republic of Ireland", code: "IRL" },
  { rank: 59, name: "Slovenia", code: "SVN" },
  { rank: 60, name: "South Africa", code: "RSA" },
  { rank: 61, name: "Saudi Arabia", code: "KSA" },
  { rank: 62, name: "Burkina Faso", code: "BFA" },
  { rank: 63, name: "Jordan", code: "JOR" },
  { rank: 64, name: "Bosnia and Herzegovina", code: "BIH" },
  { rank: 65, name: "Honduras", code: "HON" },
  { rank: 66, name: "Albania", code: "ALB" },
  { rank: 67, name: "Cape Verde", code: "CPV" },
  { rank: 68, name: "United Arab Emirates", code: "UAE" },
  { rank: 69, name: "North Macedonia", code: "MKD" },
  { rank: 70, name: "Northern Ireland", code: "NIR" },
  { rank: 71, name: "Georgia", code: "GEO" },
  { rank: 72, name: "Jamaica", code: "JAM" },
  { rank: 73, name: "Ghana", code: "GHA" },
  { rank: 74, name: "Iceland", code: "ISL" },
  { rank: 75, name: "Finland", code: "FIN" },
  { rank: 76, name: "Israel", code: "ISR" },
  { rank: 77, name: "Bolivia", code: "BOL" },
  { rank: 78, name: "Kosovo", code: "KOS" },
  { rank: 79, name: "Oman", code: "OMA" },
  { rank: 80, name: "Montenegro", code: "MNE" },
  { rank: 81, name: "Guinea", code: "GUI" },
  { rank: 82, name: "Curacao", code: "CUW" },
  { rank: 83, name: "Haiti", code: "HAI" },
  { rank: 84, name: "Syria", code: "SYR" },
  { rank: 85, name: "New Zealand", code: "NZL" },
  { rank: 86, name: "Gabon", code: "GAB" },
  { rank: 87, name: "Bulgaria", code: "BUL" },
  { rank: 88, name: "Uganda", code: "UGA" },
  { rank: 89, name: "Angola", code: "ANG" },
  { rank: 90, name: "Zambia", code: "ZAM" },
  { rank: 91, name: "Benin", code: "BEN" },
  { rank: 92, name: "China PR", code: "CHN" },
  { rank: 93, name: "Bahrain", code: "BHR" },
  { rank: 94, name: "Thailand", code: "THA" },
  { rank: 95, name: "Palestine", code: "PLE" },
  { rank: 96, name: "Belarus", code: "BLR" },
  { rank: 97, name: "Guatemala", code: "GUA" },
  { rank: 98, name: "Luxembourg", code: "LUX" },
  { rank: 99, name: "Vietnam", code: "VIE" },
  { rank: 100, name: "El Salvador", code: "SLV" },
];

export function getRank(teamName: string): number | null {
  const entry = FIFA_RANKINGS.find(
    (e) => e.name.toLowerCase() === teamName.toLowerCase()
  );
  return entry ? entry.rank : null;
}

export function canSeeRanking(
  email?: string | null,
  showFifaRanking?: boolean
): boolean {
  if (showFifaRanking === true) return true;
  if (typeof window !== "undefined") {
    return localStorage.getItem("showFifaRanking") === "true";
  }
  return false;
}

export function teamWithRank(
  teamName: string,
  showRank: boolean
): string {
  if (!showRank) return teamName;
  const rank = getRank(teamName);
  return rank !== null ? `${teamName} (${rank})` : teamName;
}
