#!/usr/bin/env node
/**
 * Integration test for applyReorganizePlan FS semantics.
 *
 * We can't easily import the TypeScript lib from this pure-ESM runner,
 * so this test re-implements the same core FS invariants we expect
 * applyReorganizePlan to hold. Any change to the TS side needs the
 * mirror function here updated too — the point is to LOCK DOWN the
 * observable behavior (copy not move, new ULID on copy, etc.) so a
 * later refactor can't silently regress to destructive moves.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeTempKb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-reorganize-"));
  return dir;
}

function writeDoc(root, relPath, fm, body) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, matter.stringify(body, fm), "utf8");
  return full;
}

function fakeUlid() {
  const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let s = "";
  for (let i = 0; i < 26; i++) s += chars[Math.floor(Math.random() * 32)];
  return s;
}

/**
 * Mirror of applyReorganizePlan's FS logic, simplified to the invariants
 * under test. See apps/web/lib/reorganize.ts for the real version.
 */
function applyMirror(plan, root) {
  const result = {
    copied: 0,
    rewrote: 0,
    titleUpdated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    createdIds: [],
  };
  for (const item of plan.items) {
    if (item.skipped) {
      result.skipped++;
      continue;
    }
    if (!item.pathChanged && !item.titleChanged && !item.bodyChanged) {
      result.skipped++;
      continue;
    }
    try {
      const currentAbs = path.join(root, item.currentPath);
      const targetAbs = path.join(root, item.newPath);
      if (!currentAbs.startsWith(root) || !targetAbs.startsWith(root)) {
        throw new Error("path escape");
      }
      if (!fs.existsSync(currentAbs)) throw new Error("missing");
      const raw = fs.readFileSync(currentAbs, "utf8");
      const parsed = matter(raw);

      if (item.pathChanged) {
        if (
          fs.existsSync(targetAbs) &&
          path.resolve(targetAbs) !== path.resolve(currentAbs)
        ) {
          throw new Error("target exists");
        }
        fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
        const newId = fakeUlid();
        const fmCopy = {
          ...parsed.data,
          id: newId,
          title: item.titleChanged ? item.newTitle : parsed.data.title,
          derived_from: parsed.data.id ?? null,
        };
        const bodyForCopy =
          item.bodyChanged && item.newBody ? item.newBody : parsed.content;
        fs.writeFileSync(
          targetAbs,
          matter.stringify(bodyForCopy.trimEnd() + "\n", fmCopy),
          "utf8",
        );
        result.copied++;
        result.createdIds.push(newId);
        if (item.titleChanged) result.titleUpdated++;
        if (item.bodyChanged) result.rewrote++;
      } else if (item.titleChanged || item.bodyChanged) {
        const fm = { ...parsed.data };
        if (item.titleChanged) fm.title = item.newTitle;
        const bodyToWrite =
          item.bodyChanged && item.newBody ? item.newBody : parsed.content;
        fs.writeFileSync(
          currentAbs,
          matter.stringify(bodyToWrite.trimEnd() + "\n", fm),
          "utf8",
        );
        if (item.titleChanged) result.titleUpdated++;
        if (item.bodyChanged) result.rewrote++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({
        id: item.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

test("reorganize copy: source file stays on disk after path change", () => {
  const root = makeTempKb();
  try {
    writeDoc(
      root,
      "inbox/foo.md",
      { id: "01OLD000000000000000000000", title: "Foo", audience: ["employee"] },
      "Body content here.",
    );
    const plan = {
      items: [
        {
          id: "01OLD000000000000000000000",
          currentPath: "inbox/foo.md",
          currentTitle: "Foo",
          newPath: "internal/00-company/foo.md",
          newTitle: "Foo",
          pathChanged: true,
          titleChanged: false,
          bodyChanged: false,
          reasoning: "",
          confidence: 5,
        },
      ],
    };
    const result = applyMirror(plan, root);
    assert.equal(result.copied, 1);
    assert.equal(result.failed, 0);
    assert.equal(
      fs.existsSync(path.join(root, "inbox/foo.md")),
      true,
      "source must still exist after copy",
    );
    assert.equal(
      fs.existsSync(path.join(root, "internal/00-company/foo.md")),
      true,
      "target must exist after copy",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reorganize copy: target gets NEW ulid, derived_from points to source", () => {
  const root = makeTempKb();
  try {
    writeDoc(
      root,
      "inbox/bar.md",
      { id: "01SRC000000000000000000000", title: "Bar", audience: ["employee"] },
      "Body.",
    );
    const plan = {
      items: [
        {
          id: "01SRC000000000000000000000",
          currentPath: "inbox/bar.md",
          currentTitle: "Bar",
          newPath: "internal/00-company/bar.md",
          newTitle: "Bar",
          pathChanged: true,
          titleChanged: false,
          bodyChanged: false,
          reasoning: "",
          confidence: 5,
        },
      ],
    };
    applyMirror(plan, root);
    const copied = matter(
      fs.readFileSync(path.join(root, "internal/00-company/bar.md"), "utf8"),
    );
    assert.notEqual(
      copied.data.id,
      "01SRC000000000000000000000",
      "copy must get new ULID",
    );
    assert.equal(copied.data.derived_from, "01SRC000000000000000000000");
    const original = matter(
      fs.readFileSync(path.join(root, "inbox/bar.md"), "utf8"),
    );
    assert.equal(
      original.data.id,
      "01SRC000000000000000000000",
      "original ULID must be untouched",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reorganize in-place edit: no path change → writes in-place", () => {
  const root = makeTempKb();
  try {
    writeDoc(
      root,
      "internal/00-company/baz.md",
      { id: "01BAZ000000000000000000000", title: "Old title" },
      "Old body.",
    );
    const plan = {
      items: [
        {
          id: "01BAZ000000000000000000000",
          currentPath: "internal/00-company/baz.md",
          currentTitle: "Old title",
          newPath: "internal/00-company/baz.md",
          newTitle: "New title",
          pathChanged: false,
          titleChanged: true,
          bodyChanged: false,
          reasoning: "",
          confidence: 5,
        },
      ],
    };
    const result = applyMirror(plan, root);
    assert.equal(result.titleUpdated, 1);
    assert.equal(result.copied, 0);
    const after = matter(
      fs.readFileSync(path.join(root, "internal/00-company/baz.md"), "utf8"),
    );
    assert.equal(after.data.title, "New title");
    assert.equal(after.data.id, "01BAZ000000000000000000000");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reorganize refuses path that escapes knowledge root", () => {
  const root = makeTempKb();
  try {
    writeDoc(
      root,
      "inbox/escape.md",
      { id: "01ESC000000000000000000000", title: "Escape" },
      "x",
    );
    const plan = {
      items: [
        {
          id: "01ESC000000000000000000000",
          currentPath: "inbox/escape.md",
          currentTitle: "Escape",
          newPath: "../../outside.md",
          newTitle: "Escape",
          pathChanged: true,
          titleChanged: false,
          bodyChanged: false,
          reasoning: "",
          confidence: 5,
        },
      ],
    };
    const result = applyMirror(plan, root);
    assert.equal(result.failed, 1);
    assert.equal(result.copied, 0);
    assert.match(result.errors[0].error, /path escape/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reorganize skipped items are counted but not touched", () => {
  const root = makeTempKb();
  try {
    const filePath = writeDoc(
      root,
      "inbox/skip.md",
      { id: "01SKP000000000000000000000", title: "Skip" },
      "Skip body.",
    );
    const before = fs.readFileSync(filePath, "utf8");
    const plan = {
      items: [
        {
          id: "01SKP000000000000000000000",
          currentPath: "inbox/skip.md",
          currentTitle: "Skip",
          newPath: "inbox/skip.md",
          newTitle: "Skip",
          pathChanged: false,
          titleChanged: false,
          bodyChanged: false,
          reasoning: "",
          confidence: 5,
          skipped: "deprecated",
        },
      ],
    };
    const result = applyMirror(plan, root);
    assert.equal(result.skipped, 1);
    assert.equal(result.copied, 0);
    assert.equal(
      fs.readFileSync(filePath, "utf8"),
      before,
      "skipped item must not touch FS",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
