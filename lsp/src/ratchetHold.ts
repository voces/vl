// The editor's half of the per-file ratchets (CLAUDE.md §Gates). Five committed
// baselines hold a per-file count for ten lint codes, and the gate's rule is that a
// file's count may only FALL. The editor's rule was different: every finding was a
// live diagnostic, so `compiler/typecheck.vl` opened with 213 Problems that no gate
// asks anyone to fix. This makes the two rules ONE — quiet while the debt is held,
// loud the moment a file adds to it.
//
// It is presentation only. `vl check --severity info` is unchanged, because the
// ratchet scripts read the CLI and its output is graded byte-for-byte elsewhere.

import { readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { VLDiagnostic } from "../../compiler/diagnostics.ts";

/**
 * A ratcheted code: the baseline file that holds its per-file counts, and the trees
 * that baseline was measured over.
 *
 * THE TREES ARE PART OF THE SCOPE, not decoration. `comment-budget.py` walks
 * `compiler/` only (a std comment is graded by `std-comment-audience` instead), and
 * `scan-budget.py` walks `compiler/` and `std/`. Holding a code for a file its own
 * ratchet never reads would report "+N over baseline" for a baseline that does not
 * cover it. `tests/lsp_ratchet_hold_test.ts` re-derives this table from the scripts
 * and fails on drift.
 */
export type RatchetScope = {
  /** The baseline file, relative to the workspace root. */
  readonly baseline: string;
  /** Workspace-relative directory prefixes the baseline was measured over. */
  readonly trees: readonly string[];
};

const COMPILER_ONLY = ["compiler/"] as const;

export const RATCHET_CODES: ReadonlyMap<string, RatchetScope> = new Map([
  ["kind-ladder-incomplete", {
    baseline: "scripts/ladder-budget-baseline.json",
    trees: COMPILER_ONLY,
  }],
  ["kind-ladder-split", {
    baseline: "scripts/ladder-budget-baseline.json",
    trees: COMPILER_ONLY,
  }],
  ["sentinel-index-unguarded", {
    baseline: "scripts/sentinel-budget-baseline.json",
    trees: COMPILER_ONLY,
  }],
  ["sentinel-index-strict-untested", {
    baseline: "scripts/sentinel-budget-baseline.json",
    trees: COMPILER_ONLY,
  }],
  ["arena-scan-outside-pass", {
    baseline: "scripts/scan-budget-baseline.json",
    trees: ["compiler/", "std/"],
  }],
  ["comment-block-too-long", {
    baseline: "scripts/comment-budget-baseline.json",
    trees: COMPILER_ONLY,
  }],
  ["comment-measurement-uncited", {
    baseline: "scripts/comment-budget-baseline.json",
    trees: COMPILER_ONLY,
  }],
  ["comment-shouting", {
    baseline: "scripts/comment-budget-baseline.json",
    trees: COMPILER_ONLY,
  }],
  ["comment-history", {
    baseline: "scripts/comment-budget-baseline.json",
    trees: COMPILER_ONLY,
  }],
  ["dead-export", {
    baseline: "scripts/export-budget-baseline.json",
    trees: COMPILER_ONLY,
  }],
]);

/** One workspace's loaded baselines, plus the stamp they were read at. */
type Loaded = {
  /** `<workspace-relative file>` → `<code>` → count. */
  readonly counts: Map<string, Map<string, number>>;
  /** The codes whose baseline file was present and parsed. */
  readonly present: Set<string>;
  /** `mtimeMs:size` per baseline file, joined — the freshness key. */
  readonly stamp: string;
};

const cache = new Map<string, Loaded>();

/**
 * Drop every cached baseline. The workspace pass already bumps the checker's reader
 * generation because it is the one place that sees the tree change underneath an open
 * buffer (a branch switch, another editor); a baseline JSON changes the same way, so
 * it is retired at the same moment.
 */
export const invalidateRatchetBaselines = (): void => {
  cache.clear();
};

/** The distinct baseline files, in a stable order. */
const baselineFiles = (): string[] =>
  [...new Set([...RATCHET_CODES.values()].map((s) => s.baseline))].sort();

/**
 * `mtimeMs:size` for every baseline file. A file that is absent contributes `-`, so
 * one appearing or disappearing moves the stamp too.
 */
const stampOf = (root: string): string =>
  baselineFiles().map((rel) => {
    try {
      const st = statSync(join(root, rel));
      return `${rel}=${st.mtimeMs}:${st.size}`;
    } catch {
      return `${rel}=-`;
    }
  }).join("|");

/**
 * Read the five baselines under `root`. A file that is absent or unparseable leaves
 * its codes OUT of `present`, which means "not ratcheted here" — the diagnostics then
 * publish exactly as they did before this module existed, which is what a workspace
 * that is not this repo should see.
 */
const load = (root: string): Loaded => {
  const counts = new Map<string, Map<string, number>>();
  const present = new Set<string>();
  for (const [code, scope] of RATCHET_CODES) {
    let parsed: { files?: Record<string, Record<string, number>> };
    try {
      parsed = JSON.parse(readFileSync(join(root, scope.baseline), "utf8"));
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    present.add(code);
    for (const [file, byCode] of Object.entries(parsed.files ?? {})) {
      const n = byCode?.[code];
      if (typeof n !== "number") continue;
      let row = counts.get(file);
      if (row === undefined) {
        row = new Map();
        counts.set(file, row);
      }
      row.set(code, n);
    }
  }
  return { counts, present, stamp: stampOf(root) };
};

const baselines = (root: string): Loaded => {
  const hit = cache.get(root);
  if (hit !== undefined && hit.stamp === stampOf(root)) return hit;
  const fresh = load(root);
  cache.set(root, fresh);
  return fresh;
};

/**
 * `filePath` as the baselines spell it: relative to `root`, forward slashes. Returns
 * undefined when the file is outside the workspace, which no baseline row can name.
 */
export const workspaceRelative = (
  root: string,
  filePath: string,
): string | undefined => {
  const rel = relative(root, filePath);
  if (rel.length === 0 || rel.startsWith("..")) return undefined;
  return sep === "/" ? rel : rel.split(sep).join("/");
};

/** Whether `rel` sits under one of the trees `scope` was measured over. */
const inScope = (scope: RatchetScope, rel: string): boolean =>
  scope.trees.some((t) => rel.startsWith(t));

/**
 * Re-grade `diagnostics` against the committed baselines.
 *
 * Per ratcheted code, over the findings THIS file carries for it: at or below its
 * baseline row the file is holding debt the gate already accepts, so the findings are
 * dropped (or, with `showHeld`, kept as greyed hints). Above it, EVERY one of that
 * code's findings publishes as a warning prefixed with how far over the file is —
 * the count is a per-file number, so the author is told what they added, not which
 * individual finding is new (the ratchet cannot know that either).
 *
 * A file with no baseline row has baseline 0, so a first finding in a new file is
 * loud. Every other code, and every workspace with no baselines, is untouched.
 */
export const applyRatchetHold = (
  diagnostics: readonly VLDiagnostic[],
  filePath: string,
  root: string | undefined,
  showHeld: boolean,
): VLDiagnostic[] => {
  if (root === undefined || root.length === 0) return [...diagnostics];
  const rel = workspaceRelative(root, filePath);
  if (rel === undefined) return [...diagnostics];
  const { counts, present } = baselines(root);
  if (present.size === 0) return [...diagnostics];

  const held = (code: string): boolean => {
    const scope = RATCHET_CODES.get(code);
    return scope !== undefined && present.has(code) && inScope(scope, rel);
  };

  const seen = new Map<string, number>();
  for (const d of diagnostics) {
    const code = typeof d.code === "string" ? d.code : undefined;
    if (code !== undefined && held(code)) {
      seen.set(code, (seen.get(code) ?? 0) + 1);
    }
  }
  if (seen.size === 0) return [...diagnostics];

  const over = new Map<string, number>();
  for (const [code, n] of seen) {
    const base = counts.get(rel)?.get(code) ?? 0;
    if (n > base) over.set(code, n - base);
  }

  const out: VLDiagnostic[] = [];
  for (const d of diagnostics) {
    const code = typeof d.code === "string" ? d.code : undefined;
    if (code === undefined || !held(code)) {
      out.push(d);
      continue;
    }
    const excess = over.get(code);
    if (excess !== undefined) {
      out.push({
        ...d,
        severity: "warning",
        message: `+${excess} over baseline: ${d.message}`,
      });
      continue;
    }
    if (showHeld) {
      out.push({ ...d, severity: "hint", tags: ["unnecessary"] });
    }
  }
  return out;
};
