// app/register/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/firebase";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Las contraseñas no coinciden."); return; }
    if (password.length < 6) { setError("La contraseña debe tener mínimo 6 caracteres."); return; }
    setLoading(true);
    try {
      await registerUser(email, password, name.trim());
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("email-already-in-use")) {
        setError("Ya existe una cuenta con ese correo.");
      } else {
        setError("Error al crear la cuenta. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.bg}>
      <div style={styles.bgDecor} />
      <div style={styles.container} className="animate-fade-up">
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 44, filter: "drop-shadow(0 0 20px rgba(201,168,76,0.5))" }}>🏆</div>
          <h1 style={styles.title}>ÚNETE A LA POLLA</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Mundial 2026 • Con tus amigos</p>
        </div>

        <div className="card-gold" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 20, marginBottom: 24, color: "var(--text)" }}>Crear cuenta</h2>

          {error && (
            <div style={styles.errorBox}>{error}</div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="label">Tu nombre / apodo</label>
              <input
                className="input"
                type="text"
                placeholder="Ej: Pelé_FC"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={30}
              />
            </div>
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
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Confirmar contraseña</label>
              <input
                className="input"
                type="password"
                placeholder="Repite la contraseña"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ marginTop: 8, width: "100%", padding: "14px" }}
            >
              {loading ? "Creando cuenta..." : "Crear cuenta"}
            </button>
          </form>

          <div className="divider" />
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" style={{ color: "var(--gold)" }}>Inicia sesión</Link>
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
    background: "radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, var(--black) 60%)",
  },
  bgDecor: {
    position: "absolute", top: "-200px", left: "50%", transform: "translateX(-50%)",
    width: "600px", height: "600px", borderRadius: "50%",
    background: "radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  container: { width: "100%", maxWidth: 420, position: "relative", zIndex: 1 },
  title: {
    fontSize: 30, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.1em",
    background: "linear-gradient(135deg, var(--gold-light), var(--gold))",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  },
  errorBox: {
    background: "rgba(231,76,60,0.12)", border: "1px solid rgba(231,76,60,0.3)",
    borderRadius: "var(--radius-sm)", padding: "10px 14px", color: "var(--red)",
    fontSize: 14, marginBottom: 8,
  },
};
