// app/dashboard/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getRanking, getTournamentSettings, getAllUsers, RankingEntry, UserProfile, getAllPicks, getMatches, Pick, Match } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isDeadlinePassed } from "@/lib/scoring";

const BET_PER_USER = 150000;
function formatCOP(n: number) {
  return "$" + n.toLocaleString("es-CO");
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [maxPointsMap, setMaxPointsMap] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [totalUsers, setTotalUsers] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [r, s, u, allPicks, allMatches, groupPicksSnap, groupStandingsSnap] = await Promise.all([
          getRanking(), getTournamentSettings(), getAllUsers(), getAllPicks(), getMatches(),
          getDocs(collection(db, "groupPicks")),
          getDocs(collection(db, "groupStandings")),
        ]);
        setRanking(r);
        setSettings(s as Record<string, string>);
        setTotalUsers(u.length);
        setUsers(u);

        // ── Compute Max Possible Points per user ──
        const allGroupPicks = groupPicksSnap.docs.map(d => d.data() as any);
        const matchMap: Record<string, Match> = {};
        allMatches.forEach(m => { matchMap[m.id] = m; });

        // Groups that already have an official standing saved (no more pending bonus from them)
        const savedGroups = new Set(groupStandingsSnap.docs.map(d => d.id));
        // Distinct groups across all matches (A, B, …, L)
        const allGroups = Array.from(new Set(
          allMatches.filter(m => m.group).map(m => m.group as string)
        ));
        const unsavedGroupCount = allGroups.filter(g => !savedGroups.has(g)).length;

        const settingsObj = s as Record<string, string>;
        const championDecided = !!settingsObj.champion;
        const topScorerDecided = !!settingsObj.topScorer;

        const maxMap: Record<string, number> = {};
        for (const usr of u) {
          // Points already locked in (can't change)
          const lockedMatchPts = allPicks
            .filter(p => p.userId === usr.uid && p.points !== null && p.points !== undefined)
            .reduce((s, p) => s + (p.points ?? 0), 0);
          const lockedGroupPts = allGroupPicks
            .filter((p: any) => p.userId === usr.uid && p.points !== null && p.points !== undefined)
            .reduce((s: number, p: any) => s + (p.points ?? 0), 0);
          const lockedChampionPts = settingsObj.champion && usr.champion === settingsObj.champion ? 15 : 0;
          const lockedTopScorerPts = settingsObj.topScorer && usr.topScorer === settingsObj.topScorer ? 10 : 0;

          // Potential points from pending (not-yet-finished) matches — max 5 pts each.
          // For knockout rounds, we use the expected total per round since matches may not yet exist
          // in Firestore (e.g. Octavos isn't created until R32 finishes).
          const EXPECTED_KNOCKOUT_COUNTS: Record<string, number> = {
            "Ronda de 32": 16,
            "Octavos de Final": 8,
            "Cuartos de Final": 4,
            "Semifinal": 2,
            "Tercer Puesto": 1,
            "Final": 1,
          };

          // Group stage: based on actual matches in Firestore (72 total expected)
          let groupPending = 0;
          for (const m of allMatches) {
            if (!m.group) continue;
            if (m.status === "finished") continue;
            // If user already has a scored pick, it's in lockedMatchPts → skip
            const pick = allPicks.find(p => p.userId === usr.uid && p.matchId === m.id);
            if (pick && pick.points !== null && pick.points !== undefined) continue;
            groupPending++;
          }

          // Knockout rounds: (expected total) − (already finished) per round
          let knockoutPending = 0;
          for (const round of Object.keys(EXPECTED_KNOCKOUT_COUNTS)) {
            const expected = EXPECTED_KNOCKOUT_COUNTS[round];
            const finishedInRound = allMatches.filter(m => m.round === round && m.status === "finished").length;
            knockoutPending += Math.max(0, expected - finishedInRound);
          }

          const pendingMatchMax = (groupPending + knockoutPending) * 5;

          // Potential group-standing bonus per group: 1° + 2° + 3° qualifying = 3 pts max.
          // A group only contributes pending points if its official standing hasn't been saved yet.
          // (Once admin saves it, the awarded points show up in lockedGroupPts above.)
          const pendingGroupMax = unsavedGroupCount * 3;

          // Champion/top scorer: only countable if not yet officially decided and user made a pick
          const pendingChampionMax = !championDecided && usr.champion ? 15 : 0;
          const pendingTopScorerMax = !topScorerDecided && usr.topScorer ? 10 : 0;

          maxMap[usr.uid] =
            lockedMatchPts + lockedGroupPts + lockedChampionPts + lockedTopScorerPts +
            pendingMatchMax + pendingGroupMax + pendingChampionMax + pendingTopScorerMax;
        }
        setMaxPointsMap(maxMap);
      } catch (err) {
        console.warn("Dashboard load error:", err);
      } finally {
        setFetching(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const myEntry = ranking.find((r) => r.uid === user?.uid);
  const myIndex = ranking.findIndex((r) => r.uid === user?.uid);
  // Use full tie-break key (matches firebase.ts getRanking sort order) to determine real position.
  // Users tied on ALL tie-breakers share the same position.
  const tieKey = (r: RankingEntry) =>
    `${r.totalPoints}-${r.exactCount}-${r.resultCount ?? 0}-${r.partialCount ?? 0}`;
  const myPosition = myEntry
    ? (ranking.findIndex(r => tieKey(r) === tieKey(myEntry)) + 1)
    : 0;

  const totalPot = totalUsers * BET_PER_USER;
  const firstPrize = Math.round(totalPot * 0.70);
  const secondPrize = Math.round(totalPot * 0.20);
  const thirdPrize = Math.round(totalPot * 0.10);

  if (loading || fetching) return <LoadingScreen />;

  return (
    <div className="page animate-fade-up">
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={{ fontSize: 38, color: "var(--text)" }}>
            <span className="gold-text">RANKING</span>
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
            Actualizado cada 30 segundos
          </p>
        </div>
        {myEntry && (
          <div style={s.myBadge}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Tu posición</div>
            <div style={{ fontSize: 32, fontFamily: "'Bebas Neue',sans-serif", color: "var(--gold)", lineHeight: 1 }}>
              #{myPosition}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{myEntry.totalPoints} pts</div>
          </div>
        )}
      </div>

      {/* Premio */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12, marginBottom: 24,
      }}>
        <div style={s.prizeCard}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>🏆 1er Puesto</div>
          <div style={{ fontSize: 26, fontFamily: "'Bebas Neue',sans-serif", color: "var(--gold)", lineHeight: 1 }}>
            {formatCOP(firstPrize)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>70%</div>
        </div>
        <div style={{ ...s.prizeCard, borderColor: "var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>🥈 2do Puesto</div>
          <div style={{ fontSize: 26, fontFamily: "'Bebas Neue',sans-serif", color: "var(--text-dim)", lineHeight: 1 }}>
            {formatCOP(secondPrize)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>20%</div>
        </div>
        <div style={{ ...s.prizeCard, borderColor: "var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>🥉 3er Puesto</div>
          <div style={{ fontSize: 26, fontFamily: "'Bebas Neue',sans-serif", color: "var(--text-dim)", lineHeight: 1 }}>
            {formatCOP(thirdPrize)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>10%</div>
        </div>
        <div style={{ ...s.prizeCard, borderColor: "var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>💰 Pozo total</div>
          <div style={{ fontSize: 26, fontFamily: "'Bebas Neue',sans-serif", color: "var(--text)", lineHeight: 1 }}>
            {formatCOP(totalPot)}
          </div>
        </div>
      </div>

      {/* Tabla de ranking */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 20, color: "var(--text)" }}>Tabla de Posiciones</h2>
        </div>

        {ranking.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            Aún no hay participantes registrados
          </div>
        ) : (
          <RankingTable
            ranking={ranking}
            userId={user?.uid ?? ""}
            prizes={[firstPrize, secondPrize, thirdPrize]}
            maxPointsMap={maxPointsMap}
          />
        )}
      </div>

      {/* Predicciones especiales de todos */}
      {isDeadlinePassed() && users.filter(u => u.champion || u.topScorer).length > 0 && (
        <div className="card" style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: 18, color: "var(--text)" }}>🏆 Predicciones Especiales</h2>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 }}>Participante</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 }}>🥇 Campeón</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600 }}>⚽ Goleador</th>
                </tr>
              </thead>
              <tbody>
                {users
                  .filter(u => !u.isAdmin || u.champion || u.topScorer)
                  .sort((a, b) => a.displayName.localeCompare(b.displayName))
                  .map(u => (
                    <tr key={u.uid} style={{ borderBottom: "1px solid var(--border)", background: u.uid === user?.uid ? "rgba(201,168,76,0.05)" : "transparent" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 600, fontSize: 14 }}>
                        {u.displayName}
                        {u.uid === user?.uid && <span className="badge badge-gold" style={{ fontSize: 10, padding: "1px 6px", marginLeft: 6 }}>Tú</span>}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 13, color: u.champion ? "var(--text)" : "var(--text-muted)" }}>
                        {u.champion || "—"}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 13, color: u.topScorer ? "var(--text)" : "var(--text-muted)" }}>
                        {u.topScorer || "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leyenda de puntos */}
      <div style={s.legend}>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Sistema de puntos:</span>
        {[
          ["⭐", "Marcador exacto", "5 pts"],
          ["✅", "Resultado correcto", "2 pts"],
          ["⚽", "Gol acertado", "1 pt"],
          ["🥇", "1° grupo", "1 pt"],
          ["🥈", "2° grupo", "1 pt"],
          ["🎯", "3° que pasa", "1 pt"],
        ].map(([icon, label, pts]) => (
          <div key={label} style={s.legendItem}>
            <span>{icon} {label}</span>
            <span style={{ color: "var(--gold)", fontWeight: 600 }}>{pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


const PHASE_ORDER = ["Grupos", "R32", "Octavos", "Cuartos", "Semis", "Final", "3er Puesto"];

function tieScore(e: RankingEntry): string {
  return `${e.totalPoints}-${e.exactCount}-${e.resultCount ?? 0}-${e.partialCount ?? 0}`;
}

function buildTieGroups(ranking: RankingEntry[], prizes: number[]): { pos: number; prize: number | null }[] {
  // Group by tie score key
  const keys = ranking.map(e => tieScore(e));
  // For each entry, find how many entries have a strictly better score
  // Since ranking is already sorted, entries with same key form a block
  // We use a stable approach: assign position = index of first occurrence of same key
  const firstIndex: Record<string, number> = {};
  keys.forEach((k, i) => { if (!(k in firstIndex)) firstIndex[k] = i; });

  // Compute group sizes
  const groupSize: Record<string, number> = {};
  keys.forEach(k => { groupSize[k] = (groupSize[k] ?? 0) + 1; });

  // Compute split prize per group
  const groupPrizeTotal: Record<string, number> = {};
  keys.forEach((k, i) => {
    if (i < prizes.length) groupPrizeTotal[k] = (groupPrizeTotal[k] ?? 0) + (prizes[i] ?? 0);
  });

  return ranking.map((_, i) => {
    const k = keys[i];
    const pos = firstIndex[k] + 1;
    const total = groupPrizeTotal[k] ?? 0;
    const size = groupSize[k];
    const prize = total > 0 ? Math.round(total / size) : null;
    return { pos, prize };
  });
}

function RankingTable({ ranking, userId, prizes, maxPointsMap }: {
  ranking: RankingEntry[]; userId: string; prizes: number[]; maxPointsMap: Record<string, number>;
}) {
  const allPaid = ranking.every(e => e.hasPaid);
  const showPaid = !allPaid;
  const activePhases = PHASE_ORDER.filter(phase =>
    ranking.some(e => (e.phasePoints?.[phase] ?? 0) > 0)
  );
  // Bono = group standings (1st/2nd/3rd pass) + champion + topScorer
  // Always shown so admin can see whether bonus points are being awarded
  const showBono = true;
  const tieGroups = buildTieGroups(ranking, prizes);
  // Total points of whoever currently holds 3rd place (used to flag eliminated contestants)
  const thirdPlaceTotalPoints = ranking.length >= 3 ? ranking[2].totalPoints : -Infinity;

  const th: React.CSSProperties = {
    fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase",
    letterSpacing: "0.06em", textAlign: "center" as const, padding: "10px 8px",
    whiteSpace: "nowrap" as const, fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
    borderBottom: "1px solid var(--border)", background: "var(--surface2)",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", paddingLeft: 14, width: 36 }}>#</th>
            <th style={{ ...th, textAlign: "left" }}>Participante</th>
            {activePhases.map(p => <th key={p} style={th}>{p}</th>)}
            {showBono && <th style={{ ...th, color: "var(--gold)" }} title="Clasificación de grupos + Campeón + Goleador">Bono</th>}
            <th style={{ ...th, color: "var(--gold)", fontWeight: 700 }}>Total</th>
            <th style={{ ...th, color: "var(--text-muted)", fontWeight: 500, fontSize: 9 }}>Max Pts</th>
            {showPaid && <th style={{ ...th, color: "var(--green)" }}>💰 Pago</th>}
          </tr>
        </thead>
        <tbody>
          {ranking.map((entry, i) => {
            const { pos, prize } = tieGroups[i];
            const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : null;
            const isMe = entry.uid === userId;
            return (
              <tr key={entry.uid} style={{
                borderBottom: "1px solid var(--border)",
                background: isMe ? "rgba(201,168,76,0.05)" : "transparent",
              }}>
                <td style={{ padding: "10px 8px 10px 14px", fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: pos <= 3 ? "var(--gold)" : "var(--text-muted)", textAlign: "center" }}>
                  {medal || `#${pos}`}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{entry.displayName}</span>
                    {isMe && <span className="badge badge-gold" style={{ fontSize: 10, padding: "1px 6px" }}>Tú</span>}
                    {(maxPointsMap[entry.uid] ?? entry.totalPoints) < thirdPlaceTotalPoints && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                        background: "rgba(231,76,60,0.15)", color: "var(--red)",
                        border: "1px solid rgba(231,76,60,0.4)",
                      }}>ELIMINADO</span>
                    )}
                    {prize !== null && prize > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
                        background: pos === 1 ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)",
                        color: pos === 1 ? "var(--gold)" : "var(--text-dim)",
                        border: `1px solid ${pos === 1 ? "var(--border-gold)" : "var(--border)"}`,
                      }}>{formatCOP(prize)}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={tieStyle("#C9A84C")}>⭐ {entry.exactCount}</span>
                    <span style={tieStyle("#9B8FD0")}>✅ {entry.resultCount ?? 0}</span>
                    <span style={tieStyle("#6ABCB0")}>⚽ {entry.partialCount ?? 0}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{entry.picksCount} apuestas</span>
                  </div>
                </td>
                {activePhases.map(phase => (
                  <td key={phase} style={{ padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: (entry.phasePoints?.[phase] ?? 0) > 0 ? "var(--text)" : "var(--text-muted)" }}>
                      {entry.phasePoints?.[phase] ?? 0}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>pts</div>
                  </td>
                ))}
                {showBono && (
                  <td style={{ padding: "10px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: (entry.groupPoints + entry.championPoints + entry.topScorerPoints) > 0 ? "var(--gold)" : "var(--text-muted)" }}>
                      {(entry.groupPoints + entry.championPoints + entry.topScorerPoints) > 0 ? "+" : ""}{entry.groupPoints + entry.championPoints + entry.topScorerPoints}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>pts</div>
                  </td>
                )}
                <td style={{ padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontFamily: "'Bebas Neue',sans-serif", color: isMe ? "var(--gold)" : "var(--text)" }}>{entry.totalPoints}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginTop: -2 }}>pts</div>
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "var(--green)" }}>{maxPointsMap[entry.uid] ?? entry.totalPoints}</div>
                </td>
                {showPaid && (
                  <td style={{ padding: "10px 8px", textAlign: "center", fontSize: 18 }}>
                    {entry.hasPaid ? "✅" : "❌"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RankRow({ entry, position, isMe, prize }: {
  entry: RankingEntry; position: number; isMe: boolean; prize: number | null;
}) {
  const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : null;
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "10px 14px", borderBottom: "1px solid var(--border)",
      background: isMe ? "rgba(201,168,76,0.05)" : "transparent",
      transition: "background 0.15s", gap: 10, flexWrap: "wrap",
    }}>
      <div style={{ width: 32, textAlign: "center", fontFamily: "'Bebas Neue',sans-serif", fontSize: 18,
        color: position <= 3 ? "var(--gold)" : "var(--text-muted)", flexShrink: 0 }}>
        {medal || `#${position}`}
      </div>

      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {entry.displayName}
          {isMe && <span className="badge badge-gold" style={{ fontSize: 10, padding: "2px 7px" }}>Tú</span>}
          {prize !== null && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
              background: position === 1 ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.06)",
              color: position === 1 ? "var(--gold)" : "var(--text-dim)",
              border: `1px solid ${position === 1 ? "var(--border-gold)" : "var(--border)"}`,
            }}>
              {formatCOP(prize)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", rowGap: 4 }}>
          <span style={tieStyle("#C9A84C")} title="Marcador exacto (5 pts)">⭐ {entry.exactCount}</span>
          <span style={tieStyle("#9B8FD0")} title="Resultado correcto (2 pts)">✅ {entry.resultCount ?? 0}</span>
          <span style={tieStyle("#6ABCB0")} title="Goles acertados (1 pt)">⚽ {entry.partialCount ?? 0}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{entry.picksCount} apuestas</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
        {entry.matchPoints > 0 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)" }}>{entry.matchPoints}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>partidos</div>
          </div>
        )}
        {(entry.championPoints + entry.topScorerPoints) > 0 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gold)" }}>{entry.championPoints + entry.topScorerPoints}</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>especial</div>
          </div>
        )}
        <div style={{ textAlign: "right", marginLeft: 4 }}>
          <div style={{ fontSize: 24, fontFamily: "'Bebas Neue',sans-serif", color: isMe ? "var(--gold)" : "var(--text)" }}>
            {entry.totalPoints}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", marginTop: -4 }}>pts</div>
        </div>
      </div>
    </div>
  );
}

function tieStyle(color: string): React.CSSProperties {
  return {
    fontSize: 11, color, fontWeight: 600,
    background: "var(--surface2)", borderRadius: 4,
    padding: "2px 6px", border: "1px solid var(--border)",
    display: "inline-flex", alignItems: "center", gap: 3,
  };
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 36, fontFamily: "'Bebas Neue',sans-serif", color: "var(--gold)" }}>Cargando...</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  myBadge: {
    background: "rgba(201,168,76,0.08)", border: "1px solid var(--border-gold)",
    borderRadius: "var(--radius)", padding: "12px 20px", textAlign: "center",
  },
  prizeCard: {
    background: "var(--surface)", border: "1px solid var(--border-gold)",
    borderRadius: "var(--radius)", padding: "16px 20px",
  },
  legend: {
    marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "14px 0",
  },
  legendItem: {
    background: "var(--surface2)", borderRadius: 6, padding: "5px 10px",
    fontSize: 12, display: "flex", gap: 6, alignItems: "center", border: "1px solid var(--border)",
  },
};
