// lib/fifa-ranking.ts
// FIFA Rankings — April 2026 (football-ranking.com)

export const FIFA_RANK: Record<string, number> = {
  "France": 1, "Spain": 2, "Argentina": 3, "England": 4,
  "Portugal": 5, "Brazil": 6, "Netherlands": 7, "Morocco": 8,
  "Belgium": 9, "Germany": 10, "Croatia": 11, "Colombia": 12,
  "Senegal": 13, "Italy": 14, "Mexico": 15, "United States": 16,
  "Uruguay": 17, "Japan": 18, "Switzerland": 19, "Iran": 20, "Turkey": 22,
  "Ecuador": 23, "Austria": 24, "South Korea": 25, "Australia": 27,
  "Algeria": 28, "Egypt": 29, "Canada": 30, "Norway": 31,
  "Panama": 33, "Ivory Coast": 34, "Sweden": 37, "Czechia": 38,
  "Paraguay": 41, "Scotland": 43, "Tunisia": 44, "Congo DR": 46,
  "Uzbekistan": 49, "Qatar": 55, "Iraq": 57, "South Africa": 59,
  "Saudi Arabia": 61, "Bosnia and Herzegovina": 63, "Jordan": 64,
  "Cape Verde": 68, "Ghana": 73, "Curacao": 82, "Haiti": 83,
  "New Zealand": 85,
};

export function teamWithRank(name: string): string {
  const rank = FIFA_RANK[name];
  return rank ? `${name} (${rank})` : name;
}
