"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm({
  requireOld,
  forced,
  email,
}: {
  requireOld: boolean;
  forced: boolean;
  email: string;
}) {
  const router = useRouter();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function policyHints(pw: string): { label: string; ok: boolean }[] {
    return [
      { label: "≥ 10 ký tự", ok: pw.length >= 10 },
      { label: "Có chữ thường", ok: /[a-z]/.test(pw) },
      { label: "Có chữ hoa", ok: /[A-Z]/.test(pw) },
      { label: "Có chữ số", ok: /[0-9]/.test(pw) },
    ];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPw !== confirmPw) {
      setError("Mật khẩu mới và xác nhận không khớp");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldPassword: requireOld ? oldPw : undefined,
          newPassword: newPw,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(
          j.detail
            ? `${j.error}: ${Array.isArray(j.detail) ? j.detail.join("; ") : ""}`
            : j.error ?? `HTTP ${r.status}`
        );
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/profile"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="ll-card" style={{ ...cardStyle, textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>✅</div>
        <h2 style={{ margin: "0 0 6px", color: "var(--ll-green-dark)" }}>
          Đã đổi mật khẩu
        </h2>
        <p style={{ color: "var(--ll-muted)", fontSize: 13 }}>
          Đang chuyển về /profile…
        </p>
      </div>
    );
  }

  const hints = policyHints(newPw);

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {forced && (
        <div
          style={{
            padding: "10px 14px",
            background: "#fff7ed",
            border: "1px solid #fdba74",
            borderRadius: 8,
            color: "#c07600",
            fontSize: 13,
          }}
        >
          🔐 Mật khẩu hiện tại do admin cấp — đổi ngay để bảo vệ tài khoản. Bạn không thể vào các trang khác cho tới khi đổi.
        </div>
      )}

      <div className="ll-card" style={cardStyle}>
        <Row label={`Tài khoản`}>
          <input
            value={email}
            readOnly
            style={{ ...inputStyle, background: "var(--ll-surface-soft)", color: "var(--ll-muted)" }}
          />
        </Row>

        {requireOld && (
          <Row label="Mật khẩu hiện tại">
            <input
              type="password"
              required
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              autoComplete="current-password"
              style={inputStyle}
            />
          </Row>
        )}

        <Row label="Mật khẩu mới">
          <input
            type="password"
            required
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            style={inputStyle}
          />
          <ul style={{
            margin: "6px 0 0",
            padding: 0,
            listStyle: "none",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 4,
            fontSize: 11,
          }}>
            {hints.map((h, i) => (
              <li key={i} style={{ color: h.ok ? "var(--ll-green-dark)" : "var(--ll-muted)" }}>
                {h.ok ? "✓" : "○"} {h.label}
              </li>
            ))}
          </ul>
        </Row>

        <Row label="Xác nhận lại mật khẩu mới">
          <input
            type="password"
            required
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
            style={inputStyle}
          />
          {confirmPw.length > 0 && confirmPw !== newPw && (
            <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>
              Không khớp với mật khẩu mới
            </div>
          )}
        </Row>

        {error && (
          <div style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || newPw.length < 10 || newPw !== confirmPw}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            background: "var(--ll-green)",
            color: "white",
            border: "none",
            cursor: busy ? "wait" : "pointer",
            fontSize: 14,
            fontWeight: 600,
            marginTop: 6,
          }}
        >
          {busy ? "Đang đổi…" : "✓ Đổi mật khẩu"}
        </button>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: "var(--ll-muted)", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid var(--ll-border)",
  borderRadius: 12,
  padding: 18,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--ll-border)",
  fontSize: 14,
  fontFamily: "inherit",
  background: "white",
  boxSizing: "border-box",
};
