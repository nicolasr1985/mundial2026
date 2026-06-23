// app/api/cron/sync-scores/route.ts
import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, Timestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

// Recalculate pick points for a match (mirrors logic in lib/firebase.ts)
function calculateMatchPoints(predHome: number, predAway: number, realHome: number, realAway: number): number {
  if (predHome === realHome && predAway === realAway) return 5;
  let pts = 0;
  if (Math.sign(predHome - predAway) === Math.sign(realHome - realAway)) pts += 2;
  if (predHome === realHome) pts += 1;
  if (predAway === realAway) pts += 1;
  return pts;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryrun") === "1";
  const cleanup = searchParams.get("cleanup") === "1";

  // Dry-run and cleanup are safe to allow without auth (cleanup only nulls out fake scores on upcoming matches)
  if (!dryRun && !cleanup) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getDb();
  const results: any[] = [];

  if (cleanup) {
    // Find all matches currently "upcoming" (these should have no picks with points set)
    const upcomingSnap = await getDocs(query(collection(db, "matches"), where("status", "==", "upcoming")));
    const upcomingIds = upcomingSnap.docs.map(d => d.id);
    const upcomingNames: Record<string, string> = {};
    upcomingSnap.docs.forEach(d => {
      const data = d.data();
      upcomingNames[d.id] = `${data.homeTeam} vs ${data.awayTeam}`;
    });

    // Also clear any leftover fake scores on matches still marked upcoming
    const cleanedMatches: string[] = [];
    for (const m of upcomingSnap.docs) {
      const data = m.data();
      if (data.homeScore !== null || data.awayScore !== null) {
        await updateDoc(doc(db, "matches", m.id), {
          homeScore: null, awayScore: null,
          homeYellow: 0, awayYellow: 0, homeRed: 0, awayRed: 0, homeYellowRed: 0, awayYellowRed: 0,
        });
        cleanedMatches.push(upcomingNames[m.id]);
      }
    }

    // Find picks tied to upcoming matches that still have points set (orphaned from the fake-score incident)
    const affectedByMatch: Record<string, number> = {};
    let picksReset = 0;
    const allPicksSnap = await getDocs(collection(db, "picks"));
    for (const p of allPicksSnap.docs) {
      const pick = p.data();
      if (upcomingIds.includes(pick.matchId) && pick.points !== null && pick.points !== undefined) {
        await updateDoc(doc(db, "picks", p.id), { points: null });
        picksReset++;
        const name = upcomingNames[pick.matchId] ?? pick.matchId;
        affectedByMatch[name] = (affectedByMatch[name] ?? 0) + 1;
      }
    }

    return NextResponse.json({ cleanedMatchesCount: cleanedMatches.length, cleanedMatches, picksReset, affectedByMatch });
  }

  try {
    // Fetch games from worldcup26.ir (no auth needed per their docs for this endpoint)
    const wcRes = await fetch("https://worldcup26.ir/get/games", { cache: "no-store" });
    if (!wcRes.ok) {
      return NextResponse.json({ error: `worldcup26.ir error: ${wcRes.status}` }, { status: 502 });
    }
    const wcData = await wcRes.json();
    const games = Array.isArray(wcData) ? wcData : (wcData.data ?? wcData.games ?? []);

    if (!games.length) {
      return NextResponse.json({ message: "No games returned from source", raw: wcData });
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        totalGames: games.length,
        sample: games.slice(0, 3),
      });
    }

    // Get all matches from Firestore that are not yet finished
    const matchesSnap = await getDocs(
      query(collection(db, "matches"), where("status", "in", ["upcoming", "live"]))
    );

    for (const matchDoc of matchesSnap.docs) {
      const match = matchDoc.data();
      const wantHome = normalize(match.homeTeam);
      const wantAway = normalize(match.awayTeam);

      const game = games.find((g: any) => {
        const gHome = normalize(g.home_team_name ?? g.homeTeam?.name ?? g.home?.name ?? "");
        const gAway = normalize(g.away_team_name ?? g.awayTeam?.name ?? g.away?.name ?? "");
        return (gHome.includes(wantHome) || wantHome.includes(gHome)) &&
               (gAway.includes(wantAway) || wantAway.includes(gAway));
      });

      if (!game) continue;

      const homeScore = game.home_score ?? game.homeScore ?? game.score?.home ?? null;
      const awayScore = game.away_score ?? game.awayScore ?? game.score?.away ?? null;
      const rawStatus = (game.status ?? "").toString().toLowerCase();

      if (homeScore === null || awayScore === null) continue;

      const isFinished = rawStatus.includes("finish") || rawStatus.includes("complet") || rawStatus === "ft";
      const isLive = rawStatus.includes("live") || rawStatus.includes("progress") || rawStatus.includes("1h") || rawStatus.includes("2h");

      const newStatus = isFinished ? "finished" : isLive ? "live" : match.status;
      const scoreChanged = match.homeScore !== homeScore || match.awayScore !== awayScore;
      const statusChanged = match.status !== newStatus;

      if (!scoreChanged && !statusChanged) continue;

      // Update the match document
      await updateDoc(doc(db, "matches", matchDoc.id), {
        homeScore,
        awayScore,
        status: newStatus,
        locked: newStatus !== "upcoming",
      });

      // Recalculate picks for this match if score changed
      if (scoreChanged) {
        const picksSnap = await getDocs(
          query(collection(db, "picks"), where("matchId", "==", matchDoc.id))
        );
        for (const pickDoc of picksSnap.docs) {
          const pick = pickDoc.data();
          const points = calculateMatchPoints(pick.homeScore, pick.awayScore, homeScore, awayScore);
          await updateDoc(doc(db, "picks", pickDoc.id), { points });
        }
      }

      results.push({
        matchId: matchDoc.id,
        teams: `${match.homeTeam} vs ${match.awayTeam}`,
        homeScore,
        awayScore,
        newStatus,
      });
    }

    return NextResponse.json({
      success: true,
      updated: results.length,
      details: results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Error desconocido" }, { status: 500 });
  }
}
