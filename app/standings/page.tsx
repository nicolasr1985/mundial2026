// app/standings/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getMatches, getUserPicks, Match } from "@/lib/firebase";

interface TeamStat {
  team: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

interface R32Match {
  slot: string;
  homeDesc: string;
  awayDesc: string;
  homeTeam?: string;
  awayTeam?: string;
  isTBD?: boolean;
  awayIsThird?: boolean;   // true = away slot is a 3rd-place team
  awayThirdGroups?: string; // eligible groups for this 3rd slot
}

// ─── STANDINGS CALCULATOR ────────────────────────────────────────────────────
function computeGroupStandings(
  matches: Match[],
  allMatches: Match[]
): Record<string, TeamStat[]> {
  const standings: Record<string, Record<string, TeamStat>> = {};
  for (const m of allMatches) {
    if (!m.group) continue;
    const g = m.group;
    if (!standings[g]) standings[g] = {};
    if (!standings[g][m.homeTeam]) standings[g][m.homeTeam] = { team: m.homeTeam, group: g, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
    if (!standings[g][m.awayTeam]) standings[g][m.awayTeam] = { team: m.awayTeam, group: g, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
  }
  for (const m of matches) {
    if (!m.group || m.homeScore === null || m.awayScore === null) continue;
    const g = m.group;
    if (!standings[g]) continue;
    const home = standings[g][m.homeTeam];
    const away = standings[g][m.awayTeam];
    if (!home || !away) continue;
    const hs = Number(m.homeScore), as_ = Number(m.awayScore);
    if (isNaN(hs) || isNaN(as_)) continue;
    home.played++; away.played++;
    home.gf += hs; home.ga += as_; home.gd = home.gf - home.ga;
    away.gf += as_; away.ga += hs; away.gd = away.gf - away.ga;
    if (hs > as_)      { home.won++; home.points += 3; away.lost++; }
    else if (hs < as_) { away.won++; away.points += 3; home.lost++; }
    else               { home.drawn++; away.drawn++; home.points++; away.points++; }
  }
  const result: Record<string, TeamStat[]> = {};
  for (const g in standings) {
    result[g] = Object.values(standings[g]).sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  }
  return result;
}

function getThirdPlaceTable(standings: Record<string, TeamStat[]>): (TeamStat & { qualifies: boolean })[] {
  const thirds: TeamStat[] = [];
  for (const g in standings) {
    if (standings[g].length >= 3) thirds.push(standings[g][2]);
  }
  const sorted = thirds.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  return sorted.map((t, i) => ({ ...t, qualifies: i < 8 }));
}

// ─── R32 BRACKET BUILDER ─────────────────────────────────────────────────────
function buildR32(standings: Record<string, TeamStat[]>): R32Match[] {
  const get = (pos: number, group: string): string | undefined => {
    const teams = standings[group];
    if (!teams || teams.length < pos) return undefined;
    return teams[pos - 1]?.team;
  };

  // Get the 8 qualifying thirds and their groups
  const thirds = getThirdPlaceTable(standings);
  const qualifyingThirdGroups = thirds.filter(t => t.qualifies).map(t => t.group).sort();
  const key = qualifyingThirdGroups.join("");

  // Assign thirds to slots based on FIFA lookup table
  // We implement the most important rule: thirds go to specific slots based on their group
  const thirdAssignments = assignThirds(qualifyingThirdGroups, thirds.filter(t => t.qualifies));

  return [
    { slot: "R32-1",  homeDesc: "2° Grupo A",  awayDesc: "2° Grupo B",     homeTeam: get(2,"A"), awayTeam: get(2,"B") },
    { slot: "R32-2",  homeDesc: "1° Grupo E",   awayDesc: "3° (A/B/C/D/F)", homeTeam: get(1,"E"), awayTeam: thirdAssignments["ABCDF"], awayIsThird: true, awayThirdGroups: "ABCDF", isTBD: !thirdAssignments["ABCDF"] },
    { slot: "R32-3",  homeDesc: "1° Grupo F",   awayDesc: "2° Grupo C",     homeTeam: get(1,"F"), awayTeam: get(2,"C") },
    { slot: "R32-4",  homeDesc: "1° Grupo I",   awayDesc: "3° (C/D/F/G/H)", homeTeam: get(1,"I"), awayTeam: thirdAssignments["CDFGH"], awayIsThird: true, awayThirdGroups: "CDFGH", isTBD: !thirdAssignments["CDFGH"] },
    { slot: "R32-5",  homeDesc: "1° Grupo A",   awayDesc: "3° (C/E/F/H/I)", homeTeam: get(1,"A"), awayTeam: thirdAssignments["CEFHI"], awayIsThird: true, awayThirdGroups: "CEFHI", isTBD: !thirdAssignments["CEFHI"] },
    { slot: "R32-6",  homeDesc: "1° Grupo C",   awayDesc: "2° Grupo F",     homeTeam: get(1,"C"), awayTeam: get(2,"F") },
    { slot: "R32-7",  homeDesc: "2° Grupo E",   awayDesc: "2° Grupo I",     homeTeam: get(2,"E"), awayTeam: get(2,"I") },
    { slot: "R32-8",  homeDesc: "1° Grupo G",   awayDesc: "3° (A/E/H/I/J)", homeTeam: get(1,"G"), awayTeam: thirdAssignments["AEHIJ"], awayIsThird: true, awayThirdGroups: "AEHIJ", isTBD: !thirdAssignments["AEHIJ"] },
    { slot: "R32-9",  homeDesc: "1° Grupo H",   awayDesc: "2° Grupo J",     homeTeam: get(1,"H"), awayTeam: get(2,"J") },
    { slot: "R32-10", homeDesc: "2° Grupo K",   awayDesc: "2° Grupo L",     homeTeam: get(2,"K"), awayTeam: get(2,"L") },
    { slot: "R32-11", homeDesc: "1° Grupo B",   awayDesc: "3° (E/F/G/I/J)", homeTeam: get(1,"B"), awayTeam: thirdAssignments["EFGIJ"], awayIsThird: true, awayThirdGroups: "EFGIJ", isTBD: !thirdAssignments["EFGIJ"] },
    { slot: "R32-12", homeDesc: "1° Grupo D",   awayDesc: "3° (B/E/F/I/J)", homeTeam: get(1,"D"), awayTeam: thirdAssignments["BEFIJ"], awayIsThird: true, awayThirdGroups: "BEFIJ", isTBD: !thirdAssignments["BEFIJ"] },
    { slot: "R32-13", homeDesc: "2° Grupo D",   awayDesc: "2° Grupo G",     homeTeam: get(2,"D"), awayTeam: get(2,"G") },
    { slot: "R32-14", homeDesc: "1° Grupo J",   awayDesc: "2° Grupo H",     homeTeam: get(1,"J"), awayTeam: get(2,"H") },
    { slot: "R32-15", homeDesc: "1° Grupo L",   awayDesc: "3° (E/H/I/J/K)", homeTeam: get(1,"L"), awayTeam: thirdAssignments["EHIJK"], awayIsThird: true, awayThirdGroups: "EHIJK", isTBD: !thirdAssignments["EHIJK"] },
    { slot: "R32-16", homeDesc: "1° Grupo K",   awayDesc: "3° (D/E/I/J/L)", homeTeam: get(1,"K"), awayTeam: thirdAssignments["DEIJL"], awayIsThird: true, awayThirdGroups: "DEIJL", isTBD: !thirdAssignments["DEIJL"] },
  ];
}

// Assign thirds to bracket slots progressively as groups finish.
// allThirds = all 12 third-place teams sorted by current standings (best first).
function assignThirds(
  qualGroups: string[],
  qualTeams: (TeamStat & { qualifies: boolean })[]
): Record<string, string | undefined> {
  // Build a map of group -> current 3rd place team (from all standings, not just top 8)
  const teamByGroup = Object.fromEntries(qualTeams.map(t => [t.group, t.team]));

  // Each slot key = eligible groups string, value = eligible groups array
  const slotEligible: Record<string, string[]> = {
    "ABCDF": ["A","B","C","D","F"],
    "CDFGH": ["C","D","F","G","H"],
    "CEFHI": ["C","E","F","H","I"],
    "AEHIJ": ["A","E","H","I","J"],
    "EFGIJ": ["E","F","G","I","J"],
    "BEFIJ": ["B","E","F","I","J"],
    "EHIJK": ["E","H","I","J","K"],
    "DEIJL": ["D","E","I","J","L"],
  };

  const result: Record<string, string | undefined> = {};
  const usedGroups = new Set<string>();

  // Priority: qualifying thirds first, then any third from eligible groups
  for (const [slotKey, eligible] of Object.entries(slotEligible)) {
    // First try to find a qualifying third from this slot's eligible groups
    const qualMatch = qualGroups.find(g => eligible.includes(g) && !usedGroups.has(g));
    if (qualMatch) {
      result[slotKey] = teamByGroup[qualMatch];
      usedGroups.add(qualMatch);
    } else {
      // Show the current best third from eligible groups (provisional)
      const provisionalTeam = qualTeams.find(t => eligible.includes(t.group) && !usedGroups.has(t.group));
      if (provisionalTeam) {
        result[slotKey] = provisionalTeam.team;
        usedGroups.add(provisionalTeam.group);
      }
    }
  }

  return result;
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function StandingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [userPickMap, setUserPickMap] = useState<Record<string, { homeScore: number; awayScore: number }>>({});
  const [activeGroup, setActiveGroup] = useState("A");
  const [viewMode, setViewMode] = useState<"real" | "predicted">("real");
  const [activeTab, setActiveTab] = useState<"groups" | "thirds" | "r32">("groups");
  const [fetching, setFetching] = useState(true);

  useEffect(() => { if (!loading && !user) router.push("/login"); }, [user, loading, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [m, up] = await Promise.all([getMatches(), getUserPicks(user.uid)]);
      setMatches(m);
      const pickMap: Record<string, { homeScore: number; awayScore: number }> = {};
      up.forEach((p) => { pickMap[p.matchId] = { homeScore: p.homeScore, awayScore: p.awayScore }; });
      setUserPickMap(pickMap);
    } catch (e) { console.warn(e); }
    finally { setFetching(false); }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const groupMatches = matches.filter((m) => m.round?.startsWith("Fase de Grupos"));
  const availableGroups = Array.from(new Set(groupMatches.map((m) => m.group).filter(Boolean) as string[])).sort();

  const realFinished = groupMatches.filter((m) => m.status === "finished" && m.homeScore !== null);
  const realStandings = computeGroupStandings(realFinished, groupMatches);
  const realThirds = getThirdPlaceTable(realStandings);
  const realR32 = buildR32(realStandings);

  const predictedMatches = groupMatches.map((m) => {
    const p = userPickMap[m.id];
    if (!p) return null;
    const hs = Number(p.homeScore), as_ = Number(p.awayScore);
    if (isNaN(hs) || isNaN(as_)) return null;
    return { ...m, homeScore: hs, awayScore: as_, status: "finished" as const };
  }).filter(Boolean) as Match[];
  const predictedStandings = computeGroupStandings(predictedMatches, groupMatches);
  const predictedThirds = getThirdPlaceTable(predictedStandings);
  const predictedR32 = buildR32(predictedStandings);

  // Build simple standings map for display (team name by position)
  const displayStandings = viewMode === "real" ? realStandings : predictedStandings;
  const displayThirds = viewMode === "real" ? realThirds : predictedThirds;
  const displayR32 = viewMode === "real" ? realR32 : predictedR32;
  const groupTable = displayStandings[activeGroup] || [];

  if (loading || fetching) return <Loading />;

  return (
    <div className="page animate-fade-up">
      <h1 style={{ fontSize: 36, marginBottom: 4 }}><span className="gold-text">TABLA</span></h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        Posiciones, terceros y cuadro de Ronda de 32
      </p>

      {/* View mode toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["real", "predicted"] as const).map((mode) => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding: "8px 18px", borderRadius: "var(--radius-sm)", cursor: "pointer",
            border: `1px solid ${viewMode === mode ? "var(--border-gold)" : "var(--border)"}`,
            background: viewMode === mode ? "rgba(201,168,76,0.12)" : "var(--surface2)",
            color: viewMode === mode ? "var(--gold)" : "var(--text-muted)",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: 14, transition: "all 0.15s",
          }}>
            {mode === "real" ? "📊 Tabla Real" : "🔮 Según Mis Picks"}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
        {([
          { id: "groups", label: "📋 Grupos" },
          { id: "thirds", label: "🏅 Tabla de Terceros" },
          { id: "r32",    label: "⚔️ Ronda de 32" },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "10px 16px", fontSize: 13, cursor: "pointer", border: "none",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, letterSpacing: "0.04em",
            background: "transparent", transition: "all 0.15s", whiteSpace: "nowrap",
            color: activeTab === t.id ? "var(--gold)" : "var(--text-muted)",
            borderBottom: `2px solid ${activeTab === t.id ? "var(--gold)" : "transparent"}`,
          }}>{t.label}</button>
        ))}
      </div>

      {availableGroups.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <p>No hay partidos de grupos aún.</p>
        </div>
      ) : activeTab === "groups" ? (
        <GroupsTab
          availableGroups={availableGroups}
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          groupTable={groupTable}
          displayThirds={displayThirds}
          viewMode={viewMode}
          realStandings={realStandings}
        />
      ) : activeTab === "thirds" ? (
        <ThirdsTab displayThirds={displayThirds} viewMode={viewMode} />
      ) : (
        <R32Tab r32={displayR32} viewMode={viewMode} />
      )}
    </div>
  );
}

// ─── GROUPS TAB ───────────────────────────────────────────────────────────────
function GroupsTab({ availableGroups, activeGroup, setActiveGroup, groupTable, displayThirds, viewMode, realStandings }: {
  availableGroups: string[];
  activeGroup: string;
  setActiveGroup: (g: string) => void;
  groupTable: TeamStat[];
  displayThirds: (TeamStat & { qualifies: boolean })[];
  viewMode: "real" | "predicted";
  realStandings: Record<string, TeamStat[]>;
}) {
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {availableGroups.map((g) => (
          <button key={g} onClick={() => setActiveGroup(g)} style={{
            width: 36, height: 36, borderRadius: 6, fontFamily: "'Bebas Neue',sans-serif",
            fontSize: 16, cursor: "pointer", border: "none", transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: activeGroup === g ? "var(--gold)" : "var(--surface2)",
            color: activeGroup === g ? "var(--black)" : "var(--text-muted)",
          }}>{g}</button>
        ))}
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: "var(--gold)" }}>GRUPO {activeGroup}</span>
          <span className={`badge ${viewMode === "real" ? "badge-blue" : "badge-gold"}`} style={{ fontSize: 11 }}>
            {viewMode === "real" ? "Resultados Oficiales" : "Según Mis Predicciones"}
          </span>
        </div>
        {groupTable.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Sin resultados aún</div>
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
                {groupTable.map((team, i) => {
                  const qualifies3rd = i === 2 && displayThirds.find(t => t.team === team.team)?.qualifies;
                  const advances = i < 2 || qualifies3rd;
                  return (
                    <tr key={team.team} style={{ borderBottom: "1px solid var(--border)", background: advances ? "rgba(201,168,76,0.04)" : "transparent" }}>
                      <td style={s.td}><span style={{ color: i < 2 ? "var(--gold)" : qualifies3rd ? "var(--green)" : "var(--text-muted)" }}>{i + 1}</span></td>
                      <td style={{ ...s.td, fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>
                        {team.team}
                        {i < 2 && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--gold)" }}>✓</span>}
                        {qualifies3rd && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--green)" }}>✓3°</span>}
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
                      <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)" }}>{team.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
          ✓ = Clasificado directo · ✓3° = Clasifica como mejor tercero
        </div>
      </div>
    </>
  );
}

// ─── THIRDS TAB ───────────────────────────────────────────────────────────────
function ThirdsTab({ displayThirds, viewMode }: { displayThirds: (TeamStat & { qualifies: boolean })[]; viewMode: string }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: "var(--gold)" }}>TABLA DE TERCEROS</span>
        <span className="badge badge-green" style={{ fontSize: 11 }}>Top 8 clasifican</span>
      </div>
      {displayThirds.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Los terceros aparecerán cuando haya resultados</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Equipo", "Grupo", "PJ", "G", "E", "P", "GF", "GC", "DG", "Pts", "Estado"].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayThirds.map((team, i) => (
                <tr key={team.team} style={{ borderBottom: "1px solid var(--border)", background: team.qualifies ? "rgba(46,204,113,0.04)" : "transparent" }}>
                  <td style={s.td}><span style={{ color: team.qualifies ? "var(--green)" : "var(--text-muted)" }}>{i + 1}</span></td>
                  <td style={{ ...s.td, fontWeight: 600, textAlign: "left", paddingLeft: 16 }}>{team.team}</td>
                  <td style={{ ...s.td, color: "var(--gold)", fontFamily: "'Bebas Neue',sans-serif" }}>{team.group}</td>
                  <td style={s.td}>{team.played}</td>
                  <td style={s.td}>{team.won}</td>
                  <td style={s.td}>{team.drawn}</td>
                  <td style={s.td}>{team.lost}</td>
                  <td style={s.td}>{team.gf}</td>
                  <td style={s.td}>{team.ga}</td>
                  <td style={{ ...s.td, color: team.gd > 0 ? "var(--green)" : team.gd < 0 ? "var(--red)" : "var(--text-muted)" }}>
                    {team.gd > 0 ? `+${team.gd}` : team.gd}
                  </td>
                  <td style={{ ...s.td, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: "var(--gold)" }}>{team.points}</td>
                  <td style={s.td}>
                    {team.qualifies
                      ? <span className="badge badge-green" style={{ fontSize: 10 }}>Clasifica</span>
                      : <span className="badge badge-red" style={{ fontSize: 10 }}>Eliminado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
        Los mejores 8 terceros de los 12 grupos avanzan a Ronda de 32
      </div>
    </div>
  );
}

// ─── R32 TAB — VISUAL BRACKET ────────────────────────────────────────────────
function R32Tab({ r32, viewMode }: { r32: R32Match[]; viewMode: string }) {
  const bySlot = Object.fromEntries(r32.map(m => [m.slot, m]));

  const leftSlots  = ["R32-1","R32-2","R32-3","R32-4","R32-5","R32-6","R32-7","R32-8"];
  const rightSlots = ["R32-9","R32-10","R32-11","R32-12","R32-13","R32-14","R32-15","R32-16"];

  return (
    <div>
      {/* Legend */}
      <div style={{ marginBottom: 14, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span><span style={{ color: "var(--gold)", fontWeight: 700 }}>Negrita dorada</span> = clasificado confirmado</span>
        <span><span style={{ color: "var(--text)" }}>Blanco</span> = pendiente de confirmar</span>
        <span><span style={{ color: "var(--green)" }}>*</span> = tercero provisional</span>
      </div>

      {/* Bracket scroll container */}
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ display: "flex", gap: 0, minWidth: 900, alignItems: "stretch" }}>

          {/* LEFT R32 */}
          <BracketRound title="Ronda de 32" slots={leftSlots} bySlot={bySlot} count={8} />
          <BracketConnectors count={4} />

          {/* LEFT R16 */}
          <BracketRound title="Octavos" slots={[]} bySlot={bySlot} count={4} tbd />
          <BracketConnectors count={2} />

          {/* LEFT QF */}
          <BracketRound title="Cuartos" slots={[]} bySlot={bySlot} count={2} tbd />
          <BracketConnectors count={1} />

          {/* SEMI LEFT */}
          <BracketRound title="Semi" slots={[]} bySlot={bySlot} count={1} tbd />
          <BracketConnectors count={1} half />

          {/* FINAL */}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 150 }}>
            <div style={rStyle.roundTitle as React.CSSProperties}>
              <span style={{ color: "var(--gold)" }}>Final</span>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <BracketMatch home="Semi 1" away="Semi 2" tbd />
            </div>
          </div>

          <BracketConnectors count={1} half reverse />

          {/* SEMI RIGHT */}
          <BracketRound title="Semi" slots={[]} bySlot={bySlot} count={1} tbd />
          <BracketConnectors count={1} />

          {/* RIGHT QF */}
          <BracketRound title="Cuartos" slots={[]} bySlot={bySlot} count={2} tbd />
          <BracketConnectors count={2} />

          {/* RIGHT R16 */}
          <BracketRound title="Octavos" slots={[]} bySlot={bySlot} count={4} tbd />
          <BracketConnectors count={4} />

          {/* RIGHT R32 */}
          <BracketRound title="Ronda de 32" slots={rightSlots} bySlot={bySlot} count={8} />

        </div>
      </div>
    </div>
  );
}

const TEAM_BOX_W = 152;
const TEAM_BOX_H = 28;

const rStyle = {
  roundTitle: {
    fontSize: 10, fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
    letterSpacing: "0.08em", textTransform: "uppercase" as const,
    color: "var(--text-muted)", textAlign: "center" as const,
    padding: "4px 6px", borderBottom: "1px solid var(--border)", marginBottom: 6,
  },
  teamBox: (known: boolean, isThird?: boolean, confirmed?: boolean): React.CSSProperties => ({
    padding: "0 8px",
    fontSize: 11,
    height: TEAM_BOX_H,
    width: TEAM_BOX_W,
    minWidth: TEAM_BOX_W,
    maxWidth: TEAM_BOX_W,
    boxSizing: "border-box" as const,
    display: "flex",
    alignItems: "center",
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    color: confirmed ? "var(--gold)" : (isThird && known) ? "var(--green)" : known ? "var(--text)" : "var(--text-muted)",
    fontWeight: confirmed ? 700 : 400,
    fontStyle: known ? "normal" : "italic",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  }),
};

function BracketMatch({ home, away, homeM, awayM, tbd }: {
  home?: string; away?: string;
  homeM?: R32Match; awayM?: R32Match;
  tbd?: boolean;
}) {
  const homeLabel = homeM?.homeTeam || (tbd ? "—" : home || "—");
  const awayLabel = awayM ? (
    awayM.awayTeam || awayM.awayDesc
  ) : (tbd ? "—" : away || "—");
  const homeKnown = !!(homeM?.homeTeam) || (!tbd && !!home);
  const awayKnown = !!(awayM?.awayTeam) || (!tbd && !!away);
  const awayIsThird = awayM?.awayIsThird;
  const awayConfirmed = awayIsThird && !awayM?.isTBD && awayKnown;
  const awayProvisional = awayIsThird && awayM?.isTBD && awayKnown;
  // Home is confirmed if it has a real team (1st or 2nd place is always confirmed once known)
  const homeConfirmed = homeKnown && !tbd;

  return (
    <div style={{ marginBottom: 0 }}>
      {/* Home team */}
      <div style={{ ...rStyle.teamBox(homeKnown, false, homeConfirmed), borderRadius: "4px 4px 0 0", borderBottom: "none" }}>
        {homeLabel}
      </div>
      {/* Away team */}
      <div style={{ ...rStyle.teamBox(awayKnown, awayIsThird, awayConfirmed), borderRadius: "0 0 4px 4px", justifyContent: "space-between" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {awayLabel}
        </span>
        {awayIsThird && awayProvisional && (
          <span style={{ fontSize: 10, color: "var(--green)", marginLeft: 4, flexShrink: 0, opacity: 0.8 }}>*</span>
        )}
        {awayIsThird && !awayKnown && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4, flexShrink: 0 }}>*</span>
        )}
      </div>
    </div>
  );
}

function BracketRound({ title, slots, bySlot, count, tbd }: {
  title: string; slots: string[]; bySlot: Record<string, R32Match>;
  count: number; tbd?: boolean;
}) {
  const items = Array.from({ length: count }, (_, i) => {
    const slot = slots[i];
    const m = slot ? bySlot[slot] : undefined;
    return { slot, m };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 154, flex: "0 0 auto" }}>
      <div style={rStyle.roundTitle as React.CSSProperties}>{title}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 4, padding: "4px 0" }}>
        {items.map(({ slot, m }, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {m ? (
              <BracketMatch homeM={m} awayM={m} />
            ) : (
              <BracketMatch tbd home="—" away="—" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketConnectors({ count, half, reverse }: { count: number; half?: boolean; reverse?: boolean }) {
  return (
    <div style={{ width: 16, display: "flex", flexDirection: "column", justifyContent: "space-around", flex: "0 0 auto", paddingTop: 22 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ height: "50%", borderRight: half && !reverse ? "none" : "1px solid var(--border)", borderTop: reverse ? "none" : "1px solid var(--border)", borderBottom: reverse ? "1px solid var(--border)" : "none" }} />
          <div style={{ height: "50%", borderRight: half && !reverse ? "none" : "1px solid var(--border)", borderTop: "none", borderBottom: "none" }} />
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
  th: { padding: "10px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "center", fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" },
  td: { padding: "12px 8px", fontSize: 14, textAlign: "center", color: "var(--text)" },
};
