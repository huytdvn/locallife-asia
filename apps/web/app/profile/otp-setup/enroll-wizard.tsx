"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Step = "loading" | "scan" | "verify" | "done" | "error";

interface GenerateResponse {
  secret: string;
  uri: string;
  qrDataUrl: string;
}

/**
 * Two-phase wizard:
 *   1. /generate — server mints fresh secret, we display QR + manual code
 *   2. /verify-enroll — user types 6-digit code; server re-checks against
 *      the same secret then encrypts + persists. From this point the
 *      authenticator app is the source of truth.
 *
 * The secret is held in component state only between phase 1 and 2 — never
 * stored locally beyond that. If the user closes the tab mid-wizard, the
 * orphan secret is harmless (never written to DB).
 */
export function OtpEnrollWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [data, setData] = useState<GenerateResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealSecret, setRevealSecret] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/otp/generate", { method: "POST" })
      .then(async (r) => {
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(j.error ?? `HTTP ${r.status}`);
          setStep("error");
          return;
        }
        setData(j);
        setStep("scan");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setStep("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitCode() {
    if (!data) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Cần 6 chữ số");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/otp/verify-enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: data.secret, code: code.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.detail ?? j.error ?? `HTTP ${res.status}`);
        return;
      }
      setStep("done");
      // Refresh JWT so middleware stops bouncing back here.
      setTimeout(() => router.push("/profile"), 1200);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (step === "loading") {
    return (
      <Card>
        <span className="ll-typing">
          <span />
          <span />
          <span />
        </span>{" "}
        Đang tạo secret…
      </Card>
    );
  }

  if (step === "error") {
    return (
      <Card>
        <strong style={{ color: "#b91c1c" }}>Lỗi</strong>
        <p style={{ fontSize: 13, color: "var(--ll-muted)", margin: "6px 0" }}>
          {error}
        </p>
      </Card>
    );
  }

  if (step === "done") {
    return (
      <Card>
        <strong style={{ color: "var(--ll-green-dark)" }}>
          ✓ Đã kích hoạt OTP
        </strong>
        <p style={{ fontSize: 13, color: "var(--ll-muted)", margin: "6px 0" }}>
          Lần đăng nhập tiếp theo bạn sẽ cần nhập 6 số từ app Authenticator.
          Đang chuyển về /profile…
        </p>
      </Card>
    );
  }

  // step === "scan" or "verify" — single screen, both QR and verify form.
  if (!data) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Bước 1 · Quét QR</h3>
        <p style={{ fontSize: 12, color: "var(--ll-muted)", margin: "0 0 12px" }}>
          Mở Google Authenticator / Microsoft Authenticator / 1Password →
          "Add" → "Scan QR".
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: 12,
            background: "var(--ll-surface-soft)",
            borderRadius: 8,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.qrDataUrl}
            alt="OTP QR"
            width={240}
            height={240}
            style={{ borderRadius: 6, background: "white" }}
          />
        </div>
        <details style={{ marginTop: 12 }}>
          <summary
            style={{
              fontSize: 12,
              color: "var(--ll-muted)",
              cursor: "pointer",
            }}
          >
            Không quét được? Nhập tay secret
          </summary>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setRevealSecret((v) => !v)}
              style={{
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--ll-border)",
                background: "white",
                cursor: "pointer",
              }}
            >
              {revealSecret ? "Ẩn" : "Hiện"} secret
            </button>
            {revealSecret && (
              <code
                style={{
                  display: "block",
                  marginTop: 8,
                  padding: 10,
                  background: "var(--ll-surface-soft)",
                  borderRadius: 6,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 13,
                  wordBreak: "break-all",
                }}
              >
                {data.secret}
              </code>
            )}
          </div>
        </details>
      </Card>

      <Card>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>
          Bước 2 · Nhập 6 số từ app
        </h3>
        <p style={{ fontSize: 12, color: "var(--ll-muted)", margin: "0 0 10px" }}>
          App sẽ hiển thị 6 số đổi mỗi 30 giây — gõ vào ô dưới.
        </p>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitCode();
          }}
          placeholder="123456"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--ll-border)",
            fontSize: 18,
            fontFamily: "ui-monospace, monospace",
            letterSpacing: "0.3em",
            textAlign: "center",
          }}
        />
        {error && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={submitCode}
          disabled={busy || code.length !== 6}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 16px",
            borderRadius: 8,
            border: "none",
            background:
              busy || code.length !== 6
                ? "var(--ll-muted)"
                : "var(--ll-green)",
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy || code.length !== 6 ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Đang xác nhận…" : "Xác nhận & kích hoạt"}
        </button>
      </Card>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--ll-border)",
        borderRadius: "var(--ll-radius-md)",
        padding: 18,
      }}
    >
      {children}
    </div>
  );
}
