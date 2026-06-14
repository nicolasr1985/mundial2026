// app/admin/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isDeadlinePassed } from "@/lib/scoring";
import { WC2026_TEAMS, WC2026_SCORERS, formatScorer } from "@/lib/wc2026-data";
import { useAuth } from "@/lib/auth-context";
import {
  getMatches, createMatch, updateMatchResult, lockMatch, resetMatch, getAllPicks, updateUserProfile, setUserPaid,
  setGroupStanding, setTournamentResult, getTournamentSettings, getAllUsers, getRanking,
  sendUserPasswordReset, deleteUserData, toggleUserAdmin, Match, Timestamp, UserProfile, RankingEntry
} from "@/lib/firebase";

const ROUNDS = [
  "Ronda de 32", "Octavos de Final", "Cuartos de Final", "Semifinal", "Tercer Puesto", "Final",
];

const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [fetching, setFetching] = useState(true);
  const [activeTab, setActiveTab] = useState<"matches" | "results" | "groups" | "special" | "whatsapp" | "usuarios" | "export">("matches");
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
      <div style={{ ...s.tabs, overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch", flexWrap: "nowrap", maxWidth: "100vw" } as React.CSSProperties}>
        {([
          { id: "matches", label: "➕ Crear Partidos" },
          { id: "results", label: "✏ Ingresar Resultados" },
          { id: "groups", label: "🏅 Clasificación Grupos" },
          { id: "special", label: "🏆 Campeón / Goleador" },
          { id: "whatsapp", label: "📱 WhatsApp" },
          { id: "export", label: "📊 Exportar" },
          { id: "usuarios", label: "👥 Usuarios" },
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
      {activeTab === "usuarios" && <UsuariosTab users={users} onUpdated={loadData} />}
      {activeTab === "export" && <ExportTab matches={matches} users={users} />}
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, alignItems: "start" }}>
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
  const [cards, setCards] = useState<Record<string, { homeY: string; awayY: string; homeR: string; awayR: string }>>({});
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
      await updateMatchResult(match.id, parseInt(homeVal), parseInt(awayVal), {
        homeYellow: parseInt(cards[match.id]?.homeY || "0") || 0,
        awayYellow: parseInt(cards[match.id]?.awayY || "0") || 0,
        homeRed: parseInt(cards[match.id]?.homeR || "0") || 0,
        awayRed: parseInt(cards[match.id]?.awayR || "0") || 0,
      });
      setMsgs((m) => ({ ...m, [match.id]: "✅ Resultado guardado + puntos recalculados" }));
      onUpdated();
    } catch { setMsgs((m) => ({ ...m, [match.id]: "❌ Error" })); }
    finally { setSaving(null); setTimeout(() => setMsgs((m) => { const n = { ...m }; delete n[match.id]; return n; }), 4000); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
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
            if (!cards[match.id]) {
              cards[match.id] = {
                homeY: String(match.homeYellow ?? 0),
                awayY: String(match.awayYellow ?? 0),
                homeR: String(match.homeRed ?? 0),
                awayR: String(match.awayRed ?? 0),
              };
            }
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
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
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

                  {/* Cards inputs - only show for group stage */}
                  {match.round.startsWith("Fase de Grupos") && (
                    <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
                      {/* Home team cards */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "4px 8px", background: "var(--surface2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 10, color: "var(--gold)", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>{match.homeTeam}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 11 }}>🟨</span>
                          <input type="number" min={0} max={20} placeholder="0"
                            value={cards[match.id]?.homeY ?? "0"}
                            onChange={(e) => setCards(p => ({ ...p, [match.id]: { ...p[match.id], homeY: e.target.value } }))}
                            style={{ width: 32, fontSize: 12, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", padding: "3px 4px" }}
                          />
                          <span style={{ fontSize: 11 }}>🟥</span>
                          <input type="number" min={0} max={20} placeholder="0"
                            value={cards[match.id]?.homeR ?? "0"}
                            onChange={(e) => setCards(p => ({ ...p, [match.id]: { ...p[match.id], homeR: e.target.value } }))}
                            style={{ width: 32, fontSize: 12, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", padding: "3px 4px" }}
                          />
                        </div>
                      </div>
                      {/* Away team cards */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "4px 8px", background: "var(--surface2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 10, color: "var(--gold)", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>{match.awayTeam}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 11 }}>🟨</span>
                          <input type="number" min={0} max={20} placeholder="0"
                            value={cards[match.id]?.awayY ?? "0"}
                            onChange={(e) => setCards(p => ({ ...p, [match.id]: { ...p[match.id], awayY: e.target.value } }))}
                            style={{ width: 32, fontSize: 12, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", padding: "3px 4px" }}
                          />
                          <span style={{ fontSize: 11 }}>🟥</span>
                          <input type="number" min={0} max={20} placeholder="0"
                            value={cards[match.id]?.awayR ?? "0"}
                            onChange={(e) => setCards(p => ({ ...p, [match.id]: { ...p[match.id], awayR: e.target.value } }))}
                            style={{ width: 32, fontSize: 12, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", padding: "3px 4px" }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
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
              <select className="input" value={champion} onChange={(e) => setChampion(e.target.value)} style={{ cursor: "pointer" }}>
                <option value="">— Selecciona el campeón —</option>
                {WC2026_TEAMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">⚽ Goleador del Torneo (+10 pts a quien acertó)</label>
              <select className="input" value={topScorer} onChange={(e) => setTopScorer(e.target.value)} style={{ cursor: "pointer" }}>
                <option value="">— Selecciona el goleador —</option>
                {WC2026_SCORERS.map((s, i) => (
                  <option key={i} value={formatScorer(s)}>{formatScorer(s)}</option>
                ))}
              </select>
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
              🔒 Visible solo después del pitazo inicial (Jun 11, 2pm)
            </span>
          )}
        </div>

        {!deadlinePassed ? (
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏰</div>
            <p>Los picks de los participantes serán visibles aquí cuando empiece el primer partido del Mundial.</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Junio 11, 2026 — 2:00 pm (hora Bogotá)</p>
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

// ─── WHATSAPP TAB ─────────────────────────────────────────────────────────────
function WhatsAppTab({ matches, users, settings }: {
  matches: Match[];
  users: UserProfile[];
  settings: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"today" | "general">("today");
  const [rankedUsers, setRankedUsers] = useState<{ pos: number; name: string; pts: number }[]>([]);
  const [dailyPts, setDailyPts] = useState<{ name: string; pts: number }[]>([]);

  const finishedMatches = matches.filter(m => m.status === "finished" && m.homeScore !== null);
  const nowBogota = new Date(Date.now() - 5 * 3600 * 1000);
  const todayStr = nowBogota.toISOString().slice(0, 10);
  const todayMatches = finishedMatches.filter(m => {
    if (!m.matchDate?.toDate) return false;
    const d = m.matchDate.toDate();
    const bogota = new Date(d.getTime() - 5 * 3600 * 1000);
    return bogota.toISOString().slice(0, 10) === todayStr;
  });

  useEffect(() => {
    getRanking().then((ranking) => {
      const tieKey = (e: RankingEntry) => `${e.totalPoints}-${e.exactCount}-${e.resultCount ?? 0}-${e.partialCount ?? 0}`;
      const firstIndex: Record<string, number> = {};
      ranking.forEach((e, i) => { const k = tieKey(e); if (!(k in firstIndex)) firstIndex[k] = i; });
      const result = ranking.map((e) => ({
        pos: firstIndex[tieKey(e)] + 1,
        name: e.displayName || e.uid,
        pts: e.totalPoints,
      }));
      setRankedUsers(result);
    }).catch(() => {});
  }, [users]);

  useEffect(() => {
    if (todayMatches.length === 0) { setDailyPts([]); return; }
    const todayMatchIds = new Set(todayMatches.map(m => m.id));
    getAllPicks().then((allPicks) => {
      const ptsByUser: Record<string, number> = {};
      for (const u of users) { ptsByUser[u.uid] = 0; }
      for (const p of allPicks) {
        if (todayMatchIds.has(p.matchId) && p.points != null && ptsByUser[p.userId] !== undefined) {
          ptsByUser[p.userId] += p.points;
        }
      }
      const sorted = users
        .map(u => ({ name: u.displayName || u.uid, pts: ptsByUser[u.uid] ?? 0 }))
        .sort((a, b) => b.pts - a.pts);
      setDailyPts(sorted);
    }).catch(() => {});
  }, [users, todayMatches.length]);

  // ── scoring helpers ──────────────────────────────────────────────
  function calcMatchPts(ph: number, pa: number, rh: number, ra: number): number {
    let pts = 0;
    if (ph === rh && pa === ra) pts += 5;
    else {
      const pr = ph > pa ? "H" : ph < pa ? "A" : "D";
      const rr = rh > ra ? "H" : rh < ra ? "A" : "D";
      if (pr === rr) pts += 2;
    }
    if (ph === rh) pts += 1;
    if (pa === ra) pts += 1;
    return pts;
  }

  const nonAdminUsers = users.filter(u => !u.isAdmin);

  // Date header
  const dateHeader = nowBogota.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const dateHeaderCap = dateHeader.charAt(0).toUpperCase() + dateHeader.slice(1);

  // ── Generate message ─────────────────────────────────────────────
  function generateMessage(): string {
    const lines: string[] = [];

    if (mode === "today") {
      lines.push(`⚽ *POLLA MUNDIAL 2026*`);
      lines.push(`📅 *Resultados del día — ${dateHeaderCap}*`);
      lines.push("");

      if (todayMatches.length === 0) {
        lines.push("_No hubo partidos hoy_");
        lines.push("");
        return lines.join("\n");
      }

      lines.push(`*Partidos de hoy:*`);
      todayMatches.forEach(m => {
        lines.push(`• ${m.homeTeam} ${m.homeScore}–${m.awayScore} ${m.awayTeam}`);
      });
      lines.push("");
      lines.push("━━━━━━━━━━━━━━━━━");
      lines.push("*Puntos del día:*");

      if (dailyPts.length > 0) {
        dailyPts.forEach(u => {
          lines.push(`• ${u.name}: *+${u.pts} pts*`);
        });
      } else {
        lines.push("_Calculando..._");
      }

      lines.push("");
      lines.push("🔗 http://mundial2026-kappa.vercel.app");

    } else if (mode === "general") {
      lines.push(`⚽ *POLLA MUNDIAL 2026*`);
      lines.push(`🏆 *Tabla General — ${dateHeaderCap}*`);
      lines.push("");

      if (rankedUsers.length > 0) {
        const medals = ["🥇","🥈","🥉"];
        rankedUsers.forEach((u) => {
          const prefix = medals[u.pos - 1] ?? `${u.pos}.`;
          lines.push(`${prefix} ${u.name} — *${u.pts} pts*`);
        });
      } else {
        lines.push("_Posiciones actualizadas:_");
      }

      lines.push("");
      lines.push("🔗 *Ver tabla completa:*");
      lines.push("http://mundial2026-kappa.vercel.app/dashboard");
      lines.push("");
      lines.push("_Ingresa para ver tu posición y puntos 👆_");
    }

    lines.push("");
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
          { id: "today", label: "📅 Resultados del día" },
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
                .replace(/\n/g, "<br/>")
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

// ─── USUARIOS TAB ─────────────────────────────────────────────────────────────
function UsuariosTab({ users, onUpdated }: { users: UserProfile[]; onUpdated: () => void }) {
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  const setMsg = (uid: string, msg: string) => {
    setMsgs(prev => ({ ...prev, [uid]: msg }));
    setTimeout(() => setMsgs(prev => { const n = { ...prev }; delete n[uid]; return n; }), 5000);
  };

  const handleReset = async (u: UserProfile) => {
    setLoading(u.uid);
    try {
      await sendUserPasswordReset(u.email);
      setMsg(u.uid, "✅ Email de recuperación enviado a " + u.email);
    } catch (e) {
      setMsg(u.uid, "❌ Error: " + String(e));
    } finally { setLoading(null); }
  };

  const handleDelete = async (uid: string) => {
    setLoading(uid);
    setConfirmDelete(null);
    try {
      await deleteUserData(uid);
      setMsg(uid, "✅ Usuario eliminado");
      onUpdated();
    } catch (e) {
      setMsg(uid, "❌ Error: " + String(e));
    } finally { setLoading(null); }
  };

  const handleToggleAdmin = async (u: UserProfile) => {
    setLoading(u.uid);
    try {
      await toggleUserAdmin(u.uid, u.isAdmin);
      setMsg(u.uid, u.isAdmin ? "✅ Ya no es admin" : "✅ Ahora es admin");
      onUpdated();
    } catch (e) {
      setMsg(u.uid, "❌ Error: " + String(e));
    } finally { setLoading(null); }
  };

  const handleRename = async (u: UserProfile) => {
    if (!nameInput.trim() || nameInput.trim() === u.displayName) { setEditingName(null); return; }
    setLoading(u.uid);
    try {
      await updateUserProfile(u.uid, { displayName: nameInput.trim() });
      setMsg(u.uid, "✅ Nombre actualizado");
      setEditingName(null);
      onUpdated();
    } catch (e) {
      setMsg(u.uid, "❌ Error: " + String(e));
    } finally { setLoading(null); }
  };

  const handleTogglePaid = async (u: UserProfile) => {
    setLoading(u.uid);
    try {
      await setUserPaid(u.uid, !u.hasPaid);
      setMsg(u.uid, !u.hasPaid ? "✅ Pago registrado" : "✅ Pago removido");
      onUpdated();
    } catch (e) {
      setMsg(u.uid, "❌ Error: " + String(e));
    } finally { setLoading(null); }
  };

  const filtered = users.filter(u =>
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const admins = filtered.filter(u => u.isAdmin);
  const regulars = filtered.filter(u => !u.isAdmin);

  const UserRow = ({ u }: { u: UserProfile }) => (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: u.isAdmin ? "rgba(201,168,76,0.2)" : "var(--surface2)",
        border: `2px solid ${u.isAdmin ? "var(--gold)" : "var(--border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
      }}>
        {u.isAdmin ? "⚙" : "👤"}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {editingName === u.uid ? (
            <>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(u); if (e.key === "Escape") setEditingName(null); }}
                style={{ background: "var(--surface2)", border: "1px solid var(--border-gold)", borderRadius: "var(--radius-sm)", padding: "4px 8px", fontSize: 13, color: "var(--text)", outline: "none", width: 140 }}
                autoFocus
              />
              <button onClick={() => handleRename(u)} disabled={loading === u.uid} style={{ fontSize: 11, padding: "3px 8px", background: "var(--gold)", color: "#000", border: "none", borderRadius: 4, cursor: "pointer" }}>✓</button>
              <button onClick={() => setEditingName(null)} style={{ fontSize: 11, padding: "3px 8px", background: "var(--surface2)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>✕</button>
            </>
          ) : (
            <>
              {u.displayName}
              <button onClick={() => { setEditingName(u.uid); setNameInput(u.displayName); }} style={{ fontSize: 10, padding: "2px 6px", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}>✏</button>
            </>
          )}
          {u.isAdmin && (
            <span className="badge badge-gold" style={{ fontSize: 10 }}>Admin</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{u.email}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 10 }}>
          {u.champion && <span>🏆 {u.champion}</span>}
          {u.topScorer && <span>⚽ {u.topScorer}</span>}
          {!u.champion && !u.topScorer && <span style={{ opacity: 0.5 }}>Sin predicciones especiales</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
        {/* Pago */}
        <button
          onClick={() => handleTogglePaid(u)}
          disabled={loading === u.uid}
          style={{
            fontSize: 12, padding: "6px 10px", borderRadius: "var(--radius-sm)", cursor: "pointer",
            border: u.hasPaid ? "1px solid rgba(46,204,113,0.4)" : "1px solid var(--border)",
            background: u.hasPaid ? "rgba(46,204,113,0.12)" : "var(--surface2)",
            color: u.hasPaid ? "var(--green)" : "var(--text-muted)",
            fontWeight: 600,
          }}
          title={u.hasPaid ? "Marcar como no pagado" : "Marcar como pagado"}
        >
          {u.hasPaid ? "💰 Pagó ✓" : "💰 Sin pago"}
        </button>

        {/* Reset password */}
        <button
          className="btn-ghost"
          onClick={() => handleReset(u)}
          disabled={loading === u.uid}
          style={{ fontSize: 12, padding: "6px 10px" }}
          title="Enviar email de recuperación de contraseña"
        >
          🔑 Reset clave
        </button>

        {/* Toggle admin */}
        <button
          className="btn-ghost"
          onClick={() => handleToggleAdmin(u)}
          disabled={loading === u.uid}
          style={{ fontSize: 12, padding: "6px 10px", color: u.isAdmin ? "var(--red)" : "var(--text-muted)" }}
          title={u.isAdmin ? "Quitar permisos de admin" : "Dar permisos de admin"}
        >
          {u.isAdmin ? "⬇ Quitar admin" : "⬆ Hacer admin"}
        </button>

        {/* Delete */}
        {confirmDelete === u.uid ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--red)" }}>¿Seguro?</span>
            <button
              className="btn-danger"
              onClick={() => handleDelete(u.uid)}
              disabled={loading === u.uid}
              style={{ fontSize: 12, padding: "6px 10px" }}
            >
              Sí, eliminar
            </button>
            <button
              className="btn-ghost"
              onClick={() => setConfirmDelete(null)}
              style={{ fontSize: 12, padding: "6px 10px" }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            className="btn-ghost"
            onClick={() => setConfirmDelete(u.uid)}
            disabled={loading === u.uid}
            style={{ fontSize: 12, padding: "6px 10px", color: "var(--red)" }}
            title="Eliminar usuario y todos sus picks"
          >
            🗑 Eliminar
          </button>
        )}
      </div>

      {/* Status message */}
      {msgs[u.uid] && (
        <div style={{ width: "100%", fontSize: 12, marginTop: 4,
          color: msgs[u.uid].startsWith("✅") ? "var(--green)" : "var(--red)" }}>
          {msgs[u.uid]}
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Header stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="card" style={{ padding: "12px 20px", textAlign: "center", flex: "0 0 auto" }}>
          <div style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: "var(--gold)" }}>{users.length}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Total</div>
        </div>
        <div className="card" style={{ padding: "12px 20px", textAlign: "center", flex: "0 0 auto" }}>
          <div style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: "var(--text)" }}>{users.filter(u => !u.isAdmin).length}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Participantes</div>
        </div>
        <div className="card" style={{ padding: "12px 20px", textAlign: "center", flex: "0 0 auto" }}>
          <div style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: "var(--gold)" }}>{users.filter(u => u.champion).length}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" }}>Con pred. especial</div>
        </div>
      </div>

      {/* Search */}
      <input
        className="input"
        placeholder="🔍 Buscar por nombre o email..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }}
      />

      {/* Note about delete */}
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, padding: "8px 12px",
        background: "rgba(231,76,60,0.05)", border: "1px solid rgba(231,76,60,0.2)", borderRadius: "var(--radius-sm)" }}>
        ⚠ Eliminar un usuario borrará su cuenta y <strong>todas sus apuestas</strong> permanentemente.
        El reset de clave enviará un email de recuperación a la dirección registrada.
      </div>

      {/* Admins */}
      {admins.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "var(--gold)", fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", marginBottom: 8 }}>
            Administradores ({admins.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {admins.map(u => <UserRow key={u.uid} u={u} />)}
          </div>
        </div>
      )}

      {/* Regular users */}
      <div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", marginBottom: 8 }}>
          Participantes ({regulars.length})
        </div>
        {regulars.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
            {search ? "No hay usuarios que coincidan con la búsqueda" : "No hay participantes registrados"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {regulars.map(u => <UserRow key={u.uid} u={u} />)}
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


// ─── EXPORT TAB ───────────────────────────────────────────────────────────────
function ExportTab({ matches, users }: { matches: Match[]; users: UserProfile[] }) {
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState("");

  const exportToCSV = async () => {
    setExporting(true);
    setMsg("");
    try {
      const allPicksSnap = await getAllPicks();

      // Build rows: one per user per match
      const rows: string[][] = [];
      const header = ["Partido", "Fecha", "Local", "Visitante", "Usuario", "Pick Local", "Pick Visitante", "Resultado", "Puntos"];
      rows.push(header);

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      // Filter matches played today or before
      const relevantMatches = matches.filter((m) => {
        const d = m.matchDate?.toDate?.();
        return d && d <= today;
      }).sort((a, b) => (a.matchDate?.toDate?.()?.getTime() ?? 0) - (b.matchDate?.toDate?.()?.getTime() ?? 0));

      for (const match of relevantMatches) {
        const matchPicks = allPicksSnap.filter((p) => p.matchId === match.id);
        const dateStr = match.matchDate?.toDate?.()?.toLocaleString("es-CO", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        }) ?? "";
        const result = match.homeScore !== null && match.awayScore !== null
          ? `${match.homeScore}-${match.awayScore}` : "";

        const allParticipants = users;
        for (const u of allParticipants) {
          const pick = matchPicks.find((p) => p.userId === u.uid);
          rows.push([
            `${match.homeTeam} vs ${match.awayTeam}`,
            dateStr,
            match.homeTeam,
            match.awayTeam,
            u.displayName,
            pick ? String(pick.homeScore) : "",
            pick ? String(pick.awayScore) : "",
            result,
            pick?.points !== null && pick?.points !== undefined ? String(pick.points) : "",
          ]);
        }
      }

      // Convert to CSV
      const csv = rows.map((r) =>
        r.map((cell) => `"${String(cell).replace(/"/g, '\"')}"`)
          .join(",")
      ).join("\n");

      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `picks_${todayStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("✅ Exportado");
    } catch {
      setMsg("❌ Error al exportar");
    } finally {
      setExporting(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const today = new Date();
  const matchesToday = matches.filter((m) => {
    const d = m.matchDate?.toDate?.();
    if (!d) return false;
    return d.toDateString() === today.toDateString();
  });

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, marginBottom: 8, color: "var(--text)" }}>📊 Exportar apuestas a CSV</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Exporta todas las apuestas de partidos jugados hasta hoy. Abre el archivo con Excel o Google Sheets.
        </p>
        {matchesToday.length > 0 && (
          <div style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(201,168,76,0.06)", border: "1px solid var(--border-gold)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-muted)" }}>
            📅 Hoy hay <strong style={{ color: "var(--gold)" }}>{matchesToday.length} partido(s)</strong>:{" "}
            {matchesToday.map((m) => `${m.homeTeam} vs ${m.awayTeam}`).join(", ")}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="btn-primary"
            onClick={exportToCSV}
            disabled={exporting}
            style={{ padding: "10px 24px" }}
          >
            {exporting ? "Exportando..." : "📥 Descargar CSV"}
          </button>
          {msg && <span style={{ fontSize: 13, color: msg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
        </div>
      </div>
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
