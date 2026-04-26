// lib/scoring.ts
// Sistema de puntos:
// 5 pts  → marcador exacto
// 3 pts  → resultado correcto (ganador/empate)
// 1 pt   → gol local acertado (independiente)
// 1 pt   → gol visitante acertado (independiente)
// Nota: el exacto ya incluye todo, máximo por partido sin exacto = 4 pts
//
// Fase de grupos:
// 1 pt   → 1er lugar de grupo
// 1 pt   → 2do lugar de grupo
// 1 pt   → 3er lugar que pasa
//
// Predicciones especiales:
// 15 pts → campeón
// 10 pts → goleador
// Fecha límite: 9 de junio de 2026

export const POINTS = {
  EXACT_SCORE: 5,
  CORRECT_RESULT: 3,
  CORRECT_GOAL: 1,       // por cada marcador de equipo acertado
  GROUP_FIRST: 1,
  GROUP_SECOND: 1,
  GROUP_THIRD: 1,
  CHAMPION: 15,
  TOP_SCORER: 10,
  DEADLINE: new Date("2026-06-11T15:00:00-05:00"), // Pitazo inicial — June 11, 2026 3pm Bogotá
} as const;

export function calculateMatchPoints(
  predHome: number,
  predAway: number,
  realHome: number,
  realAway: number
): number {
  // Marcador exacto
  if (predHome === realHome && predAway === realAway) {
    return POINTS.EXACT_SCORE;
  }

  let pts = 0;

  // Resultado correcto
  const predWinner = Math.sign(predHome - predAway); // 1 local, 0 empate, -1 visitante
  const realWinner = Math.sign(realHome - realAway);
  if (predWinner === realWinner) pts += POINTS.CORRECT_RESULT;

  // Goles individuales acertados
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
  const reasons: string[] = [];

  if (predHome === realHome && predAway === realAway) {
    return { total: POINTS.EXACT_SCORE, reasons: ["⭐ Marcador exacto"] };
  }

  let total = 0;
  const predWinner = Math.sign(predHome - predAway);
  const realWinner = Math.sign(realHome - realAway);

  if (predWinner === realWinner) {
    total += POINTS.CORRECT_RESULT;
    reasons.push("✅ Resultado correcto (+3)");
  }
  if (predHome === realHome) {
    total += POINTS.CORRECT_GOAL;
    reasons.push(`⚽ Goles local acertado (+1)`);
  }
  if (predAway === realAway) {
    total += POINTS.CORRECT_GOAL;
    reasons.push(`⚽ Goles visitante acertado (+1)`);
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
