import { NextRequest, NextResponse } from "next/server";

const API_BASE = "https://v3.football.api-sports.io";

export async function GET(req: NextRequest) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY no configurada" }, { status: 500 });
  }

  try {
    const res = await fetch(`${API_BASE}/leagues?id=1&season=2026`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json({
      httpStatus: res.status,
      apiResponse: data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Error desconocido" }, { status: 500 });
  }
}
