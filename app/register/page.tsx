// app/register/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerUser } from "@/lib/firebase";

const LogoSVG = () => (
  <svg width="100%" viewBox="0 0 680 460" role="img" xmlns="http://www.w3.org/2000/svg" style={{ maxWidth: 340, margin: "0 auto", display: "block" }}>
    <title>FIFA World Cup 2026 - No Apto para Sensibles</title>
    <defs>
      <clipPath id="cu2"><rect width="80" height="50" rx="4"/></clipPath>
      <clipPath id="cc2"><rect width="80" height="50" rx="4"/></clipPath>
      <clipPath id="cm2"><rect width="80" height="50" rx="4"/></clipPath>
    </defs>
    <text x="340" y="38" fontFamily="'Arial Black', Impact, sans-serif" fontSize="11" fontWeight="900" fill="#5A5750" textAnchor="middle" letterSpacing="5">NO APTO PARA SENSIBLES</text>
    <line x1="140" y1="45" x2="250" y2="45" stroke="#2A2A30" strokeWidth="1"/>
    <line x1="430" y1="45" x2="540" y2="45" stroke="#2A2A30" strokeWidth="1"/>
    <text x="300" y="70" fontFamily="Georgia, serif" fontSize="11" fill="#C9A84C" textAnchor="middle">★</text>
    <text x="340" y="62" fontFamily="Georgia, serif" fontSize="14" fill="#C9A84C" textAnchor="middle">★</text>
    <text x="380" y="70" fontFamily="Georgia, serif" fontSize="11" fill="#C9A84C" textAnchor="middle">★</text>
    <g transform="translate(340, 150)">
      <path d="M -30 -55 Q -38 -30 -35 0 Q -28 25 0 30 Q 28 25 35 0 Q 38 -30 30 -55 Z" fill="#C9A84C"/>
      <path d="M -35 -40 Q -60 -30 -55 -10 Q -50 5 -35 0" fill="none" stroke="#C9A84C" strokeWidth="5" strokeLinecap="round"/>
      <path d="M 35 -40 Q 60 -30 55 -10 Q 50 5 35 0" fill="none" stroke="#C9A84C" strokeWidth="5" strokeLinecap="round"/>
      <rect x="-8" y="30" width="16" height="18" fill="#C9A84C"/>
      <rect x="-28" y="48" width="56" height="10" rx="3" fill="#C9A84C"/>
      <path d="M -15 -45 Q -10 -25 -12 -5" fill="none" stroke="#F0D080" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
    </g>
    <text x="340" y="242" fontFamily="'Arial Black', Impact, sans-serif" fontSize="13" fontWeight="900" fill="#6A6560" textAnchor="middle" letterSpacing="8">FIFA</text>
    <text x="340" y="282" fontFamily="'Arial Black', Impact, sans-serif" fontSize="44" fontWeight="900" fill="#C9A84C" textAnchor="middle" letterSpacing="3">WORLD CUP</text>
    <line x1="95" y1="292" x2="188" y2="292" stroke="#C9A84C" strokeWidth="1" opacity="0.5"/>
    <text x="340" y="308" fontFamily="'Arial Black', Impact, sans-serif" fontSize="22" fontWeight="900" fill="#E8C56A" textAnchor="middle" letterSpacing="6">2026</text>
    <line x1="492" y1="292" x2="585" y2="292" stroke="#C9A84C" strokeWidth="1" opacity="0.5"/>
    <line x1="180" y1="328" x2="500" y2="328" stroke="#2A2A30" strokeWidth="1"/>
    <text x="340" y="345" fontFamily="Arial, sans-serif" fontSize="9" fill="#4A4540" textAnchor="middle" letterSpacing="4">HOST NATIONS</text>
    <g transform="translate(180, 390)">
      <g clipPath="url(#cu2)" transform="translate(-40,-28)">
        <rect width="80" height="56" fill="#B22234"/>
        <rect x="0" y="4.3" width="80" height="4.3" fill="white"/>
        <rect x="0" y="12.9" width="80" height="4.3" fill="white"/>
        <rect x="0" y="21.5" width="80" height="4.3" fill="white"/>
        <rect x="0" y="30.1" width="80" height="4.3" fill="white"/>
        <rect x="0" y="38.7" width="80" height="4.3" fill="white"/>
        <rect x="0" y="47.3" width="80" height="4.3" fill="white"/>
        <rect x="0" y="0" width="32" height="30" fill="#3C3B6E"/>
        <circle cx="3.2" cy="3" r="1.2" fill="white"/><circle cx="8.5" cy="3" r="1.2" fill="white"/><circle cx="13.8" cy="3" r="1.2" fill="white"/><circle cx="19.1" cy="3" r="1.2" fill="white"/><circle cx="24.4" cy="3" r="1.2" fill="white"/><circle cx="29.7" cy="3" r="1.2" fill="white"/>
        <circle cx="5.8" cy="7.5" r="1.2" fill="white"/><circle cx="11.1" cy="7.5" r="1.2" fill="white"/><circle cx="16.4" cy="7.5" r="1.2" fill="white"/><circle cx="21.7" cy="7.5" r="1.2" fill="white"/><circle cx="27" cy="7.5" r="1.2" fill="white"/>
        <circle cx="3.2" cy="12" r="1.2" fill="white"/><circle cx="8.5" cy="12" r="1.2" fill="white"/><circle cx="13.8" cy="12" r="1.2" fill="white"/><circle cx="19.1" cy="12" r="1.2" fill="white"/><circle cx="24.4" cy="12" r="1.2" fill="white"/><circle cx="29.7" cy="12" r="1.2" fill="white"/>
        <circle cx="5.8" cy="16.5" r="1.2" fill="white"/><circle cx="11.1" cy="16.5" r="1.2" fill="white"/><circle cx="16.4" cy="16.5" r="1.2" fill="white"/><circle cx="21.7" cy="16.5" r="1.2" fill="white"/><circle cx="27" cy="16.5" r="1.2" fill="white"/>
        <circle cx="3.2" cy="21" r="1.2" fill="white"/><circle cx="8.5" cy="21" r="1.2" fill="white"/><circle cx="13.8" cy="21" r="1.2" fill="white"/><circle cx="19.1" cy="21" r="1.2" fill="white"/><circle cx="24.4" cy="21" r="1.2" fill="white"/><circle cx="29.7" cy="21" r="1.2" fill="white"/>
        <circle cx="5.8" cy="25.5" r="1.2" fill="white"/><circle cx="11.1" cy="25.5" r="1.2" fill="white"/><circle cx="16.4" cy="25.5" r="1.2" fill="white"/><circle cx="21.7" cy="25.5" r="1.2" fill="white"/><circle cx="27" cy="25.5" r="1.2" fill="white"/>
        <rect width="80" height="56" rx="4" fill="none" stroke="#3A3A42" strokeWidth="0.8"/>
      </g>
      <text x="0" y="38" fontFamily="Arial, sans-serif" fontSize="10" fill="#9A9590" textAnchor="middle" letterSpacing="2">USA</text>
    </g>
    <g transform="translate(340, 390)">
      <g clipPath="url(#cc2)" transform="translate(-40,-28)">
        <rect width="80" height="56" fill="white"/>
        <rect x="0" y="0" width="20" height="56" fill="#FF0000"/>
        <rect x="60" y="0" width="20" height="56" fill="#FF0000"/>
        <path d="M40,10 L42,20 L50,16 L46,24 L54,26 L47,29 L50,38 L40,34 L30,38 L33,29 L26,26 L34,24 L30,16 L38,20 Z" fill="#FF0000"/>
        <rect x="37" y="34" width="6" height="10" fill="#FF0000"/>
        <rect width="80" height="56" rx="4" fill="none" stroke="#3A3A42" strokeWidth="0.8"/>
      </g>
      <text x="0" y="38" fontFamily="Arial, sans-serif" fontSize="10" fill="#9A9590" textAnchor="middle" letterSpacing="2">CANADA</text>
    </g>
    <g transform="translate(500, 390)">
      <g clipPath="url(#cm2)" transform="translate(-40,-28)">
        <rect width="80" height="56" fill="white"/>
        <rect x="0" y="0" width="26.6" height="56" fill="#006847"/>
        <rect x="53.4" y="0" width="26.6" height="56" fill="#CE1126"/>
        <ellipse cx="40" cy="44" rx="10" ry="4" fill="#8B6914" opacity="0.7"/>
        <rect x="38" y="28" width="4" height="18" fill="#006847"/>
        <rect x="32" y="33" width="8" height="3" fill="#006847"/>
        <rect x="40" y="33" width="8" height="3" fill="#006847"/>
        <ellipse cx="40" cy="24" rx="8" ry="10" fill="#6B4F1A"/>
        <circle cx="40" cy="15" r="5" fill="#6B4F1A"/>
        <path d="M40 17 L44 20 L40 21 Z" fill="#DAA520"/>
        <path d="M32 22 Q22 16 24 28 Q30 26 32 22Z" fill="#5A4010"/>
        <path d="M48 22 Q58 16 56 28 Q50 26 48 22Z" fill="#5A4010"/>
        <path d="M44 18 Q50 14 52 18 Q54 22 50 24" fill="none" stroke="#228B22" strokeWidth="1.5" strokeLinecap="round"/>
        <rect width="80" height="56" rx="4" fill="none" stroke="#3A3A42" strokeWidth="0.8"/>
      </g>
      <text x="0" y="38" fontFamily="Arial, sans-serif" fontSize="10" fill="#9A9590" textAnchor="middle" letterSpacing="2">MEXICO</text>
    </g>
    <path d="M 200 445 Q 340 458 480 445" fill="none" stroke="#C9A84C" strokeWidth="1" opacity="0.25"/>
  </svg>
);

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
        <LogoSVG />
        <div className="card-gold" style={{ padding: 32, marginTop: 8 }}>
          <h2 style={{ fontSize: 20, marginBottom: 24, color: "var(--text)" }}>Crear cuenta</h2>
          {error && <div style={styles.errorBox}>{error}</div>}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="label">Tu nombre / apodo</label>
              <input className="input" type="text" placeholder="Ej: Pelé_FC" value={name} onChange={(e) => setName(e.target.value)} required maxLength={30}/>
            </div>
            <div>
              <label className="label">Correo electrónico</label>
              <input className="input" type="email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required/>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input className="input" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required/>
            </div>
            <div>
              <label className="label">Confirmar contraseña</label>
              <input className="input" type="password" placeholder="Repite la contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)} required/>
            </div>
            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8, width: "100%", padding: "14px" }}>
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
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px 16px", position: "relative",
    background: "radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, var(--black) 60%)",
  },
  bgDecor: {
    position: "absolute", top: "-200px", left: "50%", transform: "translateX(-50%)",
    width: "600px", height: "600px", borderRadius: "50%",
    background: "radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  container: { width: "100%", maxWidth: 440, position: "relative", zIndex: 1 },
  errorBox: {
    background: "rgba(231,76,60,0.12)", border: "1px solid rgba(231,76,60,0.3)",
    borderRadius: "var(--radius-sm)", padding: "10px 14px", color: "var(--red)",
    fontSize: 14, marginBottom: 8,
  },
};
