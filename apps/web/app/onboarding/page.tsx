import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getCurrentForEmail,
  isoWeekLabel,
  listForEmail,
} from "@/lib/onboarding/weekly-assignment";
import { getPathBySlug } from "@/lib/training";
import { getProgress } from "@/lib/training-progress";
import { aggregatePopupMetrics, computeFocusScore, isLow } from "@/lib/onboarding/focus-score";
import { POSITIVE_DASHBOARD_COPY } from "@/lib/onboarding/copy.vi";
import { PageShell, SectionHeader } from "@/components/ui";
import { AppNav } from "@/components/app-nav";
import { PopupHost } from "@/components/onboarding/PopupHost";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const email = session.user.email;
  const role = session.role ?? "employee";

  const week = isoWeekLabel(new Date());
  const current = await getCurrentForEmail(email, week);
  const history = await listForEmail(email, 6);

  const path = current ? getPathBySlug(current.trainingSlug, role) : null;
  const progress = current ? getProgress(email, current.trainingSlug) : null;

  // Focus stats (week-to-date)
  const now = new Date();
  const weekStart = new Date(now);
  const dayIdx = (weekStart.getDay() + 6) % 7;
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - dayIdx);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const popupMetrics = await aggregatePopupMetrics(email, weekStart, weekEnd);
  const score = computeFocusScore({
    assignmentsPassPct: current?.status === "passed" || current?.status === "closed_ok" ? 1 : 0,
    popupResponseRate: popupMetrics.responseRate,
    humorAccuracy: popupMetrics.humorAccuracy,
  });
  const lowFlag = isLow(score);
  const focusMsg = lowFlag
    ? POSITIVE_DASHBOARD_COPY.lowFocus
    : score >= 80
    ? POSITIVE_DASHBOARD_COPY.highFocus
    : POSITIVE_DASHBOARD_COPY.midFocus;

  const completedSteps = progress?.completed_steps ?? [];
  const totalSteps = path?.total_steps ?? 0;
  const stepProgress = totalSteps > 0
    ? Math.round((completedSteps.length / totalSteps) * 100)
    : 0;
  const passedAt = progress?.quiz?.passed_at ?? null;
  const bestQuiz = progress?.quiz?.best_score ?? null;

  return (
    <PageShell>
      <AppNav role={role} active="onboarding" />

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 16px" }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Vòng học tuần này</h1>
        <p style={{ color: "var(--ll-muted)", fontSize: 14, marginBottom: 24 }}>
          Tuần <strong>{week}</strong>. Chỉ vài phút mỗi ngày, không vội đâu.
        </p>

        <div
          style={{
            background: "var(--ll-grad-warm)",
            border: `1px solid ${lowFlag ? "var(--ll-terracotta)" : "var(--ll-green-soft)"}`,
            borderRadius: "var(--ll-radius-lg)",
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--ll-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Focus tuần
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: lowFlag ? "var(--ll-terracotta)" : "var(--ll-green-dark)" }}>
                {Math.round(score)}<span style={{ fontSize: 16, color: "var(--ll-muted)" }}> / 100</span>
              </div>
            </div>
            <div style={{ maxWidth: 360, fontSize: 14, color: "var(--ll-ink)" }}>
              {focusMsg}
            </div>
          </div>
        </div>

        {!current ? (
          <EmptyState />
        ) : (
          <CurrentAssignment
            assignmentId={current.id}
            status={current.status}
            week={current.weekIso}
            slug={current.trainingSlug}
            pathTitle={path?.title ?? current.trainingSlug}
            pathSubtitle={path?.subtitle}
            stepProgress={stepProgress}
            completedCount={completedSteps.length}
            totalSteps={totalSteps}
            bestQuiz={bestQuiz}
            passedAt={passedAt}
          />
        )}

        <SectionHeader title="Lịch sử 6 tuần gần nhất" subtitle="" />
        <ul style={{ listStyle: "none", padding: 0 }}>
          {history.length === 0 && (
            <li style={{ color: "var(--ll-muted)", fontSize: 14 }}>Chưa có dữ liệu lịch sử.</li>
          )}
          {history.map((h) => (
            <li
              key={h.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--ll-surface)",
                border: "1px solid var(--ll-border)",
                borderRadius: "var(--ll-radius-sm)",
                marginBottom: 6,
                fontSize: 14,
              }}
            >
              <span><strong>{h.weekIso}</strong> · {h.trainingSlug}</span>
              <StatusBadge status={h.status} />
            </li>
          ))}
        </ul>
      </div>

      <PopupHost />
    </PageShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: "var(--ll-border)", color: "var(--ll-ink-soft)", label: "Chờ bắt đầu" },
    in_progress: { bg: "var(--ll-sunlight)", color: "#7c4a00", label: "Đang đọc" },
    submitted: { bg: "var(--ll-orange-soft)", color: "var(--ll-terracotta)", label: "Chờ admin" },
    pending_retry: { bg: "var(--ll-orange-soft)", color: "#92400e", label: "Thử lại" },
    failed_pending_review: { bg: "#fce7f3", color: "#9d174d", label: "Admin review" },
    passed: { bg: "var(--ll-green-soft)", color: "var(--ll-green-dark)", label: "Pass" },
    closed_ok: { bg: "var(--ll-green-soft)", color: "var(--ll-green-dark)", label: "OK ✓" },
    closed_supplement: { bg: "#dbeafe", color: "#1e40af", label: "Bổ sung" },
    expired: { bg: "var(--ll-border)", color: "var(--ll-muted)", label: "Hết hạn" },
  };
  const m = map[status] ?? map.pending;
  return (
    <span
      style={{
        background: m.bg,
        color: m.color,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {m.label}
    </span>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        background: "var(--ll-surface-soft)",
        border: "1px dashed var(--ll-border)",
        borderRadius: "var(--ll-radius-lg)",
        marginBottom: 32,
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 8 }}>🌱</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Tuần này chưa có assignment</h2>
      <p style={{ color: "var(--ll-muted)", fontSize: 14, margin: 0 }}>
        Có thể bot chưa rollover, hoặc anh/chị đã hoàn thành toàn bộ training rồi.<br/>
        Admin có thể trigger thủ công qua endpoint <code>cron/weekly-rollover</code>.
      </p>
    </div>
  );
}

