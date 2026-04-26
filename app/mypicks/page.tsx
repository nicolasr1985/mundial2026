// app/mypicks/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getUserPicks, getMatches, getUserGroupPicks, getTournamentSettings, getAllPicks, getAllUsers, Pick, Match, GroupPick, UserProfile } from "@/lib/firebase";
import { getPointsBreakdown } from "@/lib/scoring";
import { teamWithRank, canSeeRanking } from "@/lib/fifa-ranking";

export default function MyPicksPage() {
  const { user, profile, loading } = useAuth();
  const showRank = canSeeRanking(user?.email);
  const router = useRouter();
  const [picks, setPicks] = useState<Pick[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groupPicks, setGroupPicks] = useState<GroupPick[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter] = useState<"all" | "exact" | "correct" | "wrong" | "pending">("all");

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  const [allPicks, setAllPicks] = useState<Pick[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [activeView, setActiveView] = useState<"mine" | "community">("mine");

  const loadData = useCallback(async () => {
    if (!user) return;
    const [p, m, gp, st, ap, au] = await Promise.all([
      getUserPicks(user.uid),
      getMatches(),
      getUserGroupPicks(user.uid),
      getTournamentSettings(),
      getAllPicks(),
      getAllUsers(),
    ]);
    setPicks(p);
    setMatches(m);
    setGroupPicks(gp);
    setSettings(st as Record<string, string>);
    setAllPicks(ap);
    setAllUsers(au);
    setFetching(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const matchMap = Object.fromEntries(matches.map((m) => [m.id, m]));

  const enrichedPicks = picks.map((p) => ({
    pick: p,
    match: matchMap[p.matchId],
  })).filter((e) => !!e.match).sort((a, b) =>
    (b.match.matchDate?.toDate?.()?.getTime() ?? 0) - (a.match.matchDate?.toDate?.()?.getTime() ?? 0)
  );

  const filteredPicks = enrichedPicks.filter(({ pick, match }) => {
    if (filter === "all") return true;
    if (filter === "pending") return match.status !== "finished";
    if (match.status !== "finished") return false;
    if (filter === "exact") return pick.points === 5;
    if (filter === "correct") return (pick.points ?? 0) > 0 && pick.points !== 5;
    if (filter === "wrong") return (pick.points ?? 0) === 0;
    return true;
  });

  // Stats
  const finishedPicks = enrichedPicks.filter((e) => e.match.status === "finished");
  const totalPts = picks.reduce((s, p) => s + (p.points ?? 0), 0)
    + groupPicks.reduce((s, p) => s + (p.points ?? 0), 0)
    + (settings.champion && profile?.champion === settings.champion ? 15 : 0)
    + (settings.topScorer && profile?.topScorer === settings.topScorer ? 10 : 0);
  const exactCount = finishedPicks.filter((e) => e.pick.points === 5).length;
  const correctCount = finishedPicks.filter((e) => (e.pick.points ?? 0) > 0 && e.pick.points !== 5).length;
  const accuracy = finishedPicks.length > 0 ? Math.round((exactCount + correctCount) / finishedPicks.length * 100) : 0;

  if (loading || fetching) return <Loading />;

  return (
    <div className="page animate-fade-up">
      <h1 style={{ fontSize: 36, marginBottom: 4 }}><span className="gold-text">MIS PICKS</span></h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
        Historial de apuestas y resultados de {profile?.displayName}
      </p>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 24 }}>
        {([
          { id: "mine", label: "📋 Mis Picks" },
          { id: "community", label: "👥 Todos los Picks" },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setActiveView(t.id)} style={{
            padding: "10px 18px", fontSize: 13, cursor: "pointer", border: "none",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, letterSpacing: "0.04em",
            background: "transparent", transition: "all 0.15s",
            color: activeView === t.id ? "var(--gold)" : "var(--text-muted)",
            borderBottom: `2px solid ${activeView === t.id ? "var(--gold)" : "transparent"}`,
          }}>{t.label}</button>
        ))}
      </div>

      {activeView === "community" && (
        <CommunityPicksView
          matches={matches}
          allPicks={allPicks}
          allUsers={allUsers}
          myUid={user?.uid ?? ""}
          showRank={showRank}
        />
      )}

      {activeView === "mine" && (
      <div>

      {/* Stats row */}
      <div style={s.statsGrid}>
        <StatCard label="Puntos totales" value={totalPts} unit="pts" highlight />
        <StatCard label="Exactos" value={exactCount} unit="⭐" />
        <StatCard label="Correctos" value={correctCount} unit="✅" />
        <StatCard label="Precisión" value={accuracy} unit="%" />
        <StatCard label="Apuestas" value={finishedPicks.length} unit="/" extra={picks.length} />
      </div>

      {/* Special picks */}
      <div className="card-gold" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, marginBottom: 14, color: "var(--text)" }}>🏆 Predicciones Especiales</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SpecialPickRow
            label="Campeón del Mundial"
            myPick={profile?.champion}
            official={settings.champion}
            points={15}
          />
          <SpecialPickRow
            label="Goleador del Torneo"
            myPick={profile?.topScorer}
            official={settings.topScorer}
            points={10}
          />
        </div>

        {groupPicks.length > 0 && (
          <>
            <div className="divider" />
            <h3 style={{ fontSize: 15, color: "var(--text)", marginBottom: 10 }}>Clasificaciones de Grupo</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
              {groupPicks.map((gp) => (
                <GroupPickRow key={gp.group} gp={gp} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Filter tabs */}
      <div style={s.filterRow}>
        {(["all", "pending", "exact", "correct", "wrong"] as const).map((f) => {
          const labels = { all: "Todos", pending: "Pendientes", exact: "Exactos ⭐", correct: "Correctos ✅", wrong: "Fallados ❌" };
          const counts = {
            all: enrichedPicks.length,
            pending: enrichedPicks.filter((e) => e.match.status !== "finished").length,
            exact: enrichedPicks.filter((e) => e.pick.points === 5).length,
            correct: enrichedPicks.filter((e) => (e.pick.points ?? 0) > 0 && e.pick.points !== 5).length,
            wrong: enrichedPicks.filter((e) => e.match.status === "finished" && (e.pick.points ?? 0) === 0).length,
          };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                ...s.filterBtn,
                background: filter === f ? "rgba(201,168,76,0.15)" : "var(--surface2)",
                color: filter === f ? "var(--gold)" : "var(--text-muted)",
                border: `1px solid ${filter === f ? "var(--border-gold)" : "var(--border)"}`,
              }}
            >
              {labels[f]} <span style={{ opacity: 0.6, fontSize: 11 }}>({counts[f]})</span>
            </button>
          );
        })}
      </div>

      {/* Picks list */}
      {filteredPicks.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          No hay apuestas en esta categoría
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredPicks.map(({ pick, match }) => (
            <PickResultRow key={pick.id} pick={pick} match={match} showRank={showRank} />
          ))}
        </div>
      )}
        </div>
      )}
    </div>
  );
}

