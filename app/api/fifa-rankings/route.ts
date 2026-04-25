// app/api/fifa-rankings/route.ts
// Server-side scraper for FIFA rankings from football-ranking.com
// Runs on Vercel — no CORS issues, results cached for 24h

import { NextResponse } from "next/server";

interface FifaEntry {
  rank: number;
  name: string;
  code: string;
  points: number;
}

// Parse one HTML page from football-ranking.com and return ranking rows
function parseRankingPage(html: string): FifaEntry[] {
  const results: FifaEntry[] = [];
  // Match table rows: <tr>...<td>RANK</td>...<td>Name (CODE)</td>...<td>Points</td>...
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const tagRe = /<[^>]+>/g;

  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells: string[] = [];
    let tdMatch;
    const tdReCopy = new RegExp(tdRe.source, tdRe.flags);
    while ((tdMatch = tdReCopy.exec(row)) !== null) {
      cells.push(tdMatch[1].replace(tagRe, "").trim());
    }
    if (cells.length < 3) continue;

    // cells[0] = rank (may have arrows/extra text), cells[1] = team name (CODE), cells[2] = points
    const rankStr = cells[0].replace(/[^\d]/g, "").trim();
    const rank = parseInt(rankStr);
    if (isNaN(rank) || rank < 1) continue;

    // Extract name and code from "France (FRA)" or just "France"
    const nameCell = cells[1].replace(/[↑↓]/g, "").trim();
    const nameMatch = nameCell.match(/^([^(]+?)\s*(?:\(([A-Z]{2,3})\))?$/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const code = nameMatch[2] || "";

    // Points: "1,877.32" or "1877"
    const ptsStr = cells[2].replace(/[^\d.]/g, "");
    const points = Math.round(parseFloat(ptsStr) || 0);

    if (name && rank && points) {
      results.push({ rank, name, code, points });
    }
  }
  return results;
}

export async function GET() {
  try {
    const allRankings: FifaEntry[] = [];
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://football-ranking.com/",
    };

    // Fetch all 5 pages in parallel
    const pages = await Promise.all(
      [1, 2, 3, 4, 5].map((p) =>
        fetch(`https://football-ranking.com/fifa-rankings${p > 1 ? `?page=${p}` : ""}`, {
          headers,
          next: { revalidate: 86400 }, // cache 24h
        }).then((r) => r.text())
      )
    );

    for (const html of pages) {
      const entries = parseRankingPage(html);
      allRankings.push(...entries);
    }

    if (allRankings.length === 0) {
      return NextResponse.json(
        { error: "No rankings parsed", rankings: [] },
        { status: 502 }
      );
    }

    // Deduplicate and sort
    const seen = new Set<number>();
    const unique = allRankings.filter((r) => {
      if (seen.has(r.rank)) return false;
      seen.add(r.rank);
      return true;
    }).sort((a, b) => a.rank - b.rank);

    return NextResponse.json({
      source: "football-ranking.com",
      updated: new Date().toISOString().split("T")[0],
      total: unique.length,
      rankings: unique,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), rankings: [] }, { status: 500 });
  }
}
