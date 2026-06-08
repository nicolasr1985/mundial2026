// app/login/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginUser, sendUserPasswordReset } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setMsg("⚠ Completa todos los campos"); return; }
    setLoading(true);
    try {
      await loginUser(email, password);
      router.push("/dashboard");
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setMsg("❌ Correo o contraseña incorrectos");
      } else {
        setMsg("❌ Error al iniciar sesión");
      }
    } finally { setLoading(false); }
  };

  const handleForgot = async () => {
    if (!forgotEmail.trim()) { setForgotMsg("⚠ Ingresa tu correo electrónico"); return; }
    setForgotLoading(true);
    try {
      await sendUserPasswordReset(forgotEmail.trim());
      setForgotMsg("✅ Email de recuperación enviado. Revisa tu bandeja de entrada.");
      setTimeout(() => {
        setShowForgot(false);
        setForgotMsg("");
        setForgotEmail("");
      }, 4000);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/user-not-found") {
        setForgotMsg("❌ No existe una cuenta con ese correo");
      } else {
        setForgotMsg("❌ Error al enviar el email");
      }
    } finally { setForgotLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--black)", padding: "24px 16px",
    }}>
      {/* WC2026 Logo */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#9A8F84", letterSpacing: "4px", marginBottom: 6 }}>
          NO APTO PARA SENSIBLES
        </div>
        <div style={{ fontSize: 10, color: "#C9A84C", marginBottom: 8, letterSpacing: "2px" }}>· · ·</div>
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 4 }}>🏆</div>
        <div style={{ fontSize: 9, color: "#9A8F84", letterSpacing: "4px", marginBottom: 2 }}>FIFA</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#C9A84C", letterSpacing: "3px", fontFamily: "Arial Black, sans-serif" }}>WORLD CUP</div>
        <div style={{ fontSize: 15, color: "#C9A84C", letterSpacing: "5px", marginBottom: 6 }}>2026</div>
        <div style={{ fontSize: 9, color: "#9A8F84", letterSpacing: "3px", marginBottom: 8 }}>HOST NATIONS</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28 }}>🇺🇸</div>
            <div style={{ fontSize: 9, color: "#9A8F84", letterSpacing: "1px", marginTop: 2 }}>USA</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28 }}>🇨🇦</div>
            <div style={{ fontSize: 9, color: "#9A8F84", letterSpacing: "1px", marginTop: 2 }}>CANADA</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28 }}>🇲🇽</div>
            <div style={{ fontSize: 9, color: "#9A8F84", letterSpacing: "1px", marginTop: 2 }}>MEXICO</div>
          </div>
        </div>
      </div>

      {/* Login / Forgot card */}
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: "32px 28px" }}>

        {!showForgot ? (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 24, letterSpacing: "0.06em" }}>INICIAR SESIÓN</h1>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="label">CORREO ELECTRÓNICO</label>
                <input
                  className="input"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label">CONTRASEÑA</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {msg && (
              <div style={{ marginTop: 12, fontSize: 13, color: msg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>
                {msg}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleLogin}
              disabled={loading}
              style={{ width: "100%", marginTop: 20, padding: "13px", fontSize: 15, letterSpacing: "0.08em" }}
            >
              {loading ? "Entrando..." : "ENTRAR"}
            </button>

            {/* Forgot password link */}
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button
                onClick={() => { setShowForgot(true); setForgotEmail(email); setMsg(""); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, color: "var(--text-muted)",
                  textDecoration: "underline", fontFamily: "inherit",
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)", textAlign: "center", fontSize: 14, color: "var(--text-muted)" }}>
              ¿No tienes cuenta?{" "}
              <a href="/register" style={{ color: "var(--gold)", fontWeight: 600, textDecoration: "none" }}>
                Regístrate aquí
              </a>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 8, letterSpacing: "0.06em" }}>RECUPERAR CONTRASEÑA</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.6 }}>
              Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
            </p>

            <div>
              <label className="label">CORREO ELECTRÓNICO</label>
              <input
                className="input"
                type="email"
                placeholder="tu@correo.com"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleForgot()}
                autoFocus
              />
            </div>

            {forgotMsg && (
              <div style={{ marginTop: 12, fontSize: 13, color: forgotMsg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>
                {forgotMsg}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleForgot}
              disabled={forgotLoading}
              style={{ width: "100%", marginTop: 20, padding: "13px", fontSize: 15, letterSpacing: "0.08em" }}
            >
              {forgotLoading ? "Enviando..." : "ENVIAR EMAIL DE RECUPERACIÓN"}
            </button>

            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button
                onClick={() => { setShowForgot(false); setForgotMsg(""); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, color: "var(--text-muted)",
                  textDecoration: "underline", fontFamily: "inherit",
                }}
              >
                ← Volver al inicio de sesión
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
