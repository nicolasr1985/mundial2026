// app/settings/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { updateUserProfile, sendUserPasswordReset } from "@/lib/firebase";

export default function SettingsPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [showFifaRanking, setShowFifaRanking] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? "");
      const storedRanking = localStorage.getItem("showFifaRanking");
      setShowFifaRanking(storedRanking !== null ? storedRanking === "true" : (profile.showFifaRanking ?? false));
    }
    const stored = localStorage.getItem("darkMode");
    setDarkMode(stored === null ? true : stored === "true");
  }, [profile]);

  const handleDarkMode = (val: boolean) => {
    setDarkMode(val);
    localStorage.setItem("darkMode", String(val));
    document.documentElement.setAttribute("data-theme", val ? "dark" : "light");
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMsg("");
    try {
      localStorage.setItem("showFifaRanking", String(showFifaRanking));
      await updateUserProfile(user.uid, {
        displayName: displayName.trim() || profile?.displayName,
        showFifaRanking,
      });
      await refreshProfile();
      setSaveMsg("✅ Cambios guardados");
    } catch {
      setSaveMsg("❌ Error al guardar");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    try {
      await sendUserPasswordReset(user.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch {
      setSaveMsg("❌ Error al enviar email");
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="page animate-fade-up" style={{ maxWidth: 540 }}>
      <h1 style={{ fontSize: 36, marginBottom: 4 }}>
        <span className="gold-text">CONFIGURACIÓN</span>
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>
        Preferencias de tu cuenta
      </p>

      {/* Display Name */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Nombre para mostrar
        </div>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          style={{
            width: "100%", background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 14,
            color: "var(--text)", outline: "none", boxSizing: "border-box",
          }}
          placeholder="Tu nombre"
          maxLength={30}
        />
      </div>

      {/* Toggles */}
      <div className="card" style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 0 }}>
        <ToggleRow
          label="Ranking FIFA"
          description="Muestra el ranking FIFA junto al nombre de los equipos"
          value={showFifaRanking}
          onChange={setShowFifaRanking}
        />
        <div style={{ height: 1, background: "var(--border)", margin: "0 -16px" }} />
        <ToggleRow
          label="Modo oscuro"
          description="Cambia entre tema oscuro y claro"
          value={darkMode}
          onChange={handleDarkMode}
        />
      </div>

      {/* Reset Password */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Restablecer contraseña</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Te enviaremos un email a {user?.email}
            </div>
          </div>
          <button
            onClick={handleResetPassword}
            style={{
              padding: "8px 14px", fontSize: 12, borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)", background: "var(--surface2)",
              color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {resetSent ? "✅ Enviado" : "Enviar email"}
          </button>
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "10px 28px", fontSize: 14 }}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {saveMsg && (
          <span style={{ fontSize: 13, color: saveMsg.startsWith("✅") ? "var(--green)" : "var(--red)" }}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label, description, value, onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 0" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
          background: value ? "var(--gold)" : "var(--surface2)",
          position: "relative", transition: "background 0.2s", flexShrink: 0,
          outline: "none",
        }}
        aria-label={`Toggle ${label}`}
      >
        <span style={{
          position: "absolute", top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: "50%",
          background: value ? "#1a1a1a" : "var(--text-muted)",
          transition: "left 0.2s",
        }} />
      </button>
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