// ─── PICK RESULT ROW ──────────────────────────────────────────────────────────
function PickResultRow({ pick, match, showRank }: { pick: Pick; match: Match; showRank: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const finished = match.status === "finished";
  const hasResult = match.homeScore !== null && match.awayScore !== null;

  const breakdown = finished && hasResult
    ? getPointsBreakdown(pick.homeScore, pick.awayScore, match.homeScore!, match.awayScore!)
    : null;

  const statusColor = !finished ? "var(--text-muted)" :
    pick.points === 5 ? "var(--gold)" :
    (pick.points ?? 0) > 0 ? "var(--green)" : "var(--red)";

  const dateStr = match.matchDate?.toDate
    ? match.matchDate.toDate().toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${!finished ? "var(--border)" : pick.points === 5 ? "rgba(201,168,76,0.4)" : (pick.points ?? 0) > 0 ? "rgba(46,204,113,0.3)" : "var(--border)"}`,
      borderRadius: "var(--radius-sm)",
      overflow: "hidden",
    }}>
      <div
        style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: finished ? "pointer" : "default" }}
        onClick={() => finished && setExpanded((e) => !e)}
      >
        {/* Round tag */}
        <div style={{ fontSize: 10, color: "var(--text-muted)", width: 60, flexShrink: 0, textAlign: "center",
          background: "var(--surface2)", padding: "3px 6px", borderRadius: 4, lineHeight: 1.3 }}>
          {match.round.replace("Fase de Grupos - ", "G.").replace(" de Final", "")}
        </div>

        {/* Teams */}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>
            {teamWithRank(match.homeTeam, showRank)} <span style={{ color: "var(--text-muted)" }}>vs</span> {teamWithRank(match.awayTeam, showRank)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{dateStr}</div>
        </div>

        {/* My pick */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Mi pick</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18 }}>
            {pick.homeScore} – {pick.awayScore}
          </div>
        </div>

        {/* Real result */}
        <div style={{ textAlign: "center", flexShrink: 0, minWidth: 60 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Resultado</div>
          {hasResult ? (
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)" }}>
              {match.homeScore} – {match.awayScore}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>—</div>
          )}
        </div>

        {/* Points */}
        <div style={{ textAlign: "center", flexShrink: 0, minWidth: 44 }}>
          {finished ? (
            <>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: statusColor, lineHeight: 1 }}>
                {pick.points ?? "?"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>pts</div>
            </>
          ) : (
            <span className="badge badge-blue" style={{ fontSize: 10 }}>
              {match.status === "live" ? "🔴 LIVE" : "📅"}
            </span>
          )}
        </div>
      </div>

      {/* Breakdown */}
      {expanded && breakdown && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", background: "var(--surface2)" }}>
          {breakdown.reasons.map((r, i) => (
            <div key={i} style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.8 }}>{r}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpecialPickRow({ label, myPick, official, points }: { label: string; myPick?: string; official?: string; points: number }) {
  const hit = official && myPick === official;
  return (
    <div style={{ background: "var(--surface2)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 15, color: hit ? "var(--gold)" : "var(--text)" }}>
        {myPick || <span style={{ color: "var(--text-muted)" }}>Sin predicción</span>}
        {hit && <span style={{ marginLeft: 6 }}>✅ +{points} pts</span>}
      </div>
      {official && !hit && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Oficial: {official}</div>
      )}
    </div>
  );
}

function GroupPickRow({ gp }: { gp: GroupPick }) {
  return (
    <div style={{ background: "var(--surface2)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--gold)", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, marginBottom: 4 }}>
        GRUPO {gp.group}
        {gp.points !== null && gp.points !== undefined && (
          <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>+{gp.points} pts</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
        1°: {gp.firstPlace} · 2°: {gp.secondPlace}
        {gp.thirdPlace ? ` · 3°: ${gp.thirdPlace}` : ""}
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, highlight, extra }: { label: string; value: number; unit: string; highlight?: boolean; extra?: number }) {
  return (
    <div style={{
      background: "var(--surface)", border: `1px solid ${highlight ? "var(--border-gold)" : "var(--border)"}`,
      borderRadius: "var(--radius-sm)", padding: "14px 16px", textAlign: "center",
    }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: highlight ? "var(--gold)" : "var(--text)", lineHeight: 1 }}>
        {value}{extra !== undefined ? `/${extra}` : ""} <span style={{ fontSize: 14 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ─── COMMUNITY PICKS VIEW ────────────────────────────────────────────────────
function CommunityPicksView({ matches, allPicks, allUsers, myUid, showRank }: {
  matches: Match[];
  allPicks: Pick[];
  allUsers: UserProfile[];
  myUid: string;
  showRank: boolean;
}) {
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);

  // Only show group stage + other rounds that are locked or finished
  const relevantMatches = matches
    .filter((m) => m.round?.startsWith("Fase de Grupos"))
    .sort((a, b) => (a.matchDate?.toDate?.()?.getTime() ?? 0) - (b.matchDate?.toDate?.()?.getTime() ?? 0));

  // Group by group
  const byGroup = relevantMatches.reduce((acc, m) => {
    const g = m.group || "?";
    if (!acc[g]) acc[g] = [];
    acc[g].push(m);
    return acc;
  }, {} as Record<string, Match[]>);

  // Build picks index: matchId -> userId -> pick
  const picksIndex: Record<string, Record<string, Pick>> = {};
  for (const p of allPicks) {
    if (!picksIndex[p.matchId]) picksIndex[p.matchId] = {};
    picksIndex[p.matchId][p.userId] = p;
  }

  const nonAdminUsers = allUsers.filter(u => !u.isAdmin);

  if (matches.length === 0) return (
    <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
      <p>No hay partidos cargados aún.</p>
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, padding: "10px 14px", background: "rgba(201,168,76,0.06)", border: "1px solid var(--border-gold)", borderRadius: "var(--radius-sm)" }}>
        💡 Puedes ver si alguien apostó en un partido. El marcador exacto se revela solo cuando el partido haya comenzado y las apuestas estén cerradas.
      </p>

      {Object.entries(byGroup).sort(([a],[b]) => a.localeCompare(b)).map(([group, gMatches]) => (
        <div key={group} style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)", letterSpacing: "0.08em", marginBottom: 10 }}>
            GRUPO {group}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {gMatches.map((match) => {
              const matchPicks = picksIndex[match.id] ?? {};
              const isLocked = match.locked || match.status === "finished" || match.status === "live";
              const dateStr = match.matchDate?.toDate?.()?.toLocaleString("es-CO", {
                weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
              }) ?? "—";
              const isExpanded = selectedMatch === match.id;

              return (
                <div key={match.id} style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                }}>
                  {/* Match header row */}
                  <div
                    onClick={() => setSelectedMatch(isExpanded ? null : match.id)}
                    style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
                  >
                    {/* Status dot */}
                    <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: match.status === "live" ? "var(--green)" : match.status === "finished" ? "var(--text-muted)" : "var(--gold)",
                      boxShadow: match.status === "live" ? "0 0 8px var(--green)" : "none",
                    }} />

                    {/* Teams */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {teamWithRank(match.homeTeam, showRank)} <span style={{ color: "var(--text-muted)" }}>vs</span> {teamWithRank(match.awayTeam, showRank)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{dateStr}</div>
                    </div>

                    {/* Official result if finished */}
                    {match.homeScore !== null && match.awayScore !== null && (
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: "var(--gold)" }}>
                        {match.homeScore} – {match.awayScore}
                      </div>
                    )}

                    {/* Pick count badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {Object.keys(matchPicks).length}/{nonAdminUsers.length} apostaron
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expanded picks grid */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                        {nonAdminUsers.map((u) => {
                          const pick = matchPicks[u.uid];
                          const isMe = u.uid === myUid;
                          const showScore = isLocked || isMe; // show score if locked OR it's my own pick

                          return (
                            <div key={u.uid} style={{
                              background: isMe ? "rgba(201,168,76,0.08)" : "var(--surface2)",
                              border: `1px solid ${isMe ? "var(--border-gold)" : "var(--border)"}`,
                              borderRadius: "var(--radius-sm)",
                              padding: "10px 12px",
                            }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: isMe ? "var(--gold)" : "var(--text)", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                                {u.displayName}
                                {isMe && <span style={{ fontSize: 10, background: "rgba(201,168,76,0.2)", color: "var(--gold)", padding: "1px 5px", borderRadius: 3 }}>Tú</span>}
                              </div>
                              {pick ? (
                                showScore ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--text)" }}>
                                      {pick.homeScore} – {pick.awayScore}
                                    </span>
                                    {pick.points !== null && pick.points !== undefined && (
                                      <span className="badge badge-gold" style={{ fontSize: 10 }}>{pick.points} pts</span>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 13, color: "var(--green)" }}>✓ Apostó</span>
                                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(se revela al inicio)</span>
                                  </div>
                                )
                              ) : (
                                <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Sin apuesta</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
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
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 20 },
  filterRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  filterBtn: { padding: "6px 12px", borderRadius: 20, fontSize: 13, fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" },
};
