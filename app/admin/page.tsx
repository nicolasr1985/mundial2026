// app/admin/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isDeadlinePassed } from "@/lib/scoring";
import { useAuth } from "@/lib/auth-context";
import {
  getMatches, createMatch, updateMatchResult, lockMatch, resetMatch,
  setGroupStanding, setTournamentResult, getTournamentSettings, getAllUsers,
  Match, Timestamp, UserProfile
} from "@/lib/firebase";

const ROUNDS = [
  "Fase de Grupos - Grupo A", "Fase de Grupos - Grupo B", "Fase de Grupos - Grupo C",
  "Fase de Grupos - Grupo D", "Fase de Grupos - Grupo E", "Fase de Grupos - Grupo F",
  "Fase de Grupos - Grupo G", "Fase de Grupos - Grupo H", "Fase de Grupos - Grupo I",
  "Fase de Grupos - Grupo J", "Fase de Grupos - Grupo K", "Fase de Grupos - Grupo L",
  "Octavos de Final", "Cuartos de Final", "Semifinal", "Tercer Puesto", "Final",
];

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [fetching, setFetching] = useState(true);
  const [activeTab, setActiveTab] = useState<"matches" | "results" | "groups" | "special" | "whatsapp">("matches");
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading) {
      if (!user) { router.push("/login"); return; }
      if (!profile?.isAdmin) { router.push("/dashboard"); return; }
    }
  }, [user, profile, loading, router]);

  const [users, setUsers] = useState<UserProfile[]>([]);

  const loadData = useCallback(async () => {
    const [m, s, u] = await Promise.all([getMatches(), getTournamentSettings(), getAllUsers()]);
    setMatches(m);
    setSettings(s as Record<string, string>);
    setUsers(u);
    setFetching(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading || fetching) return <Loading />;
  if (!profile?.isAdmin) return null;

  return (
    <div className="page-wide animate-fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 36 }}><span className="gold-text">⚙ ADMIN</span></h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>Panel de administrador · Polla Mundial 2026</p>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {([
          { id: "matches", label: "➕ Crear Partidos" },
          { id: "results", label: "✏ Ingresar Resultados" },
          { id: "groups", label: "🏅 Clasificación Grupos" },
          { id: "special", label: "🏆 Campeón / Goleador" },
          { id: "whatsapp", label: "📱 WhatsApp" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              ...s.tab,
              background: activeTab === t.id ? "rgba(201,168,76,0.15)" : "transparent",
              color: activeTab === t.id ? "var(--gold)" : "var(--text-muted)",
              borderBottom: `2px solid ${activeTab === t.id ? "var(--gold)" : "transparent"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "matches" && <CreateMatchTab onCreated={loadData} />}
      {activeTab === "results" && <ResultsTab matches={matches} onUpdated={loadData} />}
      {activeTab === "groups" && <GroupsTab matches={matches} onUpdated={loadData} />}
      {activeTab === "special" && <SpecialTab settings={settings} users={users} onUpdated={loadData} />}
      {activeTab === "whatsapp" && <WhatsAppTab matches={matches} users={users} settings={settings} />}
    </div>
  );
}

// ─── CREATE MATCH TAB ─────────────────────────────────────────────────────────
function CreateMatchTab({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ homeTeam: "", awayTeam: "", matchDate: "", round: ROUNDS[0] });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.homeTeam || !form.awayTeam || !form.matchDate) {
      setMsg("⚠ Completa todos los campos"); return;
    }
    setSaving(true);
    try {
      const group = form.round.startsWith("Fase de Grupos - Grupo ") ? form.round.replace("Fase de Grupos - Grupo ", "") : undefined;
      await createMatch({
        homeTeam: form.homeTeam.trim(),
        awayTeam: form.awayTeam.trim(),
        matchDate: Timestamp.fromDate(new Date(form.matchDate)),
        round: form.round,
        group,
        homeScore: null,
        awayScore: null,
        status: "upcoming",
        locked: false,
      });
      setMsg("✅ Partido creado");
      setForm((f) => ({ ...f, homeTeam: "", awayTeam: "", matchDate: "" }));
      onCreated();
    } catch { setMsg("❌ Error al crear"); }
    finally { setSaving(false); setTimeout(() => setMsg(""), 3000); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
      <div className="card-gold">
        <h2 style={{ fontSize: 20, marginBottom: 20 }}>Nuevo Partido</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="label">Ronda</label>
            <select className="input" value={form.round} onChange={(e) => set("round", e.target.value)}>
              {ROUNDS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="label">Equipo Local</label>
              <input className="input" placeholder="Ej: Brasil" value={form.homeTeam} onChange={(e) => set("homeTeam", e.target.value)} />
            </div>
            <div>
              <label className="label">Equipo Visitante</label>
              <input className="input" placeholder="Ej: Argentina" value={form.awayTeam} onChange={(e) => set("awayTeam", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Fecha y Hora</label>
            <input className="input" type="datetime-local" value={form.matchDate} onChange={(e) => set("matchDate", e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
            <button className="btn-primary" onClick={handleSubmit} disabled={saving} style={{ padding: "11px 24px" }}>
              {saving ? "Creando..." : "Crear Partido"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: 16, color: "var(--text-dim)", marginBottom: 10 }}>
          💡 Consejos
        </h3>
        <div className="card" style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 2 }}>
          <p>• Crea los partidos <strong style={{ color: "var(--text)" }}>antes de cada jornada</strong></p>
          <p>• El partido se cierra automáticamente cuando lo <strong style={{ color: "var(--text)" }}>bloqueas</strong> desde la pestaña de Resultados</p>
          <p>• Los grupos van de la <strong style={{ color: "var(--text)" }}>A a la L</strong> (48 equipos, 12 grupos)</p>
          <p>• Para el Mundial 2026 hay <strong style={{ color: "var(--text)" }}>104 partidos</strong> en total</p>
          <p>• Los puntos se calculan <strong style={{ color: "var(--text)" }}>automáticamente</strong> al ingresar el resultado</p>
        </div>
      </div>
    </div>
  );
}

// ─── RESULTS TAB ──────────────────────────────────────────────────────────────
function ResultsTab({ matches, onUpdated }: { matches: Match[]; onUpdated: () => void }) {
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"upcoming" | "live" | "finished">("upcoming");

  const filtered = matches.filter((m) => m.status === filter).slice(0, 50);

  const handleLock = async (matchId: string) => {
    await lockMatch(matchId);
    setMsgs((m) => ({ ...m, [matchId]: "🔒 Bloqueado" }));
    setTimeout(() => { onUpdated(); setMsgs((m) => { const n = { ...m }; delete n[matchId]; return n; }); }, 1500);
  };

  const handleResult = async (match: Match) => {
    const sc = scores[match.id];
    const homeVal = sc?.home ?? "";
    const awayVal = sc?.away ?? "";
    const bothBlank = homeVal === "" && awayVal === "";
    const bothFilled = homeVal !== "" && awayVal !== "";

    // Both blank on a finished match = reset to upcoming
    if (bothBlank && match.status === "finished") {
      if (!window.confirm(`¿Seguro que quieres eliminar el resultado de ${match.homeTeam} vs ${match.awayTeam}? El partido volverá a "Próximos" y se reabrirán las apuestas.`)) return;
      setSaving(match.id);
      try {
        await resetMatch(match.id);
        setMsgs((m) => ({ ...m, [match.id]: "↩ Resultado eliminado — partido vuelve a Próximos" }));
        onUpdated();
      } catch { setMsgs((m) => ({ ...m, [match.id]: "❌ Error" })); }
      finally { setSaving(null); setTimeout(() => setMsgs((m) => { const n = { ...m }; delete n[match.id]; return n; }), 4000); }
      return;
    }

    if (!bothFilled) {
      setMsgs((m) => ({ ...m, [match.id]: "⚠ Ingresa ambos marcadores (o déjalos en blanco para eliminar el resultado)" }));
      return;
    }

    setSaving(match.id);
    try {
      await updateMatchResult(match.id, parseInt(homeVal), parseInt(awayVal));
      setMsgs((m) => ({ ...m, [match.id]: "✅ Resultado guardado + puntos recalculados" }));
      onUpdated();
    } catch { setMsgs((m) => ({ ...m, [match.id]: "❌ Error" })); }
    finally { setSaving(null); setTimeout(() => setMsgs((m) => { const n = { ...m }; delete n[match.id]; return n; }), 4000); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["upcoming", "live", "finished"] as const).map((f) => {
          const c = matches.filter((m) => m.status === f).length;
          const labels = { upcoming: "Próximos", live: "🔴 En Juego", finished: "Finalizados" };
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "7px 14px", borderRadius: "var(--radius-sm)", fontSize: 13, cursor: "pointer",
              fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, transition: "all 0.15s",
              background: filter === f ? "rgba(201,168,76,0.15)" : "var(--surface2)",
              color: filter === f ? "var(--gold)" : "var(--text-muted)",
              border: `1px solid ${filter === f ? "var(--border-gold)" : "var(--border)"}`,
            }}>
              {labels[f]} ({c})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          No hay partidos en esta categoría
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((match) => {
            const isFinished = match.status === "finished";
            const sc = scores[match.id] || {
              home: match.homeScore !== null ? String(match.homeScore) : "",
              away: match.awayScore !== null ? String(match.awayScore) : "",
            };
            const hasChanged = isFinished && (
              sc.home !== String(match.homeScore) || sc.away !== String(match.awayScore)
            );
            const bothBlank = sc.home === "" && sc.away === "";
            const canSave = (sc.home !== "" && sc.away !== "") || (isFinished && bothBlank);

            return (
              <div key={match.id} style={{
                background: "var(--surface)",
                border: `1px solid ${hasChanged ? "rgba(231,76,60,0.4)" : isFinished ? "rgba(201,168,76,0.2)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)", padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                transition: "border-color 0.2s",
              }}>
                {/* Match info */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    {match.homeTeam} vs {match.awayTeam}
                    {isFinished && (
                      <span style={{ fontSize: 10, fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
                        background: hasChanged ? "rgba(231,76,60,0.15)" : "rgba(201,168,76,0.12)",
                        color: hasChanged ? "var(--red)" : "var(--gold)",
                        border: `1px solid ${hasChanged ? "rgba(231,76,60,0.3)" : "var(--border-gold)"}`,
                        borderRadius: 4, padding: "2px 7px", letterSpacing: "0.06em",
                      }}>
                        {hasChanged ? "✏ MODIFICANDO" : `✓ ${match.homeScore}–${match.awayScore}`}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {match.round} · {match.matchDate?.toDate?.()?.toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) ?? ""}
                  </div>
                </div>

                {/* Lock button for non-finished */}
                {!isFinished && (
                  <button className="btn-ghost" onClick={() => handleLock(match.id)}
                    style={{ fontSize: 12, padding: "6px 12px" }}>
                    🔒 Cerrar apuestas
                  </button>
                )}

                {/* Score inputs */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <input
                    className="score-input"
                    type="number" min={0} max={20}
                    placeholder="0"
                    value={sc.home}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || (/^\d+$/.test(v) && parseInt(v) >= 0 && parseInt(v) <= 20))
                        setScores((prev) => ({ ...prev, [match.id]: { ...prev[match.id], home: v } }));
                    }}
                    onKeyDown={(e) => { if (["-","e","E","+","."].includes(e.key)) e.preventDefault(); }}
                    style={{ width: 48, borderColor: hasChanged ? "rgba(231,76,60,0.5)" : undefined }}
                  />
                  <span style={{ color: "var(--text-muted)", fontFamily: "'Bebas Neue',sans-serif" }}>–</span>
                  <input
                    className="score-input"
                    type="number" min={0} max={20}
                    placeholder="0"
                    value={sc.away}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || (/^\d+$/.test(v) && parseInt(v) >= 0 && parseInt(v) <= 20))
                        setScores((prev) => ({ ...prev, [match.id]: { ...prev[match.id], away: v } }));
                    }}
                    onKeyDown={(e) => { if (["-","e","E","+","."].includes(e.key)) e.preventDefault(); }}
                    style={{ width: 48, borderColor: hasChanged ? "rgba(231,76,60,0.5)" : undefined }}
                  />
                  <button
                    className={isFinished && bothBlank ? "btn-danger" : hasChanged ? "btn-danger" : "btn-primary"}
                    onClick={() => handleResult(match)}
                    disabled={saving === match.id || !canSave}
                    style={{ fontSize: 13, padding: "8px 14px", opacity: !canSave ? 0.4 : 1 }}
                  >
                    {saving === match.id ? "..." : isFinished && bothBlank ? "↩ Eliminar resultado" : isFinished ? (hasChanged ? "⚠ Corregir" : "✏ Editar") : "✓ Guardar"}
                  </button>

                  {/* Undo button when modified */}
                  {hasChanged && (
                    <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }}
                      onClick={() => setScores((prev) => ({
                        ...prev,
                        [match.id]: { home: String(match.homeScore ?? ""), away: String(match.awayScore ?? "") }
                      }))}>
                      ↩ Deshacer
                    </button>
                  )}
                </div>

                {msgs[match.id] && (
                  <div style={{ width: "100%", fontSize: 12, marginTop: 4,
                    color: msgs[match.id].startsWith("✅") ? "var(--green)" : "var(--red)" }}>
                    {msgs[match.id]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── GROUPS TAB ───────────────────────────────────────────────────────────────
function GroupsTab({ matches, onUpdated }: { matches: Match[]; onUpdated: () => void }) {
  const [group, setGroup] = useState("A");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [thirds, setThirds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const groupMatches = matches.filter((m) => m.group === group);
  const teams = Array.from(new Set(groupMatches.flatMap((m) => [m.homeTeam, m.awayTeam])));

  const handleSave = async () => {
    if (!first || !second) { setMsg("⚠ Elige 1° y 2° lugar"); return; }
    setSaving(true);
    try {
      await setGroupStanding({ group, firstPlace: first, secondPlace: second, thirdPlaces: thirds });
      setMsg("✅ Clasificación guardada + puntos calculados");
      onUpdated();
    } catch { setMsg("❌ Error"); }
    finally { setSaving(false); setTimeout(() => setMsg(""), 4000); }
  };

  const toggleThird = (team: string) => {
    setThirds((prev) => prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]);
  };

  return (
    <div style={{ maxWidth: 540 }}>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        Cuando termine la fase de grupos, registra aquí la clasificación oficial para calcular puntos.
      </p>

      <div className="card-gold">
        <div style={{ marginBottom: 16 }}>
          <label className="label">Grupo</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {GROUPS.map((g) => (
              <button key={g} onClick={() => setGroup(g)} style={{
                width: 36, height: 36, borderRadius: 6,
                fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, cursor: "pointer", border: "none",
                background: group === g ? "var(--gold)" : "var(--surface2)",
                color: group === g ? "var(--black)" : "var(--text-muted)",
                transition: "all 0.15s",
              }}>{g}</button>
            ))}
          </div>
        </div>

        {teams.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No hay partidos creados para el Grupo {group}</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label className="label">🥇 1° Clasificado</label>
                <select className="input" value={first} onChange={(e) => setFirst(e.target.value)}>
                  <option value="">—</option>
                  {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">🥈 2° Clasificado</label>
                <select className="input" value={second} onChange={(e) => setSecond(e.target.value)}>
                  <option value="">—</option>
                  {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label">🥉 3eros que pasan (selecciona los que avancen)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {teams.map((t) => (
                  <button key={t} onClick={() => toggleThird(t)} style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                    fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
                    background: thirds.includes(t) ? "rgba(201,168,76,0.2)" : "var(--surface2)",
                    color: thirds.includes(t) ? "var(--gold)" : "var(--text-muted)",
                    border: `1px solid ${thirds.includes(t) ? "var(--border-gold)" : "var(--border)"}`,
                    transition: "all 0.15s",
                  }}>{t}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: "10px 22px" }}>
                {saving ? "Guardando..." : "Guardar clasificación"}
              </button>
              {msg && <span style={{ fontSize: 13, color: msg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SPECIAL TAB ──────────────────────────────────────────────────────────────
function SpecialTab({ settings, users, onUpdated }: {
  settings: Record<string, string>;
  users: UserProfile[];
  onUpdated: () => void;
}) {
  const [champion, setChampion] = useState(settings.champion || "");
  const [topScorer, setTopScorer] = useState(settings.topScorer || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const deadlinePassed = isDeadlinePassed();

  useEffect(() => {
    setChampion(settings.champion || "");
    setTopScorer(settings.topScorer || "");
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (champion) await setTournamentResult("champion", champion);
      if (topScorer) await setTournamentResult("topScorer", topScorer);
      setMsg("✅ Guardado — puntos asignados automáticamente");
      onUpdated();
    } catch { setMsg("❌ Error"); }
    finally { setSaving(false); setTimeout(() => setMsg(""), 4000); }
  };

  // Only show user picks after deadline has passed
  const nonAdminUsers = users.filter(u => !u.isAdmin);

  return (
    <div>
      {/* Official result entry */}
      <div style={{ maxWidth: 480, marginBottom: 32 }}>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
          Al guardar estos resultados, el sistema calculará automáticamente los puntos especiales de todos los participantes.
        </p>
        <div className="card-gold">
          <h2 style={{ fontSize: 18, marginBottom: 20 }}>Resultados Finales</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="label">🏆 Campeón del Mundial (+15 pts a quien acertó)</label>
              <input className="input" placeholder="Ej: Brasil" value={champion} onChange={(e) => setChampion(e.target.value)} />
            </div>
            <div>
              <label className="label">⚽ Goleador del Torneo (+10 pts a quien acertó)</label>
              <input className="input" placeholder="Ej: Mbappé" value={topScorer} onChange={(e) => setTopScorer(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: "11px 24px" }}>
                {saving ? "Guardando..." : "Guardar y calcular puntos"}
              </button>
              {msg && <span style={{ fontSize: 13, color: msg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* User picks table — only visible after deadline */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, color: "var(--text)" }}>📋 Picks de los Participantes</h2>
          {!deadlinePassed && (
            <span className="badge badge-red" style={{ fontSize: 11 }}>
              🔒 Visible solo después del pitazo inicial (Jun 11, 3pm)
            </span>
          )}
        </div>

        {!deadlinePassed ? (
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏰</div>
            <p>Los picks de los participantes serán visibles aquí cuando empiece el primer partido del Mundial.</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Junio 11, 2026 — 3:00 pm (hora Bogotá)</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Participante", "🥇 Campeón", "⚽ Goleador"].map((h) => (
                      <th key={h} style={{
                        padding: "12px 16px", fontSize: 11, color: "var(--text-muted)",
                        textAlign: "left", fontFamily: "'Rajdhani',sans-serif",
                        fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nonAdminUsers.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No hay participantes registrados</td></tr>
                  ) : nonAdminUsers.map((u) => {
                    const champCorrect = settings.champion && u.champion === settings.champion;
                    const scorerCorrect = settings.topScorer && u.topScorer === settings.topScorer;
                    return (
                      <tr key={u.uid} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: 14 }}>
                          {u.displayName}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 14 }}>
                          {u.champion ? (
                            <span style={{ color: champCorrect ? "var(--green)" : "var(--text)" }}>
                              {champCorrect ? "✅ " : ""}{u.champion}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>N/A</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 14 }}>
                          {u.topScorer ? (
                            <span style={{ color: scorerCorrect ? "var(--green)" : "var(--text)" }}>
                              {scorerCorrect ? "✅ " : ""}{u.topScorer}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>N/A</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FIFA RANKINGS TAB ───────────────────────────────────────────────────────
const WC2026_TEAMS = new Set([
  "Argentina","France","England","Belgium","Portugal","Brazil","Netherlands",
  "Spain","Germany","Colombia","Uruguay","Mexico","United States",
  "Japan","Morocco","Senegal","Croatia","Switzerland","Ecuador","Australia",
  "South Korea","Czechia","Tunisia","Norway","Sweden","Algeria","Austria",
  "Jordan","Saudi Arabia","Iraq","Uzbekistan","Ivory Coast","Ghana","Panama",
  "Haiti","Scotland","South Africa","Canada","Bosnia and Herzegovina",
  "Cape Verde","New Zealand","Curacao","Congo DR","Qatar","Turkey",
  "Egypt","Paraguay","Italy",
]);

interface FifaRankEntry { rank: number; name: string; code: string; points: number; }

function FifaRankingsTab() {
  const [rankings, setRankings] = useState<FifaRankEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const [filter, setFilter] = useState<"all" | "wc2026">("wc2026");

  const fetchRankings = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/fifa-rankings");
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setRankings(data.rankings || []);
      setUpdated(data.updated || "");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const displayed = filter === "wc2026"
    ? rankings.filter((r) => WC2026_TEAMS.has(r.name))
    : rankings;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn-primary" onClick={fetchRankings} disabled={loading} style={{ padding: "10px 20px" }}>
          {loading ? "Cargando..." : "🔄 Actualizar desde football-ranking.com"}
        </button>
        {updated && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Actualizado: {updated}</span>}
        {error && <span style={{ fontSize: 12, color: "var(--red)" }}>❌ {error}</span>}
      </div>

      {rankings.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["wc2026", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "6px 14px", borderRadius: "var(--radius-sm)", fontSize: 12, cursor: "pointer",
                background: filter === f ? "rgba(201,168,76,0.15)" : "var(--surface2)",
                color: filter === f ? "var(--gold)" : "var(--text-muted)",
                border: `1px solid ${filter === f ? "var(--border-gold)" : "var(--border)"}`,
                fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
              }}>
                {f === "wc2026" ? `⚽ Solo WC 2026 (${rankings.filter(r => WC2026_TEAMS.has(r.name)).length})` : `🌍 Todos (${rankings.length})`}
              </button>
            ))}
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Rank", "País", "Código", "Puntos FIFA"].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-muted)",
                        textAlign: h === "País" ? "left" : "center",
                        fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, letterSpacing: "0.06em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((r, i) => (
                    <tr key={r.rank} style={{
                      borderBottom: "1px solid var(--border)",
                      background: WC2026_TEAMS.has(r.name) ? "rgba(201,168,76,0.03)" : "transparent",
                    }}>
                      <td style={{ padding: "10px 12px", textAlign: "center",
                        fontFamily: "'Bebas Neue',sans-serif", fontSize: 18,
                        color: r.rank <= 10 ? "var(--gold)" : "var(--text)" }}>
                        {r.rank}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "left", fontSize: 14, fontWeight: WC2026_TEAMS.has(r.name) ? 600 : 400 }}>
                        {r.name}
                        {WC2026_TEAMS.has(r.name) && (
                          <span style={{ marginLeft: 6, fontSize: 10, background: "rgba(201,168,76,0.15)",
                            color: "var(--gold)", border: "1px solid var(--border-gold)",
                            borderRadius: 3, padding: "1px 5px" }}>WC26</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 12,
                        color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {r.code}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 14,
                        fontWeight: 600, color: "var(--text-dim)" }}>
                        {r.points.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && rankings.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🌍</div>
          <p>Haz clic en "Actualizar" para cargar el ranking FIFA desde football-ranking.com</p>
          <p style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>Los datos se cachean por 24 horas en el servidor</p>
        </div>
      )}
    </div>
  );
}

// ─── WHATSAPP TAB ─────────────────────────────────────────────────────────────
function WhatsAppTab({ matches, users, settings }: {
  matches: Match[];
  users: UserProfile[];
  settings: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"today" | "general" | "matchday">("today");

  // ── scoring helpers ──────────────────────────────────────────────
  function calcMatchPts(ph: number, pa: number, rh: number, ra: number): number {
    let pts = 0;
    if (ph === rh && pa === ra) pts += 5;
    else {
      const pr = ph > pa ? "H" : ph < pa ? "A" : "D";
      const rr = rh > ra ? "H" : rh < ra ? "A" : "D";
      if (pr === rr) pts += 3;
    }
    if (ph === rh) pts += 1;
    if (pa === ra) pts += 1;
    return pts;
  }

  // ── build ranking from picks stored in user profiles via getRanking ──
  // We use what's available: matches + users
  // For simplicity we compute from match results only (not group picks / special)
  // since we have matches and can cross-reference picks via getAllPicks
  // Instead we use the users array which has champion/topScorer
  // and rely on existing pick points stored per pick document
  // We'll use a simpler approach: compute from match data that is already loaded

  const finishedMatches = matches.filter(m => m.status === "finished" && m.homeScore !== null);

  // Today's finished matches (Bogotá UTC-5)
  const nowBogota = new Date(Date.now() - 5 * 3600 * 1000);
  const todayStr = nowBogota.toISOString().slice(0, 10);
  const todayMatches = finishedMatches.filter(m => {
    if (!m.matchDate?.toDate) return false;
    const d = m.matchDate.toDate();
    const bogota = new Date(d.getTime() - 5 * 3600 * 1000);
    return bogota.toISOString().slice(0, 10) === todayStr;
  });

  const nonAdminUsers = users.filter(u => !u.isAdmin);

  // Date header
  const dateHeader = nowBogota.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const dateHeaderCap = dateHeader.charAt(0).toUpperCase() + dateHeader.slice(1);

  // ── Generate message ─────────────────────────────────────────────
  function generateMessage(): string {
    const lines: string[] = [];

    if (mode === "today") {
      lines.push(`⚽ *POLLA MUNDIAL 2026*`);
      lines.push(`📅 ${dateHeaderCap}`);
      lines.push("");

      if (todayMatches.length === 0) {
        lines.push("_No hubo partidos hoy_");
        return lines.join("\n");
      }

      lines.push(`*Resultados de hoy (${todayMatches.length} partido${todayMatches.length !== 1 ? "s" : ""}):*`);
      todayMatches.forEach(m => {
        lines.push(`• ${m.homeTeam} ${m.homeScore}–${m.awayScore} ${m.awayTeam}`);
      });
      lines.push("");
      lines.push("━━━━━━━━━━━━━━━━━");
      lines.push("*Puntos de hoy:*");
      lines.push("_Actualiza la app para ver tus puntos_");
      lines.push("");
      lines.push("🔗 mundial2026-kappa.vercel.app");

    } else if (mode === "general") {
      lines.push(`⚽ *POLLA MUNDIAL 2026*`);
      lines.push(`🏆 *Tabla General — ${dateHeaderCap}*`);
      lines.push("");
      lines.push("_Posiciones actualizadas:_");
      lines.push("");

      // We don't have total points per user here without getAllPicks,
      // so we show a prompt to check the app
      lines.push("🔗 *Ver tabla completa:*");
      lines.push("mundial2026-kappa.vercel.app/dashboard");
      lines.push("");
      lines.push("_Ingresa para ver tu posición y puntos 👆_");

    } else if (mode === "matchday") {
      // Show all today's matches with results
      lines.push(`⚽ *POLLA MUNDIAL 2026*`);
      lines.push(`📅 *Jornada del ${dateHeaderCap}*`);
      lines.push("");

      if (todayMatches.length === 0) {
        lines.push("_No hay partidos finalizados hoy todavía_");
      } else {
        lines.push("*📊 Resultados:*");
        todayMatches.forEach((m, i) => {
          const hScore = m.homeScore ?? 0;
          const aScore = m.awayScore ?? 0;
          const winner = hScore > aScore ? m.homeTeam : hScore < aScore ? m.awayTeam : "Empate";
          const emoji = hScore > aScore ? "🟢" : hScore < aScore ? "🔴" : "🟡";
          lines.push(`${emoji} ${m.homeTeam} *${hScore}–${aScore}* ${m.awayTeam}`);
        });
        lines.push("");
        lines.push("━━━━━━━━━━━━━━━━━");
        lines.push("👉 ¿Acertaste? Revisa tus puntos:");
        lines.push("mundial2026-kappa.vercel.app");
      }
    }

    lines.push("");
    lines.push("_No apto para sensibles_ 🔥");
    return lines.join("\n");
  }

  const message = generateMessage();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = message;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        Genera el mensaje para tu grupo de WhatsApp. Cópialo con un click y pégalo en el grupo.
      </p>

      {/* Mode selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {([
          { id: "matchday", label: "📊 Resultados del día" },
          { id: "today", label: "⚡ Resumen corto" },
          { id: "general", label: "🏆 Tabla general" },
        ] as const).map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding: "8px 14px", borderRadius: "var(--radius-sm)", fontSize: 13, cursor: "pointer",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
            background: mode === m.id ? "rgba(201,168,76,0.15)" : "var(--surface2)",
            color: mode === m.id ? "var(--gold)" : "var(--text-muted)",
            border: `1px solid ${mode === m.id ? "var(--border-gold)" : "var(--border)"}`,
          }}>{m.label}</button>
        ))}
      </div>

      {/* Message preview */}
      <div style={{ position: "relative" }}>
        <div style={{
          background: "#0B141A",
          borderRadius: 12,
          padding: "20px 20px 60px",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          lineHeight: 1.6,
          color: "#E9EDEF",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          border: "1px solid #1F2C34",
          minHeight: 200,
        }}>
          {/* WhatsApp-style header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #1F2C34" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚽</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Polla Mundial 2026</div>
              <div style={{ fontSize: 12, color: "#8696A0" }}>Vista previa del mensaje</div>
            </div>
          </div>

          {/* Message bubble */}
          <div style={{
            background: "#202C33",
            borderRadius: "0 8px 8px 8px",
            padding: "10px 14px",
            maxWidth: "85%",
            position: "relative",
          }}>
            <div dangerouslySetInnerHTML={{
              __html: message
                .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
                .replace(/_(.*?)_/g, "<em>$1</em>")
                .replace(/━/g, "━")
                .replace(/
/g, "<br/>")
            }} />
            <div style={{ fontSize: 11, color: "#8696A0", textAlign: "right", marginTop: 6 }}>
              {new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          style={{
            position: "absolute", bottom: 16, right: 16,
            background: copied ? "#25D366" : "#25D366",
            color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 20px", fontSize: 14, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            transition: "all 0.2s",
            boxShadow: "0 2px 12px rgba(37,211,102,0.3)",
          }}
        >
          {copied ? "✅ ¡Copiado!" : "📋 Copiar mensaje"}
        </button>
      </div>

      {/* Raw text (fallback) */}
      <details style={{ marginTop: 16 }}>
        <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>Ver texto plano</summary>
        <textarea
          readOnly
          value={message}
          style={{
            width: "100%", marginTop: 8, padding: 12,
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", color: "var(--text)",
            fontSize: 12, fontFamily: "monospace", resize: "vertical",
            minHeight: 160,
          }}
        />
      </details>

      {/* Today's match info for context */}
      {todayMatches.length > 0 && (
        <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.2)", borderRadius: "var(--radius-sm)", fontSize: 13 }}>
          <strong style={{ color: "var(--green)" }}>✓ {todayMatches.length} partido{todayMatches.length !== 1 ? "s" : ""} finalizado{todayMatches.length !== 1 ? "s" : ""} hoy</strong>
          <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
            {todayMatches.map(m => `${m.homeTeam} ${m.homeScore}–${m.awayScore} ${m.awayTeam}`).join(" · ")}
          </div>
        </div>
      )}
      {todayMatches.length === 0 && (
        <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(201,168,76,0.06)", border: "1px solid var(--border-gold)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-muted)" }}>
          ⚠ No hay partidos finalizados hoy. El mensaje se generará sin resultados.
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
  tabs: { display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 24, overflowX: "auto" },
  tab: {
    padding: "11px 16px", fontSize: 13, cursor: "pointer",
    fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
    letterSpacing: "0.04em", whiteSpace: "nowrap",
    transition: "all 0.15s", border: "none",
  },
};

