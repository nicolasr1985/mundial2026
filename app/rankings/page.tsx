// app/rankings/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const ALLOWED_EMAILS = ["nicolasr9@gmail.com"];

interface FifaEntry { rank: number; name: string; code: string; points: number; }

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

export default function RankingsPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [rankings, setRankings] = useState<FifaEntry[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter] = useState<"wc2026" | "all">("wc2026");

  const canView = !loading && user && (
    ALLOWED_EMAILS.includes(user.email ?? "")
  );

  useEffect(() => {
    if (!loading && !user) { router.push("/login"); return; }
    if (!loading && user && !canView) { router.push("/dashboard"); return; }
  }, [user, loading, canView, router]);

  useEffect(() => {
    if (!canView) return;
    fetch("/api/fifa-rankings")
      .then((r) => r.json())
      .then((d) => { setRankings(d.rankings || []); setFetching(false); })
      .catch(() => setFetching(false));
  }, [canView]);

  if (loading || fetching) return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif", fontSize: 28 }}>Cargando...</div>
    </div>
  );

  if (!canView) return null;

  const displayed = filter === "wc2026"
    ? rankings.filter((r) => WC2026_TEAMS.has(r.name))
    : rankings;

  return (
    <div className="page animate-fade-up">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 36 }}><span className="gold-text">🌍 RANKING FIFA</span></h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
          Ranking FIFA — Abril 2026 · football-ranking.com
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["wc2026", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "8px 16px", borderRadius: "var(--radius-sm)", fontSize: 13, cursor: "pointer",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
            background: filter === f ? "rgba(201,168,76,0.12)" : "var(--surface2)",
            color: filter === f ? "var(--gold)" : "var(--text-muted)",
            border: `1px solid ${filter === f ? "var(--border-gold)" : "var(--border)"}`,
          }}>
            {f === "wc2026"
              ? `⚽ Solo WC 2026 (${rankings.filter(r => WC2026_TEAMS.has(r.name)).length})`
              : `🌍 Todos (${rankings.length})`}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Rank", "País", "Cód.", "Puntos FIFA"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", fontSize: 11, color: "var(--text-muted)",
                    textAlign: h === "País" ? "left" : "center",
                    fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((r) => (
                <tr key={r.rank} style={{
                  borderBottom: "1px solid var(--border)",
                  background: WC2026_TEAMS.has(r.name) && filter === "all"
                    ? "rgba(201,168,76,0.04)" : "transparent",
                }}>
                  <td style={{
                    padding: "11px 16px", textAlign: "center",
                    fontFamily: "'Bebas Neue',sans-serif", fontSize: 20,
                    color: r.rank <= 3 ? "var(--gold)" : r.rank <= 10 ? "var(--text)" : "var(--text-muted)",
                  }}>
                    {r.rank <= 3 ? ["🥇","🥈","🥉"][r.rank-1] : r.rank}
                  </td>
                  <td style={{ padding: "11px 16px", textAlign: "left", fontSize: 14, fontWeight: WC2026_TEAMS.has(r.name) ? 600 : 400 }}>
                    {r.name}
                    {WC2026_TEAMS.has(r.name) && filter === "all" && (
                      <span style={{
                        marginLeft: 8, fontSize: 10, padding: "1px 6px",
                        background: "rgba(201,168,76,0.12)", color: "var(--gold)",
                        border: "1px solid var(--border-gold)", borderRadius: 3,
                      }}>WC26</span>
                    )}
                  </td>
                  <td style={{ padding: "11px 16px", textAlign: "center", fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>
                    {r.code}
                  </td>
                  <td style={{ padding: "11px 16px", textAlign: "center", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                    {r.points.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
          Fuente: football-ranking.com · Actualizado: Abril 2026
        </div>
      </div>
    </div>
  );
}
