// app/picks/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getMatches, getUserPicks, submitPick, submitGroupPick, getUserGroupPicks, Match, Pick, GroupPick } from "@/lib/firebase";

const ROUNDS = [
  "Fase de Grupos",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinal",
  "Tercer Puesto",
  "Final",
];

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export default function PicksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [groupPicks, setGroupPicks] = useState<Record<string, GroupPick>>({});
  const [activeRound, setActiveRound] = useState("Fase de Grupos");
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({});

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [m, p, gp] = await Promise.all([
      getMatches(),
      getUserPicks(user.uid),
      getUserGroupPicks(user.uid),
    ]);
    setMatches(m);
    const picksMap: Record<string, Pick> = {};
    const scoresInit: Record<string, { home: string; away: string }> = {};
    p.forEach((pk) => {
      picksMap[pk.matchId] = pk;
      scoresInit[pk.matchId] = { home: String(pk.homeScore), away: String(pk.awayScore) };
    });
    setPicks(picksMap);
    setScores(scoresInit);
    const gpMap: Record<string, GroupPick> = {};
    gp.forEach((gp) => { gpMap[gp.group] = gp; });
    setGroupPicks(gpMap);
    setFetching(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmitPick = async (matchId: string) => {
    if (!user) return;
    const sc = scores[matchId];
    const homeVal = sc?.home ?? "";
    const awayVal = sc?.away ?? "";
    const homeNum = parseInt(homeVal);
    const awayNum = parseInt(awayVal);
    if (homeVal === "" || awayVal === "") {
      setMsgs((m) => ({ ...m, [matchId]: "⚠ Ingresa ambos marcadores" }));
      return;
    }
    if (isNaN(homeNum) || isNaN(awayNum)) {
      setMsgs((m) => ({ ...m, [matchId]: "⚠ Solo se permiten números" }));
      return;
    }
    if (homeNum < 0 || homeNum > 20 || awayNum < 0 || awayNum > 20) {
      setMsgs((m) => ({ ...m, [matchId]: "⚠ Marcador debe ser entre 0 y 20" }));
      return;
    }
    setSaving(matchId);
    try {
      await submitPick(user.uid, matchId, homeNum, awayNum);
      setPicks((prev) => ({
        ...prev,
        [matchId]: { ...prev[matchId], homeScore: parseInt(sc.home), awayScore: parseInt(sc.away), matchId, userId: user.uid, id: matchId, createdAt: prev[matchId]?.createdAt, points: undefined },
      }));
      setMsgs((m) => ({ ...m, [matchId]: "✅ Guardado" }));
    } catch {
      setMsgs((m) => ({ ...m, [matchId]: "🔒 Partido cerrado" }));
    } finally {
      setSaving(null);
      setTimeout(() => setMsgs((m) => { const n = { ...m }; delete n[matchId]; return n; }), 3000);
    }
  };

  const roundMatches = matches.filter((m) =>
    activeRound === "Fase de Grupos"
      ? m.round.startsWith("Fase de Grupos")
      : m.round === activeRound
  );

  const groupedByGroup = activeRound === "Fase de Grupos"
    ? roundMatches.reduce((acc, m) => {
        const g = m.group || "?";
        if (!acc[g]) acc[g] = [];
        acc[g].push(m);
        return acc;
      }, {} as Record<string, Match[]>)
    : null;

  if (loading || fetching) return <Loading />;

  return (
    <div className="page animate-fade-up">
      <div style={s.header}>
        <div>
          <h1 style={{ fontSize: 36 }}><span className="gold-text">APUESTAS</span></h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
            Haz tus predicciones antes de cada partido
          </p>
        </div>
      </div>

      {/* Round tabs */}
      <div style={s.tabs}>
        {ROUNDS.map((r) => {
          const count = matches.filter((m) =>
            r === "Fase de Grupos" ? m.round.startsWith("Fase de Grupos") : m.round === r
          ).length;
          return (
            <button
              key={r}
              onClick={() => setActiveRound(r)}
              style={{
                ...s.tab,
                background: activeRound === r ? "rgba(201,168,76,0.15)" : "transparent",
                color: activeRound === r ? "var(--gold)" : "var(--text-muted)",
                borderBottom: activeRound === r ? "2px solid var(--gold)" : "2px solid transparent",
              }}
            >
              {r.replace("Fase de Grupos", "Grupos").replace(" de Final", "")}
              {count > 0 && (
                <span style={s.tabBadge}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {roundMatches.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          <p>No hay partidos en esta ronda aún.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>El administrador los agregará pronto.</p>
        </div>
      ) : (
        <>
          {/* Group standings picks (only in group stage) */}
          {activeRound === "Fase de Grupos" && groupedByGroup && (
            <div style={{ marginBottom: 24 }}>
              {Object.entries(groupedByGroup)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([group, gMatches]) => (
                  <GroupSection
                    key={group}
                    group={group}
                    matches={gMatches}
                    picks={picks}
                    groupPick={groupPicks[group]}
                    scores={scores}
                    saving={saving}
                    msgs={msgs}
                    onScoreChange={(matchId, side, val) =>
                      setScores((prev) => ({ ...prev, [matchId]: { ...prev[matchId], [side]: val } }))
                    }
                    onSubmit={handleSubmitPick}
                    onSubmitGroup={async (first, second, third) => {
                      if (!user) return;
                      await submitGroupPick(user.uid, group, first, second, third);
                      setGroupPicks((prev) => ({ ...prev, [group]: { ...prev[group], group, firstPlace: first, secondPlace: second, thirdPlace: third, userId: user.uid, id: group } }));
                    }}
                    teams={Array.from(new Set(gMatches.flatMap((m) => [m.homeTeam, m.awayTeam])))}
                  />
                ))}
            </div>
          )}

          {/* Non-group matches */}
          {activeRound !== "Fase de Grupos" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {roundMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  pick={picks[match.id]}
                  score={scores[match.id] || { home: "", away: "" }}
                  saving={saving === match.id}
                  msg={msgs[match.id]}
                  onScoreChange={(side, val) =>
                    setScores((prev) => ({ ...prev, [match.id]: { ...prev[match.id], [side]: val } }))
                  }
                  onSubmit={() => handleSubmitPick(match.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── GROUP SECTION ────────────────────────────────────────────────────────────
function GroupSection({ group, matches, picks, groupPick, scores, saving, msgs, onScoreChange, onSubmit, onSubmitGroup, teams }: {
  group: string; matches: Match[]; picks: Record<string, Pick>; groupPick?: GroupPick;
  scores: Record<string, { home: string; away: string }>; saving: string | null;
  msgs: Record<string, string>; onScoreChange: (matchId: string, side: "home" | "away", val: string) => void;
  onSubmit: (matchId: string) => void;
  onSubmitGroup: (first: string, second: string, third: string) => Promise<void>;
  teams: string[];
}) {
  const [first, setFirst] = useState(groupPick?.firstPlace || "");
  const [second, setSecond] = useState(groupPick?.secondPlace || "");
  const [third, setThird] = useState(groupPick?.thirdPlace || "");
  const [gpSaving, setGpSaving] = useState(false);
  const [gpMsg, setGpMsg] = useState("");

  useEffect(() => {
    if (groupPick) {
      setFirst(groupPick.firstPlace || "");
      setSecond(groupPick.secondPlace || "");
      setThird(groupPick.thirdPlace || "");
    }
  }, [groupPick]);

  const handleSaveGroup = async () => {
    if (!first || !second) { setGpMsg("⚠ Elige 1° y 2° lugar"); return; }
    setGpSaving(true);
    try {
      await onSubmitGroup(first, second, third);
      setGpMsg("✅ Guardado");
    } catch { setGpMsg("❌ Error"); }
    finally { setGpSaving(false); setTimeout(() => setGpMsg(""), 3000); }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={s.groupHeader}>
        <span style={s.groupLabel}>GRUPO {group}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{matches.length} partidos</span>
      </div>

      {/* Matches */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            pick={picks[match.id]}
            score={scores[match.id] || { home: "", away: "" }}
            saving={saving === match.id}
            msg={msgs[match.id]}
            onScoreChange={(side, val) => onScoreChange(match.id, side, val)}
            onSubmit={() => onSubmit(match.id)}
            compact
          />
        ))}
      </div>

      {/* Group standing prediction */}
      <div style={s.groupPredBox}>
        <div style={{ fontSize: 12, color: "var(--gold)", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10 }}>
          CLASIFICACIÓN DEL GRUPO (1 pt cada uno)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "🥇 1° lugar", val: first, set: setFirst },
            { label: "🥈 2° lugar", val: second, set: setSecond },
            { label: "🥉 3° que pasa", val: third, set: setThird },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className="label" style={{ fontSize: 10 }}>{label}</label>
              <select className="input" value={val} onChange={(e) => set(e.target.value)} style={{ fontSize: 13 }}>
                <option value="">—</option>
                {teams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button className="btn-ghost" onClick={handleSaveGroup} disabled={gpSaving} style={{ fontSize: 13, padding: "7px 16px" }}>
            {gpSaving ? "Guardando..." : "Guardar clasificación"}
          </button>
          {gpMsg && <span style={{ fontSize: 12, color: gpMsg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>{gpMsg}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── MATCH CARD ───────────────────────────────────────────────────────────────
function MatchCard({ match, pick, score, saving, msg, onScoreChange, onSubmit, compact }: {
  match: Match; pick?: Pick; score: { home: string; away: string };
  saving: boolean; msg?: string; onScoreChange: (side: "home" | "away", val: string) => void;
  onSubmit: () => void; compact?: boolean;
}) {
  const locked = match.locked;
  const finished = match.status === "finished";
  const hasResult = match.homeScore !== null && match.awayScore !== null;
  const hasPick = !!pick;

  const dateStr = match.matchDate?.toDate
    ? match.matchDate.toDate().toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${locked ? "var(--border)" : hasPick ? "rgba(201,168,76,0.3)" : "var(--border)"}`,
      borderRadius: "var(--radius-sm)",
      padding: compact ? "12px 14px" : "16px 20px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    }}>
      {/* Status */}
      <div style={{ width: compact ? 6 : 8, height: compact ? 6 : 8, borderRadius: "50%", flexShrink: 0,
        background: match.status === "live" ? "var(--green)" : match.status === "finished" ? "var(--text-muted)" : "var(--gold)",
        boxShadow: match.status === "live" ? "0 0 8px var(--green)" : "none",
      }} />

      {/* Teams + result */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: compact ? 13 : 15 }}>{match.homeTeam}</span>
          {hasResult ? (
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: compact ? 16 : 20, color: "var(--gold)", padding: "0 4px" }}>
              {match.homeScore} – {match.awayScore}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>vs</span>
          )}
          <span style={{ fontWeight: 600, fontSize: compact ? 13 : 15 }}>{match.awayTeam}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{dateStr}</div>
      </div>

      {/* Pick input or result */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {locked ? (
          hasPick ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Tu pick:</span>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--text)" }}>
                {pick.homeScore} – {pick.awayScore}
              </span>
              {pick.points !== null && pick.points !== undefined && (
                <span className="badge badge-gold" style={{ fontSize: 11 }}>{pick.points} pts</span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>🔒 Sin apuesta</span>
          )
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              className="score-input"
              type="number"
              min={0}
              max={20}
              placeholder="–"
              value={score.home}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || (/^\d+$/.test(v) && parseInt(v) >= 0 && parseInt(v) <= 20)) {
                  onScoreChange("home", v);
                }
              }}
              onKeyDown={(e) => { if (["-","e","E","+","."].includes(e.key)) e.preventDefault(); }}
              style={{ width: compact ? 44 : 52, fontSize: compact ? 16 : 20,
                borderColor: score.home === "" ? "rgba(231,76,60,0.4)" : "var(--border)" }}
            />
            <span style={{ color: "var(--text-muted)", fontFamily: "'Bebas Neue',sans-serif" }}>–</span>
            <input
              className="score-input"
              type="number"
              min={0}
              max={20}
              placeholder="–"
              value={score.away}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || (/^\d+$/.test(v) && parseInt(v) >= 0 && parseInt(v) <= 20)) {
                  onScoreChange("away", v);
                }
              }}
              onKeyDown={(e) => { if (["-","e","E","+","."].includes(e.key)) e.preventDefault(); }}
              style={{ width: compact ? 44 : 52, fontSize: compact ? 16 : 20,
                borderColor: score.away === "" ? "rgba(231,76,60,0.4)" : "var(--border)" }}
            />
            <button
              className="btn-primary"
              onClick={onSubmit}
              disabled={saving || score.home === "" || score.away === ""}
              style={{ padding: compact ? "7px 12px" : "9px 16px", fontSize: 13,
                opacity: (score.home === "" || score.away === "") ? 0.35 : 1 }}
            >
              {saving ? "..." : hasPick ? "✏" : "✓"}
            </button>
            {msg && (
              <span style={{ fontSize: 12, color: msg.startsWith("✅") ? "var(--green)" : msg.startsWith("🔒") ? "var(--text-muted)" : "var(--red)" }}>
                {msg}
              </span>
            )}
          </div>
        )}
      </div>
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
  header: { marginBottom: 20 },
  tabs: {
    display: "flex", gap: 0, borderBottom: "1px solid var(--border)",
    marginBottom: 24, overflowX: "auto",
  },
  tab: {
    padding: "10px 14px", fontSize: 13, cursor: "pointer",
    fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
    letterSpacing: "0.04em", whiteSpace: "nowrap",
    display: "flex", alignItems: "center", gap: 6,
    transition: "all 0.15s", border: "none",
  },
  tabBadge: {
    background: "var(--surface3)", color: "var(--text-muted)",
    borderRadius: 10, fontSize: 10, padding: "1px 6px",
  },
  groupHeader: {
    display: "flex", alignItems: "center", gap: 10,
    marginBottom: 8,
  },
  groupLabel: {
    fontFamily: "'Bebas Neue',sans-serif", fontSize: 18,
    color: "var(--gold)", letterSpacing: "0.08em",
  },
  groupPredBox: {
    background: "rgba(201,168,76,0.04)",
    border: "1px solid var(--border-gold)",
    borderRadius: "var(--radius-sm)",
    padding: "12px 14px",
  },
};
