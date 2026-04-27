// app/dashboard/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getRanking, getTournamentSettings, updateChampionPick, RankingEntry } from "@/lib/firebase";
import { WC2026_TEAMS, WC2026_SCORERS, formatScorer } from "@/lib/wc2026-data";
import { isDeadlinePassed, formatDeadline } from "@/lib/scoring";

export default function DashboardPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(true);
  const [champion, setChampion] = useState("");
  const [topScorer, setTopScorer] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const deadlinePassed = isDeadlinePassed();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [r, s] = await Promise.all([getRanking(), getTournamentSettings()]);
        setRanking(r);
        setSettings(s as Record<string, string>);
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

  useEffect(() => {
    if (profile) {
      setChampion(profile.champion || "");
      setTopScorer(profile.topScorer || "");
    }
  }, [profile]);

  const handleSavePicks = async () => {
    if (!user || deadlinePassed) return;
    setSaving(true);
    setMsg("");
    try {
      await updateChampionPick(user.uid, champion, topScorer);
      setMsg("✅ Predicciones guardadas");
      setIsEditing(false);
    } catch {
      setMsg("❌ Error al guardar");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const myPosition = ranking.findIndex((r) => r.uid === user?.uid) + 1;
  const myEntry = ranking.find((r) => r.uid === user?.uid);

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

      {/* Predicciones especiales */}
      <div className="card-gold" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, color: "var(--text)" }}>🏆 Predicciones Especiales</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {deadlinePassed
                ? "🔒 Cerradas — pitazo inicial del Mundial"
                : `⏰ Fecha límite: ${formatDeadline()} (pitazo inicial)`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span className="badge badge-gold">Campeón = 15 pts</span>
            <span className="badge badge-gold">Goleador = 10 pts</span>
          </div>
        </div>

        {/* Already submitted — show read-only confirmation unless editing */}
        {(champion || topScorer) && !isEditing ? (
          <div style={{ background: "rgba(46,204,113,0.08)", border: "1px solid rgba(46,204,113,0.25)", borderRadius: "var(--radius-sm)", padding: "16px 20px" }}>
            <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 600, marginBottom: 12 }}>
              ✅ Predicciones registradas {deadlinePassed ? "— ya no se pueden modificar" : "— puedes cambiarlas antes del pitazo"}
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>🥇 CAMPEÓN</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--gold)" }}>{champion || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>⚽ GOLEADOR</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--gold)" }}>{topScorer || "—"}</div>
              </div>
            </div>
            {!deadlinePassed && (
              <button
                className="btn-ghost"
                style={{ marginTop: 12, fontSize: 12, padding: "6px 14px" }}
                onClick={() => setIsEditing(true)}
              >
                ✏ Modificar predicciones
              </button>
            )}
          </div>
        ) : deadlinePassed ? (
          <div style={{ background: "rgba(231,76,60,0.08)", border: "1px solid rgba(231,76,60,0.2)", borderRadius: "var(--radius-sm)", padding: "16px 20px", color: "var(--text-muted)", fontSize: 14 }}>
            🔒 No enviaste predicciones especiales antes del pitazo. No acumularás puntos de campeón/goleador.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="label">🥇 Campeón del Mundial</label>
                <select
                  className="input"
                  value={champion}
                  onChange={(e) => setChampion(e.target.value)}
                  style={{ cursor: "pointer" }}
                >
                  <option value="">— Selecciona un equipo —</option>
                  {WC2026_TEAMS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">⚽ Goleador del Torneo</label>
                <select
                  className="input"
                  value={topScorer}
                  onChange={(e) => setTopScorer(e.target.value)}
                  style={{ cursor: "pointer" }}
                >
                  <option value="">— Selecciona un jugador —</option>
                  {WC2026_SCORERS.map((s, i) => (
                    <option key={i} value={formatScorer(s)}>{formatScorer(s)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <button
                className="btn-primary"
                onClick={handleSavePicks}
                disabled={saving || !champion.trim() || !topScorer.trim()}
                style={{ padding: "10px 24px", opacity: (!champion.trim() || !topScorer.trim()) ? 0.4 : 1 }}
              >
                {saving ? "Guardando..." : isEditing ? "Actualizar predicciones" : "Enviar predicciones"}
              </button>
              {isEditing && (
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "8px 14px" }}
                  onClick={() => {
                    setChampion(profile?.champion || "");
                    setTopScorer(profile?.topScorer || "");
                    setIsEditing(false);
                  }}
                >
                  Cancelar
                </button>
              )}
              {msg && <span style={{ fontSize: 13, color: msg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
            </div>
          </>
        )}

        {settings.champion && (
          <div style={{ ...s.resultRow, marginTop: 16 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Resultado oficial:</span>
            <span style={{ color: "var(--gold)", fontWeight: 600 }}>🏆 {settings.champion}</span>
            {settings.topScorer && <span style={{ color: "var(--gold)", fontWeight: 600 }}>⚽ {settings.topScorer}</span>}
          </div>
        )}
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
          <div>
            {ranking.map((entry, i) => (
              <RankRow key={entry.uid} entry={entry} position={i + 1} isMe={entry.uid === user?.uid} />
            ))}
          </div>
        )}
      </div>

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

function RankRow({ entry, position, isMe }: { entry: RankingEntry; position: number; isMe: boolean }) {
  const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : null;
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "10px 14px", borderBottom: "1px solid var(--border)",
      background: isMe ? "rgba(201,168,76,0.05)" : "transparent",
      transition: "background 0.15s", gap: 10, flexWrap: "wrap",
    }}>
      {/* Position */}
      <div style={{ width: 32, textAlign: "center", fontFamily: "'Bebas Neue',sans-serif", fontSize: 18,
        color: position <= 3 ? "var(--gold)" : "var(--text-muted)", flexShrink: 0 }}>
        {medal || `#${position}`}
      </div>

      {/* Name + tiebreaker badges */}
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {entry.displayName}
          {isMe && <span className="badge badge-gold" style={{ fontSize: 10, padding: "2px 7px" }}>Tú</span>}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", rowGap: 4 }}>
          <span style={tieStyle("#C9A84C")} title="Marcador exacto (5 pts)">
            ⭐ {entry.exactCount}
          </span>
          <span style={tieStyle("#9B8FD0")} title="Resultado correcto (2 pts)">
            ✅ {entry.resultCount ?? 0}
          </span>
          <span style={tieStyle("#6ABCB0")} title="Goles acertados (1 pt)">
            ⚽ {entry.partialCount ?? 0}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {entry.picksCount} apuestas
          </span>
        </div>
      </div>

      {/* Points breakdown */}
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

function PointsBreakdown({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{ textAlign: "center", display: "none" }} className="pts-detail">
      <div style={{ fontSize: 14, fontWeight: 600, color: highlight ? "var(--gold)" : "var(--text-dim)" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, fontFamily: "'Bebas Neue',sans-serif", color: "var(--gold)" }}>Cargando...</div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  myBadge: {
    background: "rgba(201,168,76,0.08)", border: "1px solid var(--border-gold)",
    borderRadius: "var(--radius)", padding: "12px 20px", textAlign: "center",
  },
  resultRow: {
    marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)",
    display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
  },
  legend: {
    marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
    padding: "14px 0",
  },
  legendItem: {
    background: "var(--surface2)", borderRadius: 6, padding: "5px 10px",
    fontSize: 12, display: "flex", gap: 6, alignItems: "center",
    border: "1px solid var(--border)",
  },
};
