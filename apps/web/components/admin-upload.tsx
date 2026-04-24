"use client";

import { useRef, useState } from "react";
import { TAXONOMY, type ZoneKey, getZone } from "@/lib/taxonomy";

type SimilarMatch = {
  id: string;
  title: string;
  path: string;
  similarity: number;
  reason: string;
};

type UploadResult = {
  status: string;
  job_id?: string;
  local_path?: string;
  drive_file_id?: string | null;
  ulid?: string;
  dedup_status?: string;
  existing_doc_path?: string | null;
  similar_matches?: SimilarMatch[];
  error?: string;
  detail?: string;
  hint?: string;
};

type JobRow = UploadResult & {
  ts: string;
  filename: string;
  stage?: string;
  result?: Record<string, unknown>;
  error_detail?: string;
};

const AUDIENCE_OPTIONS = ["employee", "lead", "admin", "host", "lok", "guest"] as const;

type Mode = "single" | "multi" | "folder";

type QueuedFile = {
  file: File;
  relativePath: string; // webkitRelativePath (hoặc file.name)
  state: "pending" | "uploading" | "done" | "skipped" | "error";
  msg?: string;
};

export function AdminUpload() {
  const [mode, setMode] = useState<Mode>("single");
  const [queue, setQueue] = useState<QueuedFile[]>([]);

  const [owner, setOwner] = useState("");
  const [sensitivity, setSensitivity] = useState("internal");
  const [audience, setAudience] = useState<Set<string>>(new Set(["employee"]));
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");

  const [autoClassify, setAutoClassify] = useState(true);
  const [zoneKey, setZoneKey] = useState<ZoneKey>("internal");
  const [deptKey, setDeptKey] = useState("00-company");
  const [subfolder, setSubfolder] = useState("");

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<
    | { kind: "ok" | "err" | "warn"; msg: string }
    | null
  >(null);
  const [pendingSimilar, setPendingSimilar] = useState<{
    matches: SimilarMatch[];
    formData: FormData;
    filename: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const zoneDef = getZone(zoneKey)!;
  const deptDef = zoneDef.depts.find((d) => d.key === deptKey) ?? zoneDef.depts[0];

  function toggleAudience(a: string) {
    const next = new Set(audience);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    if (next.size === 0) next.add("employee");
    setAudience(next);
  }

  // Cap to protect Gemini quota + avoid a 10k-file folder drop tying up
  // the server for hours. Admin can run multiple smaller batches if
  // they genuinely have more.
  const MAX_BATCH = 500;

  function acceptFiles(fl: FileList | null) {
    if (!fl) return;
    const arr: QueuedFile[] = [];
    let skippedSystem = 0;
    for (const f of Array.from(fl)) {
      // Skip macOS / hidden noise
      if (f.name.startsWith(".")) {
        skippedSystem++;
        continue;
      }
      const anyF = f as unknown as { webkitRelativePath?: string };
      const rel = anyF.webkitRelativePath || f.name;
      arr.push({ file: f, relativePath: rel, state: "pending" });
    }
    if (arr.length > MAX_BATCH) {
      const trimmed = arr.slice(0, MAX_BATCH);
      setToast({
        kind: "warn",
        msg: `Giới hạn ${MAX_BATCH} file/lần. Đã lấy ${MAX_BATCH} đầu, bỏ ${arr.length - MAX_BATCH} còn lại. Chạy lại sau để xử lý phần còn lại.`,
      });
      setQueue(trimmed);
      return;
    }
    if (skippedSystem > 0) {
      setToast({
        kind: "warn",
        msg: `Bỏ qua ${skippedSystem} file hệ thống (.DS_Store, v.v.).`,
      });
    }
    setQueue(arr);
  }

  function clearQueue() {
    setQueue([]);
    if (fileRef.current) fileRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
    if (multiRef.current) multiRef.current.value = "";
  }

  async function pollJob(jobId: string) {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/admin/jobs/${jobId}`);
        if (!res.ok) continue;
        const data = (await res.json()) as {
          status: string;
          result?: Record<string, unknown>;
          error?: string;
        };
        setJobs((js) =>
          js.map((j) =>
            j.job_id === jobId
              ? {
                  ...j,
                  stage: data.status,
                  result: data.result,
                  error_detail: data.error ?? undefined,
                }
              : j
          )
        );
        if (["finished", "failed"].includes(data.status)) return;
      } catch {
        // ignore
      }
    }
  }

  function buildFormData(qf: QueuedFile, force: boolean): FormData {
    const fd = new FormData();
    fd.append("file", qf.file);
    fd.append("owner", owner);
    fd.append("suggested_sensitivity", sensitivity);
    fd.append("suggested_audience", JSON.stringify([...audience]));
    fd.append(
      "tags",
      JSON.stringify(tags.split(",").map((t) => t.trim()).filter(Boolean))
    );
    if (note) fd.append("note", note);
    // Folder hint: nếu có relative path thì gửi kèm để backend có context zone
    if (qf.relativePath && qf.relativePath !== qf.file.name) {
      fd.append("folder_hint", qf.relativePath);
    }
    if (!autoClassify) {
      fd.append("target_zone", zoneKey);
      fd.append("target_dept", deptKey);
      if (subfolder) fd.append("target_subfolder", subfolder);
    }
    if (force) fd.append("force", "true");
    return fd;
  }

  async function uploadOne(
    qf: QueuedFile,
    idx: number,
    force = false
  ): Promise<"done" | "skipped" | "error" | "pending-review"> {
    setQueue((q) =>
      q.map((x, i) => (i === idx ? { ...x, state: "uploading" } : x))
    );
    try {
      const fd = buildFormData(qf, force);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: fd,
      });
      const data: UploadResult = await res.json();
      const filename = qf.relativePath;

      if (res.status === 409 && data.similar_matches?.length) {
        // Trong batch mode: auto-skip (không chặn toàn bộ queue)
        if (queue.length > 1) {
          setQueue((q) =>
            q.map((x, i) =>
              i === idx
                ? {
                    ...x,
                    state: "skipped",
                    msg: `trùng ${data.similar_matches?.length} doc`,
                  }
                : x
            )
          );
          return "skipped";
        }
        setPendingSimilar({
          matches: data.similar_matches,
          formData: fd,
          filename,
        });
        setToast({
          kind: "warn",
          msg: `AI phát hiện ${data.similar_matches.length} tài liệu tương tự — review trước khi upload`,
        });
        setQueue((q) =>
          q.map((x, i) =>
            i === idx
              ? { ...x, state: "pending", msg: "chờ review" }
              : x
          )
        );
        return "pending-review";
      }

      if (!res.ok) {
        setQueue((q) =>
          q.map((x, i) =>
            i === idx
              ? { ...x, state: "error", msg: data.error ?? String(res.status) }
              : x
          )
        );
        setJobs((js) => [
          { ...data, filename, ts: new Date().toISOString(), stage: "failed" },
          ...js,
        ]);
        return "error";
      }

      if (data.dedup_status === "duplicate" || data.dedup_status === "in-flight") {
        setQueue((q) =>
          q.map((x, i) =>
            i === idx
              ? {
                  ...x,
                  state: "skipped",
                  msg: `đã tồn tại: ${data.existing_doc_path ?? "?"}`,
                }
              : x
          )
        );
        return "skipped";
      }

      setQueue((q) =>
        q.map((x, i) => (i === idx ? { ...x, state: "done" } : x))
      );
      setJobs((js) => [
        { ...data, filename, ts: new Date().toISOString(), stage: "queued" },
        ...js,
      ]);
      if (data.job_id) pollJob(data.job_id);
      return "done";
    } catch (err) {
      setQueue((q) =>
        q.map((x, i) =>
          i === idx ? { ...x, state: "error", msg: String(err) } : x
        )
      );
      return "error";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (queue.length === 0 || !owner) return;
    setBusy(true);
    setToast(null);
    let ok = 0;
    let skip = 0;
    let err = 0;
    for (let i = 0; i < queue.length; i++) {
      const r = await uploadOne(queue[i], i);
      if (r === "done") ok++;
      else if (r === "skipped") skip++;
      else if (r === "error") err++;
    }
    if (queue.length > 1) {
      setToast({
        kind: err === 0 ? "ok" : "warn",
        msg: `Batch xong: ${ok} uploaded · ${skip} skipped · ${err} failed`,
      });
    } else if (ok === 1) {
      setToast({ kind: "ok", msg: `Đã nạp "${queue[0].relativePath}"` });
    }
    setBusy(false);
  }

  async function forceUploadAnyway() {
    if (!pendingSimilar) return;
    const idx = queue.findIndex((q) => q.relativePath === pendingSimilar.filename);
    if (idx < 0) return;
    setBusy(true);
    const r = await uploadOne(queue[idx], idx, true);
    if (r === "done") {
      setToast({ kind: "ok", msg: "Upload thành công" });
      setPendingSimilar(null);
    }
    setBusy(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const fl = e.dataTransfer.files;
    if (fl?.length) acceptFiles(fl);
  }

  function triggerPicker() {
    if (mode === "single") fileRef.current?.click();
    else if (mode === "multi") multiRef.current?.click();
    else folderRef.current?.click();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      {pendingSimilar && (
        <SimilarWarning
          matches={pendingSimilar.matches}
          filename={pendingSimilar.filename}
          onDiscard={() => setPendingSimilar(null)}
          onForce={forceUploadAnyway}
        />
      )}

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Mode picker */}
        <div
          role="tablist"
          style={{
            display: "flex",
            gap: 6,
            background: "var(--ll-surface-soft)",
            padding: 4,
            borderRadius: 10,
            border: "1px solid var(--ll-border)",
            alignSelf: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <ModeTab
            label="Một file"
            active={mode === "single"}
            onClick={() => {
              setMode("single");
              clearQueue();
            }}
          />
          <ModeTab
            label="Nhiều file"
            active={mode === "multi"}
            onClick={() => {
              setMode("multi");
              clearQueue();
            }}
          />
          <ModeTab
            label="Cả thư mục"
            active={mode === "folder"}
            onClick={() => {
              setMode("folder");
              clearQueue();
            }}
          />
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={(e) => {
            // Tránh double-click khi bấm vào nút bên trong
            if ((e.target as HTMLElement).tagName === "BUTTON") return;
            triggerPicker();
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "28px 16px",
            borderRadius: "var(--ll-radius-md)",
            border: `2px dashed ${dragOver ? "var(--ll-green)" : "var(--ll-border)"}`,
            background: dragOver
              ? "var(--ll-green-soft)"
              : queue.length > 0
                ? "var(--ll-surface-soft)"
                : "white",
            cursor: "pointer",
            transition: "all 120ms var(--ll-ease)",
            textAlign: "center",
          }}
        >
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => acceptFiles(e.target.files)}
            style={{ display: "none" }}
            accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.md,.txt"
          />
          <input
            ref={multiRef}
            type="file"
            multiple
            onChange={(e) => acceptFiles(e.target.files)}
            style={{ display: "none" }}
            accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.md,.txt"
          />
          <input
            ref={folderRef}
            type="file"
            multiple
            onChange={(e) => acceptFiles(e.target.files)}
            style={{ display: "none" }}
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          />

          {queue.length > 0 ? (
            <>
              <div style={{ fontWeight: 600, color: "var(--ll-green-dark)" }}>
                {queue.length === 1
                  ? queue[0].relativePath
                  : `${queue.length} file đã chọn`}
              </div>
              <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                Tổng {(queue.reduce((s, q) => s + q.file.size, 0) / 1024).toFixed(1)}{" "}
                KB · Click để chọn lại
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, color: "var(--ll-ink)" }}>
                {mode === "folder"
                  ? "Chọn thư mục — AI giữ cấu trúc cây thư mục để gợi ý zone"
                  : mode === "multi"
                    ? "Kéo thả hoặc chọn nhiều file cùng lúc"
                    : "Kéo thả file vào đây hoặc click để chọn"}
              </div>
              <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                PDF · DOCX · XLSX · CSV · PNG/JPG · Markdown
              </div>
            </>
          )}
        </label>

        {queue.length > 1 && (
          <QueuePreview queue={queue} onClear={clearQueue} />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Owner email" required>
            <input
              type="email"
              placeholder="ops@locallife.asia"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              required
              style={inputStyle}
            />
          </Field>
          <Field label="Mức nhạy cảm">
            <select
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value)}
              style={inputStyle}
            >
              <option value="public">Công khai</option>
              <option value="internal">Nội bộ</option>
              <option value="restricted">Hạn chế (chỉ lead/admin)</option>
            </select>
          </Field>
        </div>

        <Field label="Audience (chọn nhiều)">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {AUDIENCE_OPTIONS.map((a) => {
              const on = audience.has(a);
              return (
                <button
                  type="button"
                  key={a}
                  onClick={() => toggleAudience(a)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${on ? "var(--ll-green)" : "var(--ll-border)"}`,
                    background: on ? `var(--ll-role-${a})` : "white",
                    color: "#111",
                    cursor: "pointer",
                    fontWeight: on ? 600 : 400,
                    fontSize: 13,
                    textTransform: "capitalize",
                  }}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </Field>

        <section
          style={{
            padding: 16,
            borderRadius: 10,
            border: "1px solid var(--ll-border)",
            background: autoClassify ? "white" : "var(--ll-green-soft)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="classify-mode"
                checked={autoClassify}
                onChange={() => setAutoClassify(true)}
              />
              <strong>AI tự phân loại</strong>
              <span style={{ color: "var(--ll-muted)" }}>
                (Gemini đọc nội dung → chọn zone/dept)
              </span>
            </label>
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="classify-mode"
                checked={!autoClassify}
                onChange={() => setAutoClassify(false)}
              />
              <strong>Chỉ định nhánh thủ công</strong>
              <span style={{ color: "var(--ll-muted)" }}>(bỏ qua AI classify)</span>
            </label>
          </div>

          {!autoClassify && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <Field label="Zone">
                <select
                  value={zoneKey}
                  onChange={(e) => {
                    const z = e.target.value as ZoneKey;
                    setZoneKey(z);
                    const newZone = getZone(z)!;
                    setDeptKey(newZone.depts[0].key);
                    setSubfolder("");
                  }}
                  style={inputStyle}
                >
                  {TAXONOMY.map((z) => (
                    <option key={z.key} value={z.key}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Dept">
                <select
                  value={deptKey}
                  onChange={(e) => {
                    setDeptKey(e.target.value);
                    setSubfolder("");
                  }}
                  style={inputStyle}
                >
                  {zoneDef.depts.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subfolder (tuỳ chọn)">
                {deptDef.subfolders.length > 0 ? (
                  <select
                    value={subfolder}
                    onChange={(e) => setSubfolder(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">(không)</option>
                    {deptDef.subfolders.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    disabled
                    value="(không có subfolder cho dept này)"
                    style={{ ...inputStyle, color: "var(--ll-muted)" }}
                  />
                )}
              </Field>
              <div
                style={{
                  gridColumn: "1 / -1",
                  fontSize: 12,
                  color: "var(--ll-muted)",
                  fontFamily: "monospace",
                }}
              >
                Target: <strong>{zoneKey}/{deptKey}{subfolder ? "/" + subfolder : ""}/</strong>
              </div>
            </div>
          )}
        </section>

        <Field label="Tags (cách nhau dấu phẩy)">
          <input
            placeholder="onboarding, homestay, partner"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Ghi chú cho AI (tuỳ chọn)">
          <textarea
            placeholder="Ví dụ: Đây là bản v3, thay v2 từ 12/2025"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
          />
        </Field>

        <button
          type="submit"
          disabled={busy || queue.length === 0 || !owner}
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            background:
              busy || queue.length === 0 || !owner
                ? "var(--ll-muted)"
                : "var(--ll-green)",
            color: "white",
            fontWeight: 600,
            fontSize: 15,
            cursor: busy || queue.length === 0 || !owner ? "not-allowed" : "pointer",
            alignSelf: "flex-start",
            boxShadow: "var(--ll-shadow-sm)",
          }}
        >
          {busy
            ? "Đang xử lý…"
            : queue.length > 1
              ? `Nạp ${queue.length} file vào knowledge base`
              : "Nạp vào knowledge base"}
        </button>
      </form>

      {jobs.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <h3
            style={{
              margin: "0 0 12px",
              fontSize: 15,
              color: "var(--ll-green-dark)",
            }}
          >
            Lịch sử upload phiên này
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {jobs.map((j, i) => (
              <JobCard key={(j.job_id ?? "x") + i} job={j} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        border: "none",
        background: active ? "white" : "transparent",
        fontWeight: active ? 600 : 500,
        color: active ? "var(--ll-green-dark)" : "var(--ll-muted)",
        fontSize: 13,
        cursor: "pointer",
        boxShadow: active ? "var(--ll-shadow-sm)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function QueuePreview({
  queue,
  onClear,
}: {
  queue: QueuedFile[];
  onClear: () => void;
}) {
  return (
    <div
      style={{
        maxHeight: 220,
        overflowY: "auto",
        border: "1px solid var(--ll-border)",
        borderRadius: 8,
        background: "var(--ll-surface-soft)",
        fontSize: 12,
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid var(--ll-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "white",
          position: "sticky",
          top: 0,
        }}
      >
        <strong>{queue.length} file trong queue</strong>
        <button
          type="button"
          onClick={onClear}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--ll-muted)",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Xoá
        </button>
      </div>
      <ul style={{ margin: 0, padding: 6, listStyle: "none" }}>
        {queue.map((q, i) => (
          <li
            key={i}
            style={{
              padding: "4px 8px",
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              color:
                q.state === "done"
                  ? "var(--ll-green-dark)"
                  : q.state === "error"
                    ? "#b91c1c"
                    : q.state === "skipped"
                      ? "var(--ll-orange)"
                      : "var(--ll-ink)",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              borderBottom:
                i < queue.length - 1 ? "1px dashed var(--ll-border)" : "none",
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {ICON_STATE[q.state]} {q.relativePath}
            </span>
            <span style={{ flexShrink: 0, color: "var(--ll-muted)" }}>
              {q.msg ?? STATE_LABEL[q.state]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ICON_STATE: Record<QueuedFile["state"], string> = {
  pending: "⋯",
  uploading: "↑",
  done: "✓",
  skipped: "⊝",
  error: "✗",
};
const STATE_LABEL: Record<QueuedFile["state"], string> = {
  pending: "chờ",
  uploading: "đang upload",
  done: "xong",
  skipped: "bỏ qua",
  error: "lỗi",
};

function Toast({
  toast,
  onClose,
}: {
  toast: { kind: "ok" | "err" | "warn"; msg: string };
  onClose: () => void;
}) {
  const bg = {
    ok: "var(--ll-green-soft)",
    err: "#fef2f2",
    warn: "var(--ll-orange-soft)",
  }[toast.kind];
  const fg = {
    ok: "var(--ll-green-dark)",
    err: "#b91c1c",
    warn: "#c07600",
  }[toast.kind];
  const border = {
    ok: "var(--ll-green)",
    err: "#fca5a5",
    warn: "var(--ll-orange)",
  }[toast.kind];
  return (
    <div
      className="ll-anim-in"
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        color: fg,
        fontSize: 14,
        fontWeight: 500,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span>{toast.msg}</span>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 18,
          color: "inherit",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

function SimilarWarning({
  matches,
  filename,
  onDiscard,
  onForce,
}: {
  matches: SimilarMatch[];
  filename: string;
  onDiscard: () => void;
  onForce: () => void;
}) {
  return (
    <div
      className="ll-anim-in"
      style={{
        padding: 16,
        borderRadius: 10,
        background: "var(--ll-orange-soft)",
        border: "1px solid var(--ll-orange)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "var(--ll-orange)",
            color: "white",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          !
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: "#c07600" }}>
            AI nghi ngờ trùng lặp
          </div>
          <div style={{ fontSize: 13, color: "var(--ll-ink)" }}>
            &quot;{filename}&quot; trùng nội dung với{" "}
            <strong>{matches.length} tài liệu</strong> đã có trong KB.
          </div>
        </div>
      </div>
      <div
        style={{
          background: "white",
          borderRadius: 6,
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {matches.slice(0, 5).map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12,
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: "var(--ll-ink)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {m.title}
              </div>
              <div
                style={{
                  color: "var(--ll-muted)",
                  fontFamily: "monospace",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {m.path}
              </div>
            </div>
            <span
              style={{
                color: "var(--ll-orange)",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {Math.round(m.similarity * 100)}%
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
        <button
          type="button"
          onClick={onDiscard}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--ll-border)",
            background: "white",
            cursor: "pointer",
          }}
        >
          Huỷ upload (dùng file đã có)
        </button>
        <button
          type="button"
          onClick={onForce}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--ll-orange)",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Upload dù trùng (tôi biết mình làm gì)
        </button>
      </div>
    </div>
  );
}

function JobCard({ job }: { job: JobRow }) {
  const stage = job.stage ?? "unknown";
  const color =
    stage === "finished"
      ? "var(--ll-green)"
      : stage === "failed"
        ? "#dc2626"
        : "var(--ll-orange)";
  const label: Record<string, string> = {
    queued: "Đang chờ",
    started: "Đang phân loại…",
    finished: "Hoàn tất",
    failed: "Lỗi",
    unknown: "?",
  };
  const result = job.result as
    | { doc_id?: string; pr_url?: string; draft_path?: string; hint?: string }
    | undefined;
  return (
    <div
      className="ll-anim-in"
      style={{
        padding: 14,
        borderRadius: "var(--ll-radius-md)",
        border: "1px solid var(--ll-border)",
        background: "white",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, color: "var(--ll-ink)" }}>{job.filename}</div>
        <span
          style={{
            fontSize: 12,
            padding: "2px 10px",
            borderRadius: 999,
            background: color,
            color: "white",
            fontWeight: 600,
          }}
        >
          {label[stage] ?? stage}
        </span>
      </div>
      {result?.draft_path && (
        <div style={{ fontSize: 12, color: "var(--ll-orange)" }}>
          Draft: <code>{result.draft_path as string}</code>
        </div>
      )}
      {result?.pr_url && (
        <a href={result.pr_url as string} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
          → Mở PR
        </a>
      )}
      {job.error_detail && (
        <div
          style={{
            fontSize: 12,
            color: "#b91c1c",
            fontFamily: "monospace",
            background: "#fef2f2",
            padding: 8,
            borderRadius: 6,
            whiteSpace: "pre-wrap",
          }}
        >
          {job.error_detail.slice(0, 300)}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "var(--ll-muted)", fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: "#dc2626" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: "var(--ll-radius-sm)",
  border: "1px solid var(--ll-border)",
  fontSize: 14,
  fontFamily: "inherit",
  width: "100%",
  background: "white",
};
