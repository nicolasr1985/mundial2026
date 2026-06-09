// app/dashboard/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getRanking, getTournamentSettings, getAllUsers, RankingEntry } from "@/lib/firebase";

const BET_PER_USER = 100000;

function formatCOP(n: number) {
  return "$" + n.toLocaleString("es-CO");
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [totalUsers, setTotalUsers] = useState(0);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [r, s, u] = await Promise.all([getRanking(), getTournamentSettings(), getAllUsers()]);
        setRanking(r);
        setSettings(s as Record<string, string>);
        setTotalUsers(u.filter(x => !x.isAdmin).length);
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

  const myPosition = ranking.findIndex((r) => r.uid === user?.uid) + 1;
  const myEntry = ranking.find((r) => r.uid === user?.uid);

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
          <div>
            {ranking.map((entry, i) => (
              <RankRow
                key={entry.uid}
                entry={entry}
                position={i + 1}
                isMe={entry.uid === user?.uid}
                prize={i === 0 ? firstPrize : i === 1 ? secondPrize : i === 2 ? thirdPrize : null}
              />
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
