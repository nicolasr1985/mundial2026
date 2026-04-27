// lib/scoring.ts
// Sistema de puntos:
// 5 pts  → marcador exacto (máximo, no se acumula con otros)
// 2 pts  → resultado correcto (ganador/empate), solo si no fue exacto
// 1 pt   → gol de un equipo acertado, solo si no fue exacto
//          (ej: COL 4-1 POR real, pick 3-1 → 2pts resultado + 1pt POR = 3pts)
//
// Predicciones especiales:
// 15 pts → campeón
// 10 pts → goleador
// Fecha límite: pitazo inicial 11 junio 2026

export const POINTS = {
  EXACT_SCORE: 5,
  CORRECT_RESULT: 2,
  CORRECT_GOAL: 1,
  GROUP_FIRST: 1,
  GROUP_SECOND: 1,
  GROUP_THIRD: 1,
  CHAMPION: 15,
  TOP_SCORER: 10,
  DEADLINE: new Date("2026-06-11T15:00:00-05:00"),
} as const;

export function calculateMatchPoints(
  predHome: number,
  predAway: number,
  realHome: number,
  realAway: number
): number {
  // Exact score — 5 pts, nothing added on top
  if (predHome === realHome && predAway === realAway) {
    return POINTS.EXACT_SCORE;
  }

  let pts = 0;

  // Correct result (win/draw/loss)
  const predWinner = Math.sign(predHome - predAway);
  const realWinner = Math.sign(realHome - realAway);
  if (predWinner === realWinner) pts += POINTS.CORRECT_RESULT;

  // Correct goals per team (only if not exact)
  if (predHome === realHome) pts += POINTS.CORRECT_GOAL;
  if (predAway === realAway) pts += POINTS.CORRECT_GOAL;

  return pts;
}

export function getPointsBreakdown(
  predHome: number,
  predAway: number,
  realHome: number,
  realAway: number
): { total: number; reasons: string[] } {
  if (predHome === realHome && predAway === realAway) {
    return { total: POINTS.EXACT_SCORE, reasons: ["⭐ Marcador exacto (+5)"] };
  }

  let total = 0;
  const reasons: string[] = [];
  const predWinner = Math.sign(predHome - predAway);
  const realWinner = Math.sign(realHome - realAway);

  if (predWinner === realWinner) {
    total += POINTS.CORRECT_RESULT;
    reasons.push("✅ Resultado correcto (+2)");
  }
  if (predHome === realHome) {
    total += POINTS.CORRECT_GOAL;
    reasons.push("⚽ Goles local acertado (+1)");
  }
  if (predAway === realAway) {
    total += POINTS.CORRECT_GOAL;
    reasons.push("⚽ Goles visitante acertado (+1)");
  }
  if (total === 0) reasons.push("❌ Sin puntos");

  return { total, reasons };
}

export function isDeadlinePassed(): boolean {
  return new Date() > POINTS.DEADLINE;
}

export function formatDeadline(): string {
  return POINTS.DEADLINE.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
