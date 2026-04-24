// app/page.tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./layout";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/dashboard" : "/login");
    }
  }, [user, loading, router]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--black)"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 48,
          fontFamily: "'Bebas Neue', sans-serif",
          letterSpacing: "0.1em",
          background: "linear-gradient(135deg, var(--gold-light), var(--gold))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          MUNDIAL 2026
        </div>
        <div style={{ color: "var(--text-muted)", marginTop: 8 }}>Cargando...</div>
      </div>
    </div>
  );
}
