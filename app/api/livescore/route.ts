// app/api/livescore/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://v3.football.api-sports.io";

// World Cup 2026: league=1, season=2026
const LEAGUE_ID = 1;
const SEASON = 2026;

export async function GET(req: NextRequest) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY no configurada" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const homeTeam = searchParams.get("home");
  const awayTeam = searchParams.get("away");
  const date = searchParams.get("date"); // YYYY-MM-DD

  if (!homeTeam || !awayTeam) {
    return NextResponse.json({ error: "Faltan parámetros home/away" }, { status: 400 });
  }

  try {
    // Fetch fixtures for that date in the World Cup league (Bogota timezone to match app's date logic)
    const url = `${API_BASE}/fixtures?league=${LEAGUE_ID}&season=${SEASON}&timezone=America/Bogota${date ? `&date=${date}` : ""}`;
    const res = await fetch(url, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `API-Football error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    let fixtures = data.response ?? [];

    // Find the fixture matching home/away team names (fuzzy match)
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const findMatch = (list: any[]) => list.find((f: any) => {
      const fHome = normalize(f.teams?.home?.name ?? "");
      const fAway = normalize(f.teams?.away?.name ?? "");
      const wantHome = normalize(homeTeam);
      const wantAway = normalize(awayTeam);
      return (fHome.includes(wantHome) || wantHome.includes(fHome)) &&
             (fAway.includes(wantAway) || wantAway.includes(fAway));
    });

    let fixture = findMatch(fixtures);

    // Fallback: if not found with date filter, search the whole tournament (no date)
    if (!fixture && date) {
      const fallbackUrl = `${API_BASE}/fixtures?league=${LEAGUE_ID}&season=${SEASON}&timezone=America/Bogota`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: { "x-apisports-key": apiKey },
        cache: "no-store",
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        fixtures = fallbackData.response ?? [];
        fixture = findMatch(fixtures);
      }
    }

    if (!fixture) {
      return NextResponse.json({ found: false, message: "Partido no encontrado en API-Football" });
    }

    // Extract score
    const homeScore = fixture.goals?.home ?? null;
    const awayScore = fixture.goals?.away ?? null;
    const status = fixture.fixture?.status?.short; // e.g. "LIVE", "FT", "NS"

    // Extract cards from events
    const events = fixture.events ?? [];
    let homeYellow = 0, awayYellow = 0, homeRed = 0, awayRed = 0, homeYellowRed = 0, awayYellowRed = 0;

    for (const ev of events) {
      if (ev.type !== "Card") continue;
      const isHome = normalize(ev.team?.name ?? "") === normalize(fixture.teams?.home?.name ?? "");
      if (ev.detail === "Yellow Card") {
        if (isHome) homeYellow++; else awayYellow++;
      } else if (ev.detail === "Red Card") {
        if (isHome) homeRed++; else awayRed++;
      } else if (ev.detail === "Second Yellow card") {
        if (isHome) homeYellowRed++; else awayYellowRed++;
      }
    }

    return NextResponse.json({
      found: true,
      homeScore,
      awayScore,
      status,
      homeYellow,
      awayYellow,
      homeRed,
      awayRed,
      homeYellowRed,
      awayYellowRed,
      fixtureId: fixture.fixture?.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Error desconocido" }, { status: 500 });
  }
}
