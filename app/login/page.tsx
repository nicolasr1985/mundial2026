// app/login/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginUser } from "@/lib/firebase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginUser(email, password);
      router.push("/dashboard");
    } catch {
      setError("Correo o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.bg}>
      {/* Decorative background */}
      <div style={styles.bgDecor} />

      <div style={styles.container} className="animate-fade-up">
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={styles.trophy}>🏆</div>
          <h1 style={styles.title}>MUNDIAL 2026</h1>
          <p style={styles.subtitle}>La polla que sí predice</p>
        </div>

        {/* Card */}
        <div className="card-gold" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 22, marginBottom: 24, color: "var(--text)" }}>
            Iniciar Sesión
          </h2>

          {error && (
            <div style={styles.errorBox}>{error}</div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="label">Correo electrónico</label>
              <input
                className="input"
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ marginTop: 8, width: "100%", padding: "14px" }}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div className="divider" />
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            ¿No tienes cuenta?{" "}
            <Link href="/register" style={{ color: "var(--gold)" }}>
              Regístrate aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    position: "relative",
    overflow: "hidden",
    background: "radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, var(--black) 60%)",
  },
  bgDecor: {
    position: "absolute",
    top: "-200px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "600px",
    height: "600px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  container: {
    width: "100%",
    maxWidth: 420,
    position: "relative",
    zIndex: 1,
  },
  trophy: {
    fontSize: 52,
    display: "block",
    marginBottom: 12,
    filter: "drop-shadow(0 0 20px rgba(201,168,76,0.5))",
  },
  title: {
    fontSize: 38,
    fontFamily: "'Bebas Neue', sans-serif",
    letterSpacing: "0.12em",
    background: "linear-gradient(135deg, var(--gold-light), var(--gold))",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: 14,
    marginTop: 4,
    fontStyle: "italic",
  },
  errorBox: {
    background: "rgba(231,76,60,0.12)",
    border: "1px solid rgba(231,76,60,0.3)",
    borderRadius: "var(--radius-sm)",
    padding: "10px 14px",
    color: "var(--red)",
    fontSize: 14,
    marginBottom: 8,
  },
};
