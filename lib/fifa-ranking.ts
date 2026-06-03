// lib/fifa-ranking.ts
// FIFA Rankings — updated from official FIFA ranking page (images provided)

export const FIFA_RANK: Record<string, number> = {
  // Top 19 (image 1)
  "France": 1,
  "Spain": 2,
  "Argentina": 3,
  "England": 4,
  "Portugal": 5,
  "Brazil": 6,
  "Netherlands": 7,
  "Morocco": 8,
  "Belgium": 9,
  "Germany": 10,
  "Croatia": 11,
  "Italy": 12,
  "Colombia": 13,
  "Senegal": 14,
  "Mexico": 15,
  "United States": 16,
  "Uruguay": 17,
  "Japan": 18,
  "Switzerland": 19,
  // 20-39 (image 2)
  "Denmark": 20,
  "Iran": 21,
  "Turkey": 22,
  "Austria": 23,
  "Ecuador": 24,
  "South Korea": 25,
  "Nigeria": 26,
  "Australia": 27,
  "Egypt": 28,
  "Algeria": 29,
  "Canada": 30,
  "Norway": 31,
  "Ukraine": 32,
  "Panama": 33,
  "Ivory Coast": 34,
  "Poland": 35,
  "Russia": 36,
  "Wales": 37,
  "Sweden": 38,
  "Serbia": 39,
  // 40-50 (image 3)
  "Paraguay": 40,
  "Czechia": 41,
  "Hungary": 42,
  "Scotland": 43,
  "Cameroon": 44,
  "Tunisia": 45,
  "Congo DR": 46,
  "Greece": 47,
  "Slovakia": 48,
  "Venezuela": 49,
  "Uzbekistan": 50,
  // 51-69 (image 4)
  "Mali": 51,
  "Costa Rica": 52,
  "Peru": 53,
  "Chile": 54,
  "Qatar": 55,
  "Romania": 56,
  "Iraq": 57,
  "Slovenia": 58,
  "Ireland": 59,
  "South Africa": 60,
  "Saudi Arabia": 61,
  "Burkina Faso": 62,
  "Jordan": 63,
  "Albania": 64,
  "Bosnia and Herzegovina": 65,
  "Honduras": 66,
  "United Arab Emirates": 67,
  "Cape Verde": 68,
  "North Macedonia": 69,
  // 70-89 (image 5)
  "Northern Ireland": 70,
  "Jamaica": 71,
  "Georgia": 72,
  "Ghana": 73,
  "Finland": 74,
  "Iceland": 75,
  "Bolivia": 76,
  "Israel": 77,
  "Kosovo": 78,
  "Oman": 79,
  "Montenegro": 80,
  "Guinea": 81,
  "Haiti": 82,
  "Curacao": 83,
  "Syria": 84,
  "New Zealand": 85,
  "Bulgaria": 86,
  "Gabon": 87,
  "Uganda": 88,
  "Angola": 89,
};

const RANKING_ALLOWED_EMAILS = ["nicolasr9@gmail.com"];

export function canSeeRanking(email: string | null | undefined): boolean {
  return RANKING_ALLOWED_EMAILS.includes(email ?? "");
}

export function teamWithRank(name: string, showRank: boolean): string {
  if (!showRank) return name;
  const rank = FIFA_RANK[name];
  return rank ? `${name} (${rank})` : name;
}
