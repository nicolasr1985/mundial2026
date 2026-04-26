// app/client-layout.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthChange, logoutUser, getUserProfile, UserProfile } from "@/lib/firebase";
import { AuthContext } from "@/lib/auth-context";
import type { User } from "firebase/auth";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      setUser(u);
      if (u) {
        try {
          const p = await getUserProfile(u.uid);
          setProfile(p);
        } catch (err) {
          console.warn("Profile load error:", err);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleLogout = async () => {
    try { await logoutUser(); } catch {}
    router.push("/login");
  };

  const isAuth = !!user;
  const isAdmin = profile?.isAdmin ?? false;
  const canSeeRankings = ["nicolasr9@gmail.com"].includes(user?.email ?? "");

  const navLinks = [
    { href: "/dashboard", label: "Ranking" },
    { href: "/picks", label: "Apuestas" },
    { href: "/mypicks", label: "Mis Picks" },
    { href: "/standings", label: "Tabla" },
    ...(canSeeRankings ? [{ href: "/rankings", label: "🌍 FIFA" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "⚙ Admin" }] : []),
  ];

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {isAuth && (
        <nav className="nav">
          <div className="nav-inner">
            <Link href="/dashboard" className="nav-logo">
              <span className="gold-text">⚽ MUNDIAL</span>
              <span style={{ color: "var(--text-muted)", fontSize: 14, marginLeft: 6 }}>2026</span>
            </Link>
            <div className="nav-links">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`nav-link${pathname === l.href ? " active" : ""}`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
            <button className="btn-ghost" onClick={handleLogout} style={{ padding: "6px 14px", fontSize: 13 }}>
              Salir
            </button>
          </div>
        </nav>
      )}
      <main>{children}</main>
    </AuthContext.Provider>
  );
}
