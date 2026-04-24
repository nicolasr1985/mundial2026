// app/standings/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getMatches, getUserGroupPicks, Match, GroupPick } from "@/lib/firebase";

// Real-world standings after admin sets them would come from groupStandings collection.
// Here we compute predicted standings from picks and show real ones side by side.

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

interface TeamStat {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

function computeStandings(matches: Match[]): Record<string, TeamStat[]> {
  const standings: Record<string, Record<string, TeamStat>> = {};

  for (const m of matches) {
    if (!m.group || m.homeScore === null || m.awayScore === null) continue;
    const g = m.group;
    if (!standings[g]) standings[g] = {};

    const ensureTeam = (team: string) => {
      if (!standings[g][team]) {
        standings[g][team] = { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
      }
    };

    ensureTeam(m.homeTeam);
    ensureTeam(m.awayTeam);

    const home = standings[g][m.homeTeam];
    const away = standings[g][m.awayTeam];
    const hs = m.homeScore, as_ = m.awayScore;

    home.played++; away.played++;
    home.gf += hs; home.ga += as_; home.gd = home.gf - home.ga;
    away.gf += as_; away.ga += hs; away.gd = away.gf - away.ga;

    if (hs > as_) { home.won++; home.points += 3; away.lost++; }
    else if (hs < as_) { away.won++; away.points += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.points++; away.points++; }
  }

  const result: Record<string, TeamStat[]> = {};
  for (const g in standings) {
    result[g] = Object.values(standings[g])
      .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  }
  return result;
}

function computePredictedStandings(matches: Match[], picks: Record<string, { homeScore: number; awayScore: number }>): Record<string, TeamStat[]> {
  // Replace real scores with user's picks
  const predictedMatches = matches.map((m) => {
    const pick = picks[m.id];
    if (!pick) return m;
    return { ...m, homeScore: pick.homeScore, awayScore: pick.awayScore, status: "finished" as const };
  });
  return computeStandings(predictedMatches);
}

export default function StandingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [groupPicks, setGroupPicks] = useState<GroupPick[]>([]);
  const [userMatchPicks, setUserMatchPicks] = useState<Record<string, { homeScore: number; awayScore: number }>>({});
  const [activeGroup, setActiveGroup] = useState("A");
  const [viewMode, setViewMode] = useState<"real" | "predicted">("real");
  const [fetching, setFetching] = useState(true);

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    const { getUserPicks } = await import("@/lib/firebase");
    const [m, gp, up] = await Promise.all([
      getMatches(),
      getUserGroupPicks(user.uid),
      getUserPicks(user.uid),
    ]);
    setMatches(m);
    setGroupPicks(gp);
    const pickMap: Record<string, { homeScore: number; awayScore: number }> = {};
    up.forEach((p) => { pickMap[p.matchId] = { homeScore: p.homeScore, awayScore: p.awayScore }; });
    setUserMatchPicks(pickMap);
    setFetching(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const groupMatches = matches.filter((m) => m.round?.startsWith("Fase de Grupos"));
  const availableGroups = Array.from(new Set(groupMatches.map((m) => m.group).filter(Boolean) as string[])).sort();

  const realStandings = computeStandings(groupMatches);
  const predictedStandings = computePredictedStandings(groupMatches, userMatchPicks);

  const displayStandings = viewMode === "real" ? realStandings : predictedStandings;
  const groupTable = displayStandings[activeGroup] || [];

  // My group pick prediction
  const myGroupPick = groupPicks.find((gp) => gp.group === activeGroup);

  if (loading || fetching) return <Loading />;

  return (
    <div className="page animate-fade-up">
      <h1 style={{ fontSize: 36, marginBottom: 4 }}><span className="gold-text">TABLA</span></h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Posiciones reales vs tus predicciones
      </p>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["real", "predicted"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${viewMode === mode ? "var(--border-gold)" : "var(--border)"}`,
              background: viewMode === mode ? "rgba(201,168,76,0.12)" : "var(--surface2)",
              color: viewMode === mode ? "var(--gold)" : "var(--text-muted)",
              fontFamily: "'Rajdhani',sans-serif",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {mode === "real" ? "📊 Tabla Real" : "🔮 Según Mis Picks"}
          </button>
        ))}
      </div>

      {availableGroups.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <p>No hay partidos de grupos aún.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>El administrador los cargará pronto.</p>
        </div>
      ) : (
        <>
          {/* Group selector */}
          <div style={s.groupTabs}>
            {availableGroups.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                style={{
                  ...s.groupTab,
                  background: activeGroup === g ? "var(--gold)" : "var(--surface2)",
                  color: activeGroup === g ? "var(--black)" : "var(--text-muted)",
                }}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Table */}
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
                    {groupTable.map((team, i) => (
                      <tr key={team.team} style={{
                        borderBottom: "1px solid var(--border)",
                        background: i < 2 ? "rgba(201,168,76,0.04)" : "transparent",
                        transition: "background 0.15s",
                      }}>
                        <td style={s.td}>
                          <span style={{ color: i < 2 ? "var(--gold)" : i === 2 ? "var(--text-dim)" : "var(--text-muted)" }}>
                            {i + 1}
                          </span>
                        </td>
                        <td style={{ ...s.td, fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>
                          {team.team}
                          {i < 2 && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--gold)" }}>✓</span>}
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
              ✓ = Clasificado · Top 2 avanzan automáticamente
            </div>
          </div>

          {/* My group pick */}
          {myGroupPick && (
            <div className="card-gold">
              <div style={{ fontSize: 13, color: "var(--gold)", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, marginBottom: 10 }}>
                MI PREDICCIÓN — GRUPO {activeGroup}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { pos: "🥇 1°", pick: myGroupPick.firstPlace, real: groupTable[0]?.team },
                  { pos: "🥈 2°", pick: myGroupPick.secondPlace, real: groupTable[1]?.team },
                  { pos: "🥉 3° (que pasa)", pick: myGroupPick.thirdPlace, real: groupTable[2]?.team },
                ].map(({ pos, pick, real }) => {
                  if (!pick) return null;
                  const hit = real && pick === real;
                  return (
                    <div key={pos} style={{ background: "var(--surface2)", borderRadius: "var(--radius-sm)", padding: "10px 14px", minWidth: 120 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pos}</div>
                      <div style={{ fontWeight: 600, color: hit ? "var(--gold)" : "var(--text)", marginTop: 4 }}>
                        {pick} {hit ? "✅" : real ? "❌" : ""}
                      </div>
                      {real && !hit && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Real: {real}</div>}
                    </div>
                  );
                })}
                {myGroupPick.points !== null && myGroupPick.points !== undefined && (
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: "var(--gold)" }}>
                      +{myGroupPick.points}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>pts grupo</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
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
  groupTabs: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  groupTab: {
    width: 36, height: 36, borderRadius: 6, fontFamily: "'Bebas Neue',sans-serif",
    fontSize: 16, cursor: "pointer", border: "none", transition: "all 0.15s",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  th: {
    padding: "10px 8px", fontSize: 11, color: "var(--text-muted)",
    textAlign: "center", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
    letterSpacing: "0.06em", textTransform: "uppercase",
  },
  td: {
    padding: "12px 8px", fontSize: 14, textAlign: "center", color: "var(--text)",
  },
};
