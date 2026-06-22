// app/api/livescore/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://api.balldontlie.io/fifa/worldcup/v1";

export async function GET(req: NextRequest) {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "BALLDONTLIE_API_KEY no configurada" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const homeTeam = searchParams.get("home");
  const awayTeam = searchParams.get("away");
  const date = searchParams.get("date"); // YYYY-MM-DD (informational only)

  if (!homeTeam || !awayTeam) {
    return NextResponse.json({ error: "Faltan parámetros home/away" }, { status: 400 });
  }

  try {
    const url = `${API_BASE}/matches?seasons[]=2026&per_page=100`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `BALLDONTLIE error: ${res.status}`, detail: errText }, { status: 502 });
    }

    const data = await res.json();
    const matches = data.data ?? [];

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    const wantHome = normalize(homeTeam);
    const wantAway = normalize(awayTeam);

    const match = matches.find((m: any) => {
      const mHome = normalize(m.home_team?.name ?? "");
      const mAway = normalize(m.away_team?.name ?? "");
      return (mHome.includes(wantHome) || wantHome.includes(mHome)) &&
             (mAway.includes(wantAway) || wantAway.includes(mAway));
    });

    if (!match) {
      return NextResponse.json({ found: false, message: "Partido no encontrado en BALLDONTLIE" });
    }

    // Fetch events (cards) for this match if available
    let homeYellow = 0, awayYellow = 0, homeRed = 0, awayRed = 0, homeYellowRed = 0, awayYellowRed = 0;
    try {
      const evRes = await fetch(`${API_BASE}/match_events?match_id=${match.id}`, {
        headers: { Authorization: apiKey },
        cache: "no-store",
      });
      if (evRes.ok) {
        const evData = await evRes.json();
        const events = evData.data ?? [];
        for (const ev of events) {
          const type = (ev.event_type ?? ev.type ?? "").toLowerCase();
          if (!type.includes("card")) continue;
          const isHome = ev.team?.id === match.home_team?.id;
          if (type.includes("yellow") && type.includes("second")) {
            if (isHome) homeYellowRed++; else awayYellowRed++;
          } else if (type.includes("yellow")) {
            if (isHome) homeYellow++; else awayYellow++;
          } else if (type.includes("red")) {
            if (isHome) homeRed++; else awayRed++;
          }
        }
      }
    } catch {
      // events not available, ignore
    }

    return NextResponse.json({
      found: true,
      homeScore: match.home_score ?? null,
      awayScore: match.away_score ?? null,
      status: match.status,
      homeYellow,
      awayYellow,
      homeRed,
      awayRed,
      homeYellowRed,
      awayYellowRed,
      matchId: match.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Error desconocido" }, { status: 500 });
  }
}
