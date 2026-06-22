// app/api/diagnose/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "BALLDONTLIE_API_KEY no configurada" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.balldontlie.io/fifa/worldcup/v1/teams", {
      headers: { Authorization: apiKey },
      cache: "no-store",
    });
    const text = await res.text();
    return NextResponse.json({
      httpStatus: res.status,
      rawResponse: text,
      keyUsedLength: apiKey.length,
      keyPreview: apiKey.slice(0, 8) + "...",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Error desconocido" }, { status: 500 });
  }
}
