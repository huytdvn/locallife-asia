"use client";

import { useState, useTransition } from "react";
import type { Role } from "@/lib/rbac";
import type { RoleRow } from "@/lib/roles";

export function UsersTable({
  initialRows,
  validRoles,
  currentAdminEmail,
}: {
  initialRows: RoleRow[];
  validRoles: Role[];
  currentAdminEmail: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("employee");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const r = await fetch("/api/admin/users");
    if (!r.ok) return;
    const json = (await r.json()) as { rows: RoleRow[] };
    setRows(json.rows);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const body: {
        email: string;
        role: Role;
        password?: string;
      } = {
        email: newEmail.trim().toLowerCase(),
        role: newRole,
      };
      const pw = newPassword.trim();
      if (pw.length > 0) body.password = pw;

      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        passwordSet?: boolean;
      };
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        return;
      }
      setNewEmail("");
      setNewPassword("");
      if (j.passwordSet) {
        alert(
          `✓ Đã tạo ${body.email} với role ${body.role} + password.\n` +
            `Báo password trực tiếp cho user (KHÔNG qua chat / email không-encrypt).`
        );
      }
      await refresh();
    });
  }

  async function changeRole(email: string, role: Role) {
    startTransition(async () => {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (r.ok) await refresh();
    });
  }

  async function disable(email: string) {
    if (!confirm(`Disable user ${email}?`)) return;
    startTransition(async () => {
      const r = await fetch(
        `/api/admin/users?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );
      if (r.ok) await refresh();
    });
  }

  async function setPassword(email: string) {
    const pw = prompt(
      `Đặt password mới cho ${email}\n` +
        `(≥ 10 ký tự, có chữ thường + hoa + số):`
    );
    if (!pw) return;
    setError(null);
    startTransition(async () => {
      const r = await fetch("/api/admin/users/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) {
        setError(j.error?.message ?? `HTTP ${r.status}`);
        return;
      }
      alert(`✓ Đã đặt password cho ${email}. Báo họ password trực tiếp (KHÔNG qua chat / email không-encrypt).`);
    });
  }

  async function clearPassword(email: string) {
    if (!confirm(`Xoá password của ${email}? User sẽ phải dùng Google SSO sau đó.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await fetch("/api/admin/users/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action: "clear" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) setError(j.error?.message ?? `HTTP ${r.status}`);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <form
        onSubmit={add}
        className="ll-card ll-users-form"
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "minmax(0, 1.2fr) 140px minmax(0, 1.2fr) auto",
          alignItems: "end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, color: "var(--ll-muted)" }}>
            Email mới
          </span>
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@example.com"
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, color: "var(--ll-muted)" }}>Role</span>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            style={inputStyle}
          >
            {validRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, color: "var(--ll-muted)" }}>
            Password (optional)
          </span>
          <input
            type="text"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="≥10 ký tự, có lower+upper+digit; bỏ trống = SSO only"
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={pending} style={btnPrimary}>
          {pending ? "..." : "Thêm / cập nhật"}
        </button>
        {error && (
          <div
            style={{
              gridColumn: "1 / -1",
              color: "#b91c1c",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        <p
          style={{
            gridColumn: "1 / -1",
            margin: 0,
            fontSize: 12,
            color: "var(--ll-muted)",
            lineHeight: 1.5,
          }}
        >
          💡 Nếu user có Google Workspace <code>@locallife.asia</code> — bỏ
          trống password, họ login bằng SSO. Nếu user nội bộ không có
          Workspace (vd partner liaison) — nhập password để tạo trong 1 bước;
          user login bằng email + password.
        </p>
      </form>

      <div className="ll-card ll-users-table-wrap" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ll-muted)" }}>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={th}>Trạng thái</th>
              <th style={th}>Thêm bởi</th>
              <th style={th}>Cập nhật</th>
              <th style={th}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--ll-muted)" }}>
                  Chưa có user nào trong DB. Thêm ở form bên trên.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isMe = row.email === currentAdminEmail;
              return (
                <tr key={row.email} style={{ borderTop: "1px solid var(--ll-border)" }}>
                  <td style={td}>{row.email}</td>
                  <td style={td}>
                    <select
                      value={row.role}
                      disabled={pending || row.disabled}
                      onChange={(e) => changeRole(row.email, e.target.value as Role)}
                      style={{ ...inputStyle, padding: "4px 8px" }}
                    >
                      {validRoles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={td}>
                    {row.disabled ? (
                      <span style={{ color: "#b91c1c" }}>disabled</span>
                    ) : (
                      <span style={{ color: "var(--ll-green-dark)" }}>active</span>
                    )}
                  </td>
                  <td style={{ ...td, color: "var(--ll-muted)", fontSize: 13 }}>
                    {row.created_by ?? "(env-bootstrap)"}
                  </td>
                  <td style={{ ...td, color: "var(--ll-muted)", fontSize: 13 }}>
                    {new Date(row.updated_at).toLocaleDateString("vi-VN")}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={pending || row.disabled}
                        onClick={() => setPassword(row.email)}
                        style={btnSecondary}
                        title="Đặt mật khẩu cho user (login bằng email + password)"
                      >
                        🔑 Set pw
                      </button>
                      <button
                        type="button"
                        disabled={pending || row.disabled}
                        onClick={() => clearPassword(row.email)}
                        style={btnSecondary}
                        title="Xoá password — user phải dùng Google SSO"
                      >
                        Clear pw
                      </button>
                      <button
                        type="button"
                        disabled={pending || row.disabled || isMe}
                        title={isMe ? "Không thể disable chính mình" : ""}
                        onClick={() => disable(row.email)}
                        style={btnDanger}
                      >
                        Disable
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--ll-border)",
  background: "white",
  fontSize: 14,
};

const btnPrimary: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 6,
  background: "var(--ll-green-dark)",
  color: "white",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
};

const btnDanger: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 4,
  background: "transparent",
  color: "#b91c1c",
  border: "1px solid #fca5a5",
  cursor: "pointer",
  fontSize: 12,
};

const btnSecondary: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 4,
  background: "white",
  color: "var(--ll-ink-soft)",
  border: "1px solid var(--ll-border)",
  cursor: "pointer",
  fontSize: 12,
};

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "middle" };
