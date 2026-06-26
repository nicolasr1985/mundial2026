// app/mypicks/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getUserPicks, getMatches, getUserGroupPicks, getTournamentSettings, getAllPicks, getAllUsers, updateChampionPick, Pick, Match, GroupPick, UserProfile } from "@/lib/firebase";
import { WC2026_TEAMS, WC2026_SCORERS, formatScorer } from "@/lib/wc2026-data";
import { getPointsBreakdown, isDeadlinePassed } from "@/lib/scoring";
import { teamWithRank, canSeeRanking } from "@/lib/fifa-ranking";

export default function MyPicksPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const showRank = canSeeRanking(user?.email, profile?.showFifaRanking);
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
  const [activeView, setActiveView] = useState<"mine" | "community" | "stats">("mine");
  const [mineCollapsedPhases, setMineCollapsedPhases] = useState<Set<string>>(new Set());

  const toggleMinePhase = (phase: string) => {
    setMineCollapsedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase); else next.add(phase);
      return next;
    });
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    await refreshProfile();
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
  }, [user, refreshProfile]);

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
    if (filter === "correct") return (pick.points ?? 0) >= 2 && pick.points !== 5;
    if (filter === "wrong") return (pick.points ?? 0) <= 1;
    return true;
  });

  // Stats
  const finishedPicks = enrichedPicks.filter((e) => e.match.status === "finished");
  const totalPts = picks.reduce((s, p) => s + (p.points ?? 0), 0)
    + groupPicks.reduce((s, p) => s + (p.points ?? 0), 0)
    + (settings.champion && profile?.champion === settings.champion ? 15 : 0)
    + (settings.topScorer && profile?.topScorer === settings.topScorer ? 10 : 0);
  const exactCount = finishedPicks.filter((e) => e.pick.points === 5).length;
  const correctCount = finishedPicks.filter((e) => (e.pick.points ?? 0) >= 2 && e.pick.points !== 5).length;
  const accuracy = finishedPicks.length > 0 ? Math.round((exactCount + correctCount) / finishedPicks.length * 100) : 0;

  if (loading || fetching) return <Loading />;

  return (
    <div className="page animate-fade-up">
      <h1 style={{ fontSize: 36, marginBottom: 4 }}><span className="gold-text">MIS PICKS</span></h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
        Historial de apuestas y resultados de {profile?.displayName}
      </p>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 24, overflowX: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {([
          { id: "mine", label: "📋 Mis Picks" },
          { id: "community", label: "👥 Todos los Picks" },
          { id: "stats", label: "📊 Stats" },
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

      {activeView === "stats" && (
        <StatsView
          matches={matches}
          allPicks={allPicks}
          allUsers={allUsers}
          myUid={user?.uid ?? ""}
          myPicks={picks}
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
            <StatCard label="Apuestas" value={finishedPicks.length} unit="" extra={picks.length} />
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
                field="champion"
                uid={user?.uid}
                currentTopScorer={profile?.topScorer}
                onSaved={refreshProfile}
              />
              <SpecialPickRow
                label="Goleador del Torneo"
                myPick={profile?.topScorer}
                official={settings.topScorer}
                points={10}
                field="topScorer"
                uid={user?.uid}
                currentChampion={profile?.champion}
                onSaved={refreshProfile}
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
                correct: enrichedPicks.filter((e) => (e.pick.points ?? 0) >= 2 && e.pick.points !== 5).length,
                wrong: enrichedPicks.filter((e) => e.match.status === "finished" && (e.pick.points ?? 0) <= 1).length,
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
            (() => {
              // Group filtered picks by phase
              const phaseOf = (m: Match) => m.group ? `Grupo ${m.group}` : (m.round || "Otros");
              const PHASE_ORDER = ["Grupo A","Grupo B","Grupo C","Grupo D","Grupo E","Grupo F","Grupo G","Grupo H","Grupo I","Grupo J","Grupo K","Grupo L","Ronda de 32","Octavos de Final","Cuartos de Final","Semifinal","Tercer Puesto","Final","Otros"];
              const byPhase: Record<string, typeof filteredPicks> = {};
              for (const fp of filteredPicks) {
                const ph = phaseOf(fp.match);
                if (!byPhase[ph]) byPhase[ph] = [];
                byPhase[ph].push(fp);
              }
              const sortedPhases = Object.keys(byPhase).sort((a, b) => {
                const ia = PHASE_ORDER.indexOf(a), ib = PHASE_ORDER.indexOf(b);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return a.localeCompare(b);
              });
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {sortedPhases.map((phase) => {
                    const collapsed = mineCollapsedPhases.has(phase);
                    const phasePicks = byPhase[phase];
                    return (
                      <div key={phase}>
                        <div
                          onClick={() => toggleMinePhase(phase)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                            padding: "8px 0", marginBottom: collapsed ? 0 : 8,
                            borderBottom: "1px solid var(--border)",
                            userSelect: "none",
                          }}
                        >
                          <span style={{ fontSize: 12, color: "var(--gold)", width: 14 }}>{collapsed ? "▶" : "▼"}</span>
                          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: "var(--gold)", letterSpacing: "0.08em" }}>
                            {phase.startsWith("Grupo ") ? phase.toUpperCase() : phase}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            ({phasePicks.length})
                          </span>
                        </div>
                        {!collapsed && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {phasePicks.map(({ pick, match }) => (
                              <PickResultRow key={pick.id} pick={pick} match={match} showRank={showRank} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
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
            <span className={match.status === "live" ? "badge badge-green" : "badge badge-blue"} style={{ fontSize: 10 }}>
              {match.status === "live" ? "🟢 LIVE" : "📅"}
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

function SpecialPickRow({ label, myPick, official, points, field, uid, currentChampion, currentTopScorer, onSaved }: {
  label: string; myPick?: string; official?: string; points: number;
  field?: "champion" | "topScorer"; uid?: string;
  currentChampion?: string; currentTopScorer?: string;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(myPick || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { setValue(myPick || ""); }, [myPick]);

  const hit = official && myPick === official;
  const isTeam = field === "champion";
  const options = isTeam ? WC2026_TEAMS : WC2026_SCORERS;

  const handleSave = async () => {
    if (!uid || !field) return;
    setSaving(true);
    try {
      const champion = field === "champion" ? value : (currentChampion || "");
      const topScorer = field === "topScorer" ? value : (currentTopScorer || "");
      await updateChampionPick(uid, champion, topScorer);
      setMsg("✅ Guardado");
      setEditing(false);
      if (onSaved) await onSaved();
    } catch {
      setMsg("❌ Error al guardar");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  return (
    <div style={{ background: "var(--surface2)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      {editing && !isDeadlinePassed() ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{
              background: "var(--surface)", border: "1px solid var(--border-gold)",
              borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: 13,
              color: "var(--text)", outline: "none", width: "100%",
            }}
          >
            <option value="">🗑 Limpiar selección</option>
            {options.map((o) => (
              <option key={isTeam ? o as string : (o as any).name} value={isTeam ? o as string : (o as any).name}>
                {isTeam ? o as string : formatScorer(o as any)}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving}
              style={{ padding: "6px 14px", fontSize: 12, flex: 1 }}>
              {saving ? "..." : "Guardar"}
            </button>
            <button onClick={() => { setEditing(false); setValue(myPick || ""); }}
              style={{ padding: "6px 10px", fontSize: 12, background: "var(--surface3)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                color: "var(--text-muted)", cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: hit ? "var(--gold)" : "var(--text)" }}>
              {myPick || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Sin predicción</span>}
              {hit && <span style={{ marginLeft: 6 }}>✅ +{points} pts</span>}
            </div>
            {!official && !isDeadlinePassed() && (
              <button onClick={() => setEditing(true)}
                style={{ fontSize: 11, padding: "3px 10px", background: "rgba(201,168,76,0.1)",
                  border: "1px solid var(--border-gold)", borderRadius: "var(--radius-sm)",
                  color: "var(--gold)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                {myPick ? "Cambiar" : "Escoger"}
              </button>
            )}
          </div>
          {official && !hit && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Oficial: {official}</div>
          )}
          {msg && <span style={{ fontSize: 12, color: "var(--green)" }}>{msg}</span>}
        </>
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
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());

  const togglePhase = (phase: string) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase); else next.add(phase);
      return next;
    });
  };

  const toggleCat = (cat: string) => {
    setHiddenCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Phase categories — groups all combined under "Grupos"
  const CAT_ORDER = ["Grupos", "Ronda de 32", "Octavos de Final", "Cuartos de Final", "Semifinal", "Tercer Puesto", "Final", "Otros"];
  function categoryOf(phaseKey: string): string {
    if (phaseKey.startsWith("Grupo ")) return "Grupos";
    if (CAT_ORDER.includes(phaseKey)) return phaseKey;
    return "Otros";
  }

  const relevantMatches = matches
    .sort((a, b) => (a.matchDate?.toDate?.()?.getTime() ?? 0) - (b.matchDate?.toDate?.()?.getTime() ?? 0));

  const byGroup = relevantMatches.reduce((acc, m) => {
    const g = m.group ? `Grupo ${m.group}` : (m.round || "Otros");
    if (!acc[g]) acc[g] = [];
    acc[g].push(m);
    return acc;
  }, {} as Record<string, Match[]>);

  const picksIndex: Record<string, Record<string, Pick>> = {};
  for (const p of allPicks) {
    if (!picksIndex[p.matchId]) picksIndex[p.matchId] = {};
    picksIndex[p.matchId][p.userId] = p;
  }

  const nonAdminUsers = allUsers;

  if (matches.length === 0) return (
    <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
      <p>No hay partidos cargados aún.</p>
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, padding: "10px 14px", background: "rgba(201,168,76,0.06)", border: "1px solid var(--border-gold)", borderRadius: "var(--radius-sm)" }}>
        💡 Puedes ver si alguien apostó en un partido. El marcador exacto se revela solo cuando el partido haya comenzado y las apuestas estén cerradas.
      </p>

      {/* Phase filter */}
      {(() => {
        // Count matches per category (so we can show count + skip empty cats)
        const catCounts: Record<string, number> = {};
        for (const [phaseKey, ms] of Object.entries(byGroup)) {
          const c = categoryOf(phaseKey);
          catCounts[c] = (catCounts[c] ?? 0) + ms.length;
        }
        const availableCats = CAT_ORDER.filter(c => catCounts[c] > 0);
        if (availableCats.length <= 1) return null;
        const allSelected = hiddenCats.size === 0;
        const noneSelected = hiddenCats.size === availableCats.length;
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 20 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>
              Filtrar:
            </span>
            {availableCats.map(cat => {
              const hidden = hiddenCats.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                    fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, transition: "all 0.15s",
                    background: hidden ? "var(--surface2)" : "rgba(201,168,76,0.15)",
                    color: hidden ? "var(--text-muted)" : "var(--gold)",
                    border: `1px solid ${hidden ? "var(--border)" : "var(--border-gold)"}`,
                    opacity: hidden ? 0.55 : 1,
                  }}
                >
                  {cat} <span style={{ fontSize: 10, opacity: 0.7 }}>({catCounts[cat]})</span>
                </button>
              );
            })}
            {!allSelected && (
              <button
                onClick={() => setHiddenCats(new Set())}
                style={{
                  padding: "5px 10px", borderRadius: 20, fontSize: 11, cursor: "pointer",
                  fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
                  background: "transparent", color: "var(--text-muted)",
                  border: "1px dashed var(--border)",
                }}
              >
                ✓ Todos
              </button>
            )}
            {!noneSelected && availableCats.length > 1 && (
              <button
                onClick={() => setHiddenCats(new Set(availableCats))}
                style={{
                  padding: "5px 10px", borderRadius: 20, fontSize: 11, cursor: "pointer",
                  fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
                  background: "transparent", color: "var(--text-muted)",
                  border: "1px dashed var(--border)",
                }}
              >
                ✕ Ninguno
              </button>
            )}
          </div>
        );
      })()}

      {Object.entries(byGroup).filter(([key]) => !hiddenCats.has(categoryOf(key))).sort(([a],[b]) => {
        const order = ["Grupo A","Grupo B","Grupo C","Grupo D","Grupo E","Grupo F","Grupo G","Grupo H","Grupo I","Grupo J","Grupo K","Grupo L","Ronda de 32","Octavos de Final","Cuartos de Final","Semifinal","Tercer Puesto","Final","Otros"];
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      }).map(([group, gMatches]) => {
        const collapsed = collapsedPhases.has(group);
        return (
        <div key={group} style={{ marginBottom: 28 }}>
          <div
            onClick={() => togglePhase(group)}
            style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              marginBottom: collapsed ? 0 : 10, paddingBottom: 6,
              borderBottom: "1px solid var(--border)",
              userSelect: "none",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--gold)", width: 14 }}>{collapsed ? "▶" : "▼"}</span>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)", letterSpacing: "0.08em" }}>
              {group.startsWith("Grupo ") ? group.toUpperCase() : group}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({gMatches.length})</span>
          </div>
          {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {gMatches.map((match) => {
              const matchPicks = picksIndex[match.id] ?? {};
              const kickoffPassed = match.matchDate?.toDate ? match.matchDate.toDate() <= new Date() : false;
              const isLocked = kickoffPassed || match.locked || match.status === "finished" || match.status === "live";
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
                  <div
                    onClick={() => setSelectedMatch(isExpanded ? null : match.id)}
                    style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: match.status === "live" ? "var(--green)" : match.status === "finished" ? "var(--text-muted)" : "var(--gold)",
                      boxShadow: match.status === "live" ? "0 0 8px var(--green)" : "none",
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {teamWithRank(match.homeTeam, showRank)} <span style={{ color: "var(--text-muted)" }}>vs</span> {teamWithRank(match.awayTeam, showRank)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{dateStr}</div>
                    </div>
                    {match.homeScore !== null && match.awayScore !== null && (
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: "var(--gold)" }}>
                        {match.homeScore} – {match.awayScore}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {Object.keys(matchPicks).length}/{nonAdminUsers.length} apostaron
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                        {nonAdminUsers.map((u) => {
                          const pick = matchPicks[u.uid];
                          const isMe = u.uid === myUid;
                          const showScore = isLocked || isMe;
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
          )}
        </div>
        );
      })}
    </div>
  );
}

// ─── STATS VIEW ───────────────────────────────────────────────────────────────

// Map team name → 2-letter ISO code for flag emoji
const TEAM_ISO: Record<string, string> = {
  "Algeria": "DZ", "Argentina": "AR", "Australia": "AU", "Austria": "AT",
  "Belgium": "BE", "Bosnia and Herzegovina": "BA", "Brazil": "BR",
  "Canada": "CA", "Cape Verde": "CV", "Colombia": "CO", "Congo DR": "CD",
  "Croatia": "HR", "Curacao": "CW", "Czechia": "CZ",
  "Ecuador": "EC", "Egypt": "EG",
  "France": "FR",
  "Germany": "DE", "Ghana": "GH",
  "Haiti": "HT",
  "Iran": "IR", "Iraq": "IQ", "Ivory Coast": "CI",
  "Japan": "JP", "Jordan": "JO",
  "Mexico": "MX", "Morocco": "MA",
  "Netherlands": "NL", "New Zealand": "NZ", "Norway": "NO",
  "Panama": "PA", "Paraguay": "PY", "Portugal": "PT",
  "Qatar": "QA",
  "Saudi Arabia": "SA", "Senegal": "SN", "South Africa": "ZA",
  "South Korea": "KR", "Spain": "ES", "Sweden": "SE", "Switzerland": "CH",
  "Tunisia": "TN", "Turkey": "TR",
  "United States": "US", "Uruguay": "UY", "Uzbekistan": "UZ",
};

function TeamFlag({ team, size = 24 }: { team: string; size?: number }) {
  // flagcdn.com serves reliable PNG flags that work cross-platform
  let iso: string | undefined = TEAM_ISO[team];
  if (team === "England") iso = "gb-eng";
  if (team === "Scotland") iso = "gb-sct";
  if (!iso) return <span style={{ fontSize: size }}>🏳️</span>;
  // flagcdn widths: 20, 40, 80, 160, 320 — pick next size up for crispness
  const w = size <= 20 ? 40 : size <= 40 ? 80 : size <= 80 ? 160 : 320;
  return (
    <img
      src={`https://flagcdn.com/w${w}/${iso.toLowerCase()}.png`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={team}
      style={{ borderRadius: 3, objectFit: "cover", display: "inline-block", verticalAlign: "middle" }}
    />
  );
}

interface StreakRecord {
  uid: string;
  displayName: string;
  count: number;
  picks: Pick[];
}

function StatsView({ matches, allPicks, allUsers, myPicks }: {
  matches: Match[];
  allPicks: Pick[];
  allUsers: UserProfile[];
  myUid: string;
  myPicks: Pick[];
}) {
  const matchMap = Object.fromEntries(matches.map(m => [m.id, m]));

  // Team code map (FIFA 3-letter) for participating WC2026 teams
  const codeMap: Record<string, string> = {
    "Algeria": "ALG", "Argentina": "ARG", "Australia": "AUS", "Austria": "AUT",
    "Belgium": "BEL", "Bosnia and Herzegovina": "BIH", "Brazil": "BRA",
    "Canada": "CAN", "Cape Verde": "CPV", "Colombia": "COL", "Congo DR": "COD",
    "Croatia": "CRO", "Curacao": "CUW", "Czechia": "CZE",
    "Ecuador": "ECU", "Egypt": "EGY", "England": "ENG",
    "France": "FRA", "Germany": "GER", "Ghana": "GHA",
    "Haiti": "HAI", "Iran": "IRN", "Iraq": "IRQ", "Ivory Coast": "CIV",
    "Japan": "JPN", "Jordan": "JOR", "Mexico": "MEX", "Morocco": "MAR",
    "Netherlands": "NED", "New Zealand": "NZL", "Norway": "NOR",
    "Panama": "PAN", "Paraguay": "PAR", "Portugal": "POR", "Qatar": "QAT",
    "Saudi Arabia": "KSA", "Scotland": "SCO", "Senegal": "SEN",
    "South Africa": "RSA", "South Korea": "KOR", "Spain": "ESP",
    "Sweden": "SWE", "Switzerland": "SUI", "Tunisia": "TUN", "Turkey": "TUR",
    "United States": "USA", "Uruguay": "URU", "Uzbekistan": "UZB",
  };

  // Build per-user picks index, sorted by match date asc (only finished matches with scored points)
  function userSortedPicks(uid: string): Pick[] {
    return allPicks
      .filter(p => p.userId === uid)
      .filter(p => {
        const m = matchMap[p.matchId];
        return m && m.status === "finished" && p.points !== null && p.points !== undefined;
      })
      .sort((a, b) => {
        const ta = matchMap[a.matchId]?.matchDate?.toDate?.()?.getTime() ?? 0;
        const tb = matchMap[b.matchId]?.matchDate?.toDate?.()?.getTime() ?? 0;
        return ta - tb;
      });
  }

  function maxStreakWithMatches(picks: Pick[], predicate: (p: Pick) => boolean): { count: number; picks: Pick[] } {
    let max = 0, cur = 0;
    let bestPicks: Pick[] = [];
    let curPicks: Pick[] = [];
    for (const p of picks) {
      if (predicate(p)) {
        cur++;
        curPicks.push(p);
        if (cur > max) {
          max = cur;
          bestPicks = [...curPicks];
        }
      } else {
        cur = 0;
        curPicks = [];
      }
    }
    return { count: max, picks: bestPicks };
  }

  // Compute streak champions across all non-admin users
  const nonAdminUsers = allUsers.filter(u => !u.isAdmin);
  const exactStreaks: StreakRecord[] = nonAdminUsers.map(u => {
    const r = maxStreakWithMatches(userSortedPicks(u.uid), p => p.points === 5);
    return { uid: u.uid, displayName: u.displayName, count: r.count, picks: r.picks };
  });
  const goodStreaks: StreakRecord[] = nonAdminUsers.map(u => {
    const r = maxStreakWithMatches(userSortedPicks(u.uid), p => (p.points ?? 0) >= 2);
    return { uid: u.uid, displayName: u.displayName, count: r.count, picks: r.picks };
  });
  const zeroStreaks: StreakRecord[] = nonAdminUsers.map(u => {
    const r = maxStreakWithMatches(userSortedPicks(u.uid), p => p.points === 0);
    return { uid: u.uid, displayName: u.displayName, count: r.count, picks: r.picks };
  });

  function topRecords(records: StreakRecord[]): StreakRecord[] {
    const max = Math.max(0, ...records.map(r => r.count));
    if (max === 0) return [];
    return records.filter(r => r.count === max).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  const topExact = topRecords(exactStreaks);
  const topGood = topRecords(goodStreaks);
  const topZero = topRecords(zeroStreaks);

  // My team stats: sum points per team across my finished picks.
  // Only count points for teams that I predicted to win or draw (not lose).
  // - Pick was a draw → both teams get credit
  // - Pick had a winner → only the predicted winner gets credit
  const teamPoints: Record<string, number> = {};
  const teamMatches: Record<string, number> = {};
  for (const p of myPicks) {
    const m = matchMap[p.matchId];
    if (!m || m.status !== "finished" || p.points === null || p.points === undefined) continue;
    const pts = p.points ?? 0;
    if (p.homeScore === p.awayScore) {
      // I predicted a draw → both teams get credit
      teamPoints[m.homeTeam] = (teamPoints[m.homeTeam] ?? 0) + pts;
      teamPoints[m.awayTeam] = (teamPoints[m.awayTeam] ?? 0) + pts;
      teamMatches[m.homeTeam] = (teamMatches[m.homeTeam] ?? 0) + 1;
      teamMatches[m.awayTeam] = (teamMatches[m.awayTeam] ?? 0) + 1;
    } else if (p.homeScore > p.awayScore) {
      // I predicted home to win → only home gets credit
      teamPoints[m.homeTeam] = (teamPoints[m.homeTeam] ?? 0) + pts;
      teamMatches[m.homeTeam] = (teamMatches[m.homeTeam] ?? 0) + 1;
    } else {
      // I predicted away to win → only away gets credit
      teamPoints[m.awayTeam] = (teamPoints[m.awayTeam] ?? 0) + pts;
      teamMatches[m.awayTeam] = (teamMatches[m.awayTeam] ?? 0) + 1;
    }
  }
  const teamRanking = Object.entries(teamPoints)
    .map(([team, pts]) => ({ team, pts, matches: teamMatches[team] ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  const topTeam = teamRanking[0];

  return (
    <div>
      {/* Global records */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.06em", marginBottom: 4 }}>
          🏆 RÉCORDS DE LA POLLA
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Rachas consecutivas en partidos finalizados
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <StreakCard
            icon="⭐"
            title="Mayor racha de marcadores exactos"
            unit="exactos seguidos"
            records={topExact}
            color="var(--gold)"
            matchMap={matchMap}
            codeMap={codeMap}
            showMatches
          />
          <StreakCard
            icon="✅"
            title="Mayor racha de exactos o correctos"
            unit="picks seguidos"
            records={topGood}
            color="var(--green)"
            matchMap={matchMap}
            codeMap={codeMap}
            showMatches
          />
          <StreakCard
            icon="❌"
            title="Mayor racha de fallados"
            unit="ceros seguidos"
            records={topZero}
            color="var(--red)"
            matchMap={matchMap}
            codeMap={codeMap}
          />
        </div>
      </div>

      {/* Personal stats */}
      <div>
        <h2 style={{ fontSize: 18, color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.06em", marginBottom: 4 }}>
          📈 TUS STATS
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Equipos que más puntos te han dado en tus apuestas
        </p>
        {!topTeam ? (
          <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
            Aún no tienes apuestas finalizadas con puntos.
          </div>
        ) : (
          <div className="card-gold" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
              🥇 Top equipo
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <TeamFlag team={topTeam.team} size={56} />
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: "var(--gold)", letterSpacing: "0.04em", lineHeight: 1 }}>
                  {codeMap[topTeam.team] ?? topTeam.team.slice(0, 3).toUpperCase()}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{topTeam.team}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: "var(--gold)", lineHeight: 1 }}>
                  {topTeam.pts}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  pts en {topTeam.matches} partido{topTeam.matches !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {teamRanking.length > 1 && (
              <>
                <div className="divider" />
                <div style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                  Resto del ranking
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {teamRanking.slice(1, 8).map((t, i) => (
                    <div key={t.team} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "var(--surface2)", borderRadius: "var(--radius-sm)" }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 2}</span>
                      <TeamFlag team={t.team} size={20} />
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: "var(--text)", letterSpacing: "0.04em", width: 50 }}>
                        {codeMap[t.team] ?? t.team.slice(0, 3).toUpperCase()}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: "var(--text-muted)" }}>{t.team}</span>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)" }}>{t.pts}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>pts</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StreakCard({ icon, title, unit, records, color, matchMap, codeMap, showMatches }: {
  icon: string;
  title: string;
  unit: string;
  records: StreakRecord[];
  color: string;
  matchMap: Record<string, Match>;
  codeMap: Record<string, string>;
  showMatches?: boolean;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
      </div>
      {records.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
          Aún no hay racha registrada
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: color, lineHeight: 1, marginBottom: 6 }}>
            {records[0].count} <span style={{ fontSize: 14, color: "var(--text-muted)", letterSpacing: "0.04em" }}>{unit}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: showMatches ? 10 : 0 }}>
            🥇 {records.map(r => r.displayName).join(" · ")}
            {records.length > 1 && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>(empate)</span>}
          </div>

          {showMatches && records.map((rec, ri) => {
            const items = rec.picks.map(p => ({ pick: p, match: matchMap[p.matchId] })).filter(x => !!x.match);
            if (items.length === 0) return null;
            return (
              <div key={rec.uid} style={{ marginTop: ri > 0 ? 10 : 0, paddingTop: ri > 0 ? 8 : 0, borderTop: ri > 0 ? "1px solid var(--border)" : "none" }}>
                {records.length > 1 && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{rec.displayName}:</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {items.map(({ pick, match: m }) => (
                    <div key={m.id} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 8px",
                      background: "var(--surface2)",
                      borderRadius: 4,
                      fontSize: 12,
                    }}>
                      <TeamFlag team={m.homeTeam} size={16} />
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.04em", color: "var(--text)" }}>
                        {codeMap[m.homeTeam] ?? m.homeTeam.slice(0, 3).toUpperCase()}
                      </span>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", color: color, minWidth: 32, textAlign: "center" }}>
                        {m.homeScore}–{m.awayScore}
                      </span>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.04em", color: "var(--text)" }}>
                        {codeMap[m.awayTeam] ?? m.awayTeam.slice(0, 3).toUpperCase()}
                      </span>
                      <TeamFlag team={m.awayTeam} size={16} />
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
                        (<span style={{ color: color, fontWeight: 600 }}>{pick.points ?? 0}</span> pt{(pick.points ?? 0) !== 1 ? "s" : ""})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
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
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 20 },
  filterRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  filterBtn: { padding: "6px 12px", borderRadius: 20, fontSize: 13, fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" },
};