function CurrentAssignment(props: {
  assignmentId: number;
  status: string;
  week: string;
  slug: string;
  pathTitle: string;
  pathSubtitle?: string;
  stepProgress: number;
  completedCount: number;
  totalSteps: number;
  bestQuiz: number | null;
  passedAt: string | null;
}) {
  return (
    <div
      style={{
        background: "var(--ll-surface)",
        border: "1px solid var(--ll-green-soft)",
        borderRadius: "var(--ll-radius-lg)",
        padding: 24,
        marginBottom: 32,
        boxShadow: "var(--ll-shadow-md)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>{props.pathTitle}</h2>
          {props.pathSubtitle && (
            <p style={{ margin: 0, color: "var(--ll-muted)", fontSize: 14 }}>{props.pathSubtitle}</p>
          )}
        </div>
        <StatusBadge status={props.status} />
      </div>

      <div style={{ marginTop: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: "var(--ll-muted)" }}>
            Đã đọc: {props.completedCount}/{props.totalSteps} doc — {props.stepProgress}%
          </span>
          {props.bestQuiz !== null && (
            <span style={{ color: props.passedAt ? "var(--ll-green-dark)" : "var(--ll-muted)" }}>
              Quiz best: {Math.round(props.bestQuiz * 100)}%
            </span>
          )}
        </div>
        <div style={{ height: 8, background: "var(--ll-green-mist)", borderRadius: 999, overflow: "hidden" }}>
          <div
            style={{
              width: `${props.stepProgress}%`,
              height: "100%",
              background: "linear-gradient(90deg, var(--ll-green) 0%, var(--ll-green-bright) 100%)",
              transition: "width 300ms var(--ll-ease)",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Link
          href={`/training/${props.slug}`}
          style={{
            background: "var(--ll-green)",
            color: "white",
            padding: "10px 18px",
            borderRadius: "var(--ll-radius-sm)",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Mở training →
        </Link>
        {props.passedAt && (
          <span style={{ alignSelf: "center", color: "var(--ll-green-dark)", fontSize: 13 }}>
            ✓ Pass quiz ngày {new Date(props.passedAt).toLocaleDateString("vi-VN")}
          </span>
        )}
      </div>
    </div>
  );
}
