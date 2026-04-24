// app/layout.tsx
"use client";

import "./globals.css";
import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthChange, logoutUser, getUserProfile, UserProfile } from "@/lib/firebase";
import type { User } from "firebase/auth";

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
interface AuthCtx {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}
const AuthContext = createContext<AuthCtx>({ user: null, profile: null, loading: true });
export const useAuth = () => useContext(AuthContext);

// ─── LAYOUT ───────────────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
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
    await logoutUser();
    router.push("/login");
  };

  const isAuth = !!user;
  const isAdmin = profile?.isAdmin ?? false;

  const navLinks = [
    { href: "/dashboard", label: "Ranking" },
    { href: "/picks", label: "Apuestas" },
    { href: "/mypicks", label: "Mis Picks" },
    { href: "/standings", label: "Tabla" },
    ...(isAdmin ? [{ href: "/admin", label: "⚙ Admin" }] : []),
  ];

  return (
    <html lang="es">
      <head>
        <title>Polla Mundial 2026</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Polla del Mundial 2026 - Haz tus predicciones" />
      </head>
      <body>
        <AuthContext.Provider value={{ user, profile, loading }}>
          {isAuth && (
            <nav className="nav">
              <div className="nav-inner">
                <Link href="/dashboard" className="nav-logo">
                  <span className="gold-text">⚽ MUNDIAL</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 14, marginLeft: 6 }}>2026</span>
                </Link>

                {/* Desktop nav */}
                <div className="nav-links" style={{ display: "flex" }}>
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

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--text-muted)", display: "none" }} className="user-name">
                    {profile?.displayName}
                  </span>
                  <button className="btn-ghost" onClick={handleLogout} style={{ padding: "6px 14px", fontSize: 13 }}>
                    Salir
                  </button>
                </div>
              </div>
            </nav>
          )}
          <main>{children}</main>
        </AuthContext.Provider>
      </body>
    </html>
  );
}
