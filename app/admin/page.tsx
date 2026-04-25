// app/admin/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getMatches, createMatch, updateMatchResult, lockMatch,
  setGroupStanding, setTournamentResult, getTournamentSettings,
  Match, Timestamp
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
  const [activeTab, setActiveTab] = useState<"matches" | "results" | "groups" | "special">("matches");
  const [settings, setSettings] = useState<Record<string, string>>({});

  const ADMIN_UIDS = ["QO7IJzE6BmcP9JpNEk51U9EH41s1"];
  useEffect(() => {
    if (!loading && !user) { router.push("/login"); return; }
    if (!loading && user && !ADMIN_UIDS.includes(user.uid) && !profile?.isAdmin) {
      router.push("/dashboard"); return;
    }
  }, [user, profile, loading]);

  const loadData = useCallback(async () => {
    const [m, s] = await Promise.all([getMatches(), getTournamentSettings()]);
    setMatches(m);
    setSettings(s as Record<string, string>);
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
      {activeTab === "special" && <SpecialTab settings={settings} onUpdated={loadData} />}
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
    if (!sc || sc.home === "" || sc.away === "") {
      setMsgs((m) => ({ ...m, [match.id]: "⚠ Ingresa el marcador" })); return;
    }
    setSaving(match.id);
    try {
      await updateMatchResult(match.id, parseInt(sc.home), parseInt(sc.away));
      setMsgs((m) => ({ ...m, [match.id]: "✅ Resultado guardado + puntos calculados" }));
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
            const sc = scores[match.id] || { home: match.homeScore !== null ? String(match.homeScore) : "", away: match.awayScore !== null ? String(match.awayScore) : "" };
            return (
              <div key={match.id} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{match.homeTeam} vs {match.awayTeam}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {match.round} · {match.matchDate?.toDate?.()?.toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) ?? ""}
                  </div>
                </div>

                {match.status !== "finished" && (
                  <button className="btn-ghost" onClick={() => handleLock(match.id)}
                    style={{ fontSize: 12, padding: "6px 12px" }}>
                    🔒 Cerrar apuestas
                  </button>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <input
                    className="score-input"
                    type="number" min={0} max={30}
                    placeholder={match.homeScore !== null ? String(match.homeScore) : "0"}
                    value={sc.home}
                    onChange={(e) => setScores((prev) => ({ ...prev, [match.id]: { ...prev[match.id], home: e.target.value } }))}
                    style={{ width: 48 }}
                  />
                  <span style={{ color: "var(--text-muted)", fontFamily: "'Bebas Neue',sans-serif" }}>–</span>
                  <input
                    className="score-input"
                    type="number" min={0} max={30}
                    placeholder={match.awayScore !== null ? String(match.awayScore) : "0"}
                    value={sc.away}
                    onChange={(e) => setScores((prev) => ({ ...prev, [match.id]: { ...prev[match.id], away: e.target.value } }))}
                    style={{ width: 48 }}
                  />
                  <button className="btn-primary" onClick={() => handleResult(match)} disabled={saving === match.id}
                    style={{ fontSize: 13, padding: "8px 14px" }}>
                    {saving === match.id ? "..." : match.status === "finished" ? "✏ Corregir" : "✓ Guardar"}
                  </button>
                </div>

                {msgs[match.id] && (
                  <div style={{ width: "100%", fontSize: 12, color: msgs[match.id].startsWith("✅") ? "var(--green)" : "var(--red)", marginTop: 4 }}>
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
function SpecialTab({ settings, onUpdated }: { settings: Record<string, string>; onUpdated: () => void }) {
  const [champion, setChampion] = useState(settings.champion || "");
  const [topScorer, setTopScorer] = useState(settings.topScorer || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

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

  return (
    <div style={{ maxWidth: 480 }}>
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
