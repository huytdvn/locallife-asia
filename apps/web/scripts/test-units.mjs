#!/usr/bin/env node
// Unit tests — Node built-in test runner, không cần framework.
// Chạy: pnpm --filter web test

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB = path.resolve(__dirname, "..", "..", "..", "knowledge");

function tokenize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function canRead(role, m) {
  if (m.status === "deprecated") return false;
  if (m.status === "draft" && role === "employee") return false;
  const allowed =
    role === "admin"
      ? ["employee", "lead", "admin"]
      : role === "lead"
        ? ["employee", "lead"]
        : ["employee"];
  if (!m.audience.some((a) => allowed.includes(a))) return false;
  if (m.sensitivity === "restricted" && role === "employee") return false;
  return true;
}

test("tokenize: strips Vietnamese diacritics", () => {
  const t = tokenize("Làm sao xin nghỉ phép?");
  assert.ok(t.includes("nghi"));
  assert.ok(t.includes("phep"));
  assert.ok(!t.some((w) => w.includes("ế")));
});

test("tokenize: splits on non-alphanumeric", () => {
  const t = tokenize("a-b_c,d.e");
  assert.deepEqual(t.sort(), ["a", "b", "c", "d", "e"].sort().filter((x) => x.length >= 2));
});

test("rbac: admin sees restricted, employee doesn't", () => {
  const finance = {
    status: "approved",
    audience: ["admin"],
    sensitivity: "restricted",
  };
  assert.equal(canRead("admin", finance), true);
  assert.equal(canRead("employee", finance), false);
});

test("rbac: draft hidden from employee", () => {
  const draft = { status: "draft", audience: ["employee"], sensitivity: "internal" };
  assert.equal(canRead("employee", draft), false);
  assert.equal(canRead("lead", draft), true);
});

test("rbac: deprecated hidden from all", () => {
  const dep = { status: "deprecated", audience: ["employee", "admin"], sensitivity: "public" };
  assert.equal(canRead("admin", dep), false);
});

test("knowledge loader: all seed docs parse with valid FM", () => {
  const files = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(".md") && !p.endsWith("README.md")) files.push(p);
    }
  }
  walk(KB);
  assert.ok(files.length >= 10, `expected >= 10 seed docs, got ${files.length}`);
  for (const f of files) {
    const parsed = matter(fs.readFileSync(f, "utf8"));
    assert.ok(parsed.data.id, `${f} missing id`);
    assert.ok(parsed.data.title, `${f} missing title`);
    assert.ok(Array.isArray(parsed.data.audience), `${f} audience not array`);
    assert.ok(["public", "internal", "restricted"].includes(parsed.data.sensitivity), f);
  }
});
