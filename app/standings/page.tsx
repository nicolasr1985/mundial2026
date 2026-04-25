// app/standings/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getMatches, getUserPicks, Match } from "@/lib/firebase";

interface TeamStat {
  team: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

// ─── CORE STANDINGS CALCULATOR ────────────────────────────────────────────────
function computeGroupStandings(
  matches: Match[],
  allMatches: Match[] // used to seed all teams even with no results yet
): Record<string, TeamStat[]> {
  const standings: Record<string, Record<string, TeamStat>> = {};

  // Seed all teams with 0 stats
  for (const m of allMatches) {
    if (!m.group) continue;
    const g = m.group;
    if (!standings[g]) standings[g] = {};
    if (!standings[g][m.homeTeam])
      standings[g][m.homeTeam] = { team: m.homeTeam, group: g, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
    if (!standings[g][m.awayTeam])
      standings[g][m.awayTeam] = { team: m.awayTeam, group: g, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
  }

  // Add results
  for (const m of matches) {
    if (!m.group || m.homeScore === null || m.awayScore === null) continue;
    const g = m.group;
    if (!standings[g]) continue;
    const home = standings[g][m.homeTeam];
    const away = standings[g][m.awayTeam];
    if (!home || !away) continue;
    const hs = Number(m.homeScore), as_ = Number(m.awayScore);
    if (isNaN(hs) || isNaN(as_)) continue;
    home.played++; away.played++;
    home.gf += hs; home.ga += as_; home.gd = home.gf - home.ga;
    away.gf += as_; away.ga += hs; away.gd = away.gf - away.ga;
    if (hs > as_)      { home.won++; home.points += 3; away.lost++; }
    else if (hs < as_) { away.won++; away.points += 3; home.lost++; }
    else               { home.drawn++; away.drawn++; home.points++; away.points++; }
  }

  const result: Record<string, TeamStat[]> = {};
  for (const g in standings) {
    result[g] = Object.values(standings[g])
      .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  }
  return result;
}

// Get the 3rd-place teams from all groups, sort them, best 8 qualify
function getThirdPlaceTable(standings: Record<string, TeamStat[]>): (TeamStat & { qualifies: boolean })[] {
  const thirds: TeamStat[] = [];
  for (const g in standings) {
    if (standings[g].length >= 3) thirds.push(standings[g][2]);
  }
  const sorted = thirds.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  return sorted.map((t, i) => ({ ...t, qualifies: i < 8 }));
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function StandingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [userPickMap, setUserPickMap] = useState<Record<string, { homeScore: number; awayScore: number }>>({});
  const [activeGroup, setActiveGroup] = useState("A");
  const [viewMode, setViewMode] = useState<"real" | "predicted">("real");
  const [activeTab, setActiveTab] = useState<"groups" | "thirds">("groups");
  const [fetching, setFetching] = useState(true);

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [m, up] = await Promise.all([getMatches(), getUserPicks(user.uid)]);
      setMatches(m);
      const pickMap: Record<string, { homeScore: number; awayScore: number }> = {};
      up.forEach((p) => { pickMap[p.matchId] = { homeScore: p.homeScore, awayScore: p.awayScore }; });
      setUserPickMap(pickMap);
    } catch (e) { console.warn(e); }
    finally { setFetching(false); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const groupMatches = matches.filter((m) => m.round?.startsWith("Fase de Grupos"));
  const availableGroups = Array.from(new Set(groupMatches.map((m) => m.group).filter(Boolean) as string[])).sort();

  // Real standings: only finished matches
  const realFinished = groupMatches.filter((m) => m.status === "finished" && m.homeScore !== null);
  const realStandings = computeGroupStandings(realFinished, groupMatches);
  const realThirds = getThirdPlaceTable(realStandings);

  // Predicted standings: replace real scores with user picks
  const predictedMatches = groupMatches
    .map((m) => {
      const p = userPickMap[m.id];
      if (!p) return null;
      const hs = Number(p.homeScore), as_ = Number(p.awayScore);
      if (isNaN(hs) || isNaN(as_)) return null;
      return { ...m, homeScore: hs, awayScore: as_, status: "finished" as const };
    })
    .filter(Boolean) as Match[];
  const predictedStandings = computeGroupStandings(predictedMatches, groupMatches);
  const predictedThirds = getThirdPlaceTable(predictedStandings);

  const displayStandings = viewMode === "real" ? realStandings : predictedStandings;
  const displayThirds = viewMode === "real" ? realThirds : predictedThirds;
  const groupTable = displayStandings[activeGroup] || [];

  if (loading || fetching) return <Loading />;

  return (
    <div className="page animate-fade-up">
      <h1 style={{ fontSize: 36, marginBottom: 4 }}><span className="gold-text">TABLA</span></h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        Posiciones reales vs tus predicciones
      </p>

      {/* View mode toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["real", "predicted"] as const).map((mode) => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding: "8px 18px", borderRadius: "var(--radius-sm)", cursor: "pointer",
            border: `1px solid ${viewMode === mode ? "var(--border-gold)" : "var(--border)"}`,
            background: viewMode === mode ? "rgba(201,168,76,0.12)" : "var(--surface2)",
            color: viewMode === mode ? "var(--gold)" : "var(--text-muted)",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 14, transition: "all 0.15s",
          }}>
            {mode === "real" ? "📊 Tabla Real" : "🔮 Según Mis Picks"}
          </button>
        ))}
      </div>

      {/* Tab: Groups / 3rd Place */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        {([
          { id: "groups", label: "Grupos" },
          { id: "thirds", label: "🏅 Tabla de Terceros" },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "10px 18px", fontSize: 13, cursor: "pointer", border: "none",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, letterSpacing: "0.04em",
            background: "transparent", transition: "all 0.15s",
            color: activeTab === t.id ? "var(--gold)" : "var(--text-muted)",
            borderBottom: `2px solid ${activeTab === t.id ? "var(--gold)" : "transparent"}`,
          }}>{t.label}</button>
        ))}
      </div>

      {availableGroups.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <p>No hay partidos de grupos aún.</p>
        </div>
      ) : activeTab === "groups" ? (
        <>
          {/* Group selector */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {availableGroups.map((g) => (
              <button key={g} onClick={() => setActiveGroup(g)} style={{
                width: 36, height: 36, borderRadius: 6, fontFamily: "'Bebas Neue',sans-serif",
                fontSize: 16, cursor: "pointer", border: "none", transition: "all 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: activeGroup === g ? "var(--gold)" : "var(--surface2)",
                color: activeGroup === g ? "var(--black)" : "var(--text-muted)",
              }}>{g}</button>
            ))}
          </div>

          {/* Group table */}
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: "var(--gold)" }}>
                GRUPO {activeGroup}
              </span>
              <span className={`badge ${viewMode === "real" ? "badge-blue" : "badge-gold"}`} style={{ fontSize: 11 }}>
                {viewMode === "real" ? "Resultados Oficiales" : "Según Mis Predicciones"}
              </span>
            </div>

            {groupTable.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
                Sin resultados en este grupo aún
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["#", "Equipo", "PJ", "G", "E", "P", "GF", "GC", "DG", "Pts"].map((h) => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupTable.map((team, i) => {
                      // Check if this 3rd place team qualifies
                      const isThird = i === 2;
                      const qualifies3rd = isThird && displayThirds.find(t => t.team === team.team)?.qualifies;
                      const advances = i < 2 || qualifies3rd;
                      return (
                        <tr key={team.team} style={{
                          borderBottom: "1px solid var(--border)",
                          background: advances ? "rgba(201,168,76,0.04)" : "transparent",
                        }}>
                          <td style={s.td}>
                            <span style={{ color: i < 2 ? "var(--gold)" : qualifies3rd ? "var(--green)" : "var(--text-muted)" }}>
                              {i + 1}
                            </span>
                          </td>
                          <td style={{ ...s.td, fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>
                            {team.team}
                            {i < 2 && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--gold)" }}>✓</span>}
                            {qualifies3rd && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--green)" }}>✓3°</span>}
                          </td>
                          <td style={s.td}>{team.played}</td>
                          <td style={s.td}>{team.won}</td>
                          <td style={s.td}>{team.drawn}</td>
                          <td style={s.td}>{team.lost}</td>
                          <td style={s.td}>{team.gf}</td>
                          <td style={s.td}>{team.ga}</td>
                          <td style={{ ...s.td, color: team.gd > 0 ? "var(--green)" : team.gd < 0 ? "var(--red)" : "var(--text-muted)" }}>
                            {team.gd > 0 ? `+${team.gd}` : team.gd}
                          </td>
                          <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)" }}>
                            {team.points}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
              ✓ = Clasificado directo · ✓3° = Clasifica como mejor tercero
            </div>
          </div>

          {/* Predicted 1st/2nd summary */}
          {viewMode === "predicted" && groupTable.length >= 2 && (
            <div className="card-gold" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--gold)", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, marginBottom: 10, letterSpacing: "0.08em" }}>
                TU PREDICCIÓN — GRUPO {activeGroup}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { pos: "🥇 1°", team: groupTable[0] },
                  { pos: "🥈 2°", team: groupTable[1] },
                  ...(groupTable[2] ? [{ pos: "🥉 3°", team: groupTable[2] }] : []),
                ].map(({ pos, team }) => {
                  const realTeam = realStandings[activeGroup];
                  const realPos = realTeam?.findIndex(t => t.team === team.team) ?? -1;
                  const predictedPos = groupTable.findIndex(t => t.team === team.team);
                  const match = realPos === predictedPos && realPos >= 0;
                  return (
                    <div key={pos} style={{ background: "var(--surface2)", borderRadius: "var(--radius-sm)", padding: "10px 14px", minWidth: 110 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pos}</div>
                      <div style={{ fontWeight: 600, color: match ? "var(--gold)" : "var(--text)", marginTop: 4, fontSize: 14 }}>
                        {team.team} {match ? "✅" : realPos >= 0 ? "❌" : ""}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {team.points} pts · DG {team.gd > 0 ? `+${team.gd}` : team.gd}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        /* 3rd Place Table */
        <div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: "var(--gold)" }}>
                TABLA DE TERCEROS
              </span>
              <span className={`badge ${viewMode === "real" ? "badge-blue" : "badge-gold"}`} style={{ fontSize: 11 }}>
                {viewMode === "real" ? "Resultados Oficiales" : "Según Mis Predicciones"}
              </span>
              <span className="badge badge-green" style={{ fontSize: 11 }}>Top 8 clasifican</span>
            </div>

            {displayThirds.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
                Los terceros aparecerán cuando cada grupo tenga resultados
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["#", "Equipo", "Grupo", "PJ", "G", "E", "P", "GF", "GC", "DG", "Pts", "Estado"].map((h) => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayThirds.map((team, i) => (
                      <tr key={team.team} style={{
                        borderBottom: "1px solid var(--border)",
                        background: team.qualifies ? "rgba(46,204,113,0.04)" : "transparent",
                      }}>
                        <td style={s.td}>
                          <span style={{ color: team.qualifies ? "var(--green)" : "var(--text-muted)" }}>
                            {i + 1}
                          </span>
                        </td>
                        <td style={{ ...s.td, fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>{team.team}</td>
                        <td style={{ ...s.td, color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif" }}>{team.group}</td>
                        <td style={s.td}>{team.played}</td>
                        <td style={s.td}>{team.won}</td>
                        <td style={s.td}>{team.drawn}</td>
                        <td style={s.td}>{team.lost}</td>
                        <td style={s.td}>{team.gf}</td>
                        <td style={s.td}>{team.ga}</td>
                        <td style={{ ...s.td, color: team.gd > 0 ? "var(--green)" : team.gd < 0 ? "var(--red)" : "var(--text-muted)" }}>
                          {team.gd > 0 ? `+${team.gd}` : team.gd}
                        </td>
                        <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)" }}>
                          {team.points}
                        </td>
                        <td style={{ ...s.td }}>
                          {team.qualifies
                            ? <span className="badge badge-green" style={{ fontSize: 10 }}>Clasifica</span>
                            : <span className="badge badge-red" style={{ fontSize: 10 }}>Eliminado</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
              Los mejores 8 terceros de los 12 grupos avanzan a octavos de final
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif", fontSize: 28 }}>Cargando...</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  th: {
    padding: "10px 8px", fontSize: 11, color: "var(--text-muted)",
    textAlign: "center", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
    letterSpacing: "0.06em", textTransform: "uppercase",
  },
  td: { padding: "12px 8px", fontSize: 14, textAlign: "center", color: "var(--text)" },
};
