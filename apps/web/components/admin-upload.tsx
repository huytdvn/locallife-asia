"use client";

import { useState } from "react";

type UploadResult = {
  status: string;
  job_id?: string;
  local_path?: string;
  drive_file_id?: string;
};

export function AdminUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [owner, setOwner] = useState("");
  const [sensitivity, setSensitivity] = useState("internal");
  const [audience, setAudience] = useState("employee");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [jobs, setJobs] = useState<Array<UploadResult & { ts: string }>>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !owner) return;
    setBusy(true);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("owner", owner);
    fd.append("suggested_sensitivity", sensitivity);
    fd.append(
      "suggested_audience",
      JSON.stringify([audience]) // MVP: 1 audience
    );
    fd.append(
      "tags",
      JSON.stringify(
        tags.split(",").map((t) => t.trim()).filter(Boolean)
      )
    );
    if (note) fd.append("note", note);

    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data: UploadResult = await res.json();
      setJobs((js) => [{ ...data, ts: new Date().toISOString() }, ...js]);
      setFile(null);
    } catch (err) {
      alert(`Lỗi: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form
        onSubmit={submit}
        style={{
          background: "white",
          border: "1px solid var(--ll-border)",
          padding: 20,
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
        <input
          type="email"
          placeholder="owner@locallife.asia"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          required
          style={{ padding: 8 }}
        />
        <div style={{ display: "flex", gap: 12 }}>
          <label>
            Audience
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              style={{ marginLeft: 8, padding: 6 }}
            >
              <option value="employee">employee</option>
              <option value="lead">lead</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label>
            Sensitivity
            <select
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value)}
              style={{ marginLeft: 8, padding: 6 }}
            >
              <option value="public">public</option>
              <option value="internal">internal</option>
              <option value="restricted">restricted</option>
            </select>
          </label>
        </div>
        <input
          placeholder="tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          style={{ padding: 8 }}
        />
        <textarea
          placeholder="Note cho AI (tuỳ chọn)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          style={{ padding: 8, fontFamily: "inherit" }}
        />
        <button
          type="submit"
          disabled={busy || !file || !owner}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "var(--ll-green)",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {busy ? "Đang upload..." : "Upload"}
        </button>
      </form>

      {jobs.length > 0 && (
        <div>
          <h3>Job gần đây</h3>
          <ul>
            {jobs.map((j, i) => (
              <li key={i}>
                <code>{j.job_id ?? "?"}</code> — {j.status}
                {j.drive_file_id && ` (Drive: ${j.drive_file_id.slice(0, 8)}…)`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
