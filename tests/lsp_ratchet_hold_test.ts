// THE EDITOR'S HALF OF THE PER-FILE RATCHETS (`lsp/src/ratchetHold.ts`).
//
// The gate's rule is that a file's count for a ratcheted code may only FALL. The
// editor published every finding regardless, so `compiler/typecheck.vl` opened with
// 213 Problems no gate asks anyone to fix. These tests pin the two rules to one: at or
// below its baseline a file publishes nothing for that code; above it, EVERY one of
// that code's findings publishes as a warning saying how far over the file is.
//
// No seed: `applyRatchetHold` is a pure re-grade of a diagnostic list against a
// baseline JSON, so this runs in the `ci` job's `deno task test` like any other
// pure test.

import {
  applyRatchetHold,
  invalidateRatchetBaselines,
  RATCHET_CODES,
  workspaceRelative,
} from "../lsp/src/ratchetHold.ts";
import type { VLDiagnostic } from "../compiler/diagnostics.ts";
import { ROOT } from "./support/tree.ts";

const diag = (code: string, line: number): VLDiagnostic => ({
  message: `${code} at ${line}`,
  severity: "warning",
  source: "vital",
  code,
  range: {
    start: { line, character: 2 },
    end: { line, character: 9 },
  },
});

/** A workspace holding one baseline file, written from `files`. */
const workspace = async (
  baseline: string,
  files: Record<string, Record<string, number>>,
): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_ratchet_hold_" });
  await Deno.mkdir(`${dir}/scripts`, { recursive: true });
  await Deno.mkdir(`${dir}/compiler`, { recursive: true });
  await Deno.writeTextFile(
    `${dir}/${baseline}`,
    JSON.stringify({ total: {}, files }, null, 0),
  );
  invalidateRatchetBaselines();
  return dir;
};

const LADDER = "scripts/ladder-budget-baseline.json";
const CODE = "kind-ladder-incomplete";

Deno.test("ratchet-hold: a file AT its baseline publishes nothing for that code", async () => {
  const dir = await workspace(LADDER, {
    "compiler/x.vl": { "kind-ladder-incomplete": 3, "kind-ladder-split": 0 },
  });
  const diags = [diag(CODE, 1), diag(CODE, 2), diag(CODE, 3)];
  const out = applyRatchetHold(diags, `${dir}/compiler/x.vl`, dir, false);
  if (out.length !== 0) {
    throw new Error(
      `held file: want 0 published, got ${out.length}: ` +
        JSON.stringify(out.map((d) => d.message)),
    );
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: BELOW the baseline is held too", async () => {
  const dir = await workspace(LADDER, {
    "compiler/x.vl": { "kind-ladder-incomplete": 3 },
  });
  const out = applyRatchetHold(
    [diag(CODE, 1)],
    `${dir}/compiler/x.vl`,
    dir,
    false,
  );
  if (out.length !== 0) {
    throw new Error(`below baseline: want 0 published, got ${out.length}`);
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: ONE over the baseline publishes ALL of them, prefixed", async () => {
  const dir = await workspace(LADDER, {
    "compiler/x.vl": { "kind-ladder-incomplete": 3 },
  });
  const diags = [diag(CODE, 1), diag(CODE, 2), diag(CODE, 3), diag(CODE, 4)];
  const out = applyRatchetHold(diags, `${dir}/compiler/x.vl`, dir, false);
  if (out.length !== 4) {
    throw new Error(`over baseline: want all 4 published, got ${out.length}`);
  }
  for (const d of out) {
    if (d.severity !== "warning") {
      throw new Error(`over baseline: want severity warning, got ${d.severity}`);
    }
    if (!d.message.startsWith("+1 over baseline: ")) {
      throw new Error(`over baseline: want the "+1 over baseline: " prefix, got ${d.message}`);
    }
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: the excess is the file's, not the finding's", async () => {
  const dir = await workspace(LADDER, {
    "compiler/x.vl": { "kind-ladder-incomplete": 1 },
  });
  const out = applyRatchetHold(
    [diag(CODE, 1), diag(CODE, 2), diag(CODE, 3)],
    `${dir}/compiler/x.vl`,
    dir,
    false,
  );
  if (!out.every((d) => d.message.startsWith("+2 over baseline: "))) {
    throw new Error(
      `want every message prefixed "+2 over baseline: ", got ` +
        JSON.stringify(out.map((d) => d.message)),
    );
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: a file with NO baseline row has baseline 0", async () => {
  const dir = await workspace(LADDER, {
    "compiler/other.vl": { "kind-ladder-incomplete": 40 },
  });
  const out = applyRatchetHold(
    [diag(CODE, 7)],
    `${dir}/compiler/fresh.vl`,
    dir,
    false,
  );
  if (out.length !== 1 || !out[0].message.startsWith("+1 over baseline: ")) {
    throw new Error(
      `a new file's first finding must be loud, got ${JSON.stringify(out)}`,
    );
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: showHeld turns a held finding into a greyed hint", async () => {
  const dir = await workspace(LADDER, {
    "compiler/x.vl": { "kind-ladder-incomplete": 3 },
  });
  const diags = [diag(CODE, 1), diag(CODE, 2)];
  const out = applyRatchetHold(diags, `${dir}/compiler/x.vl`, dir, true);
  if (out.length !== 2) {
    throw new Error(`showHeld: want 2 published, got ${out.length}`);
  }
  for (const d of out) {
    if (d.severity !== "hint") {
      throw new Error(`showHeld: want severity hint, got ${d.severity}`);
    }
    if (d.tags?.[0] !== "unnecessary") {
      throw new Error(`showHeld: want the unnecessary tag, got ${JSON.stringify(d.tags)}`);
    }
    if (d.message.includes("over baseline")) {
      throw new Error(`showHeld: a held finding must not carry the excess prefix: ${d.message}`);
    }
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: a NON-ratcheted code is untouched, held or not", async () => {
  const dir = await workspace(LADDER, {
    "compiler/x.vl": { "kind-ladder-incomplete": 3 },
  });
  const other = diag("unused-variable", 9);
  const out = applyRatchetHold(
    [diag(CODE, 1), other],
    `${dir}/compiler/x.vl`,
    dir,
    false,
  );
  if (out.length !== 1 || out[0].message !== other.message) {
    throw new Error(
      `an unratcheted code must pass through unchanged, got ${JSON.stringify(out)}`,
    );
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: a workspace with NO baselines is untouched", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl_ratchet_none_" });
  invalidateRatchetBaselines();
  const diags = [diag(CODE, 1), diag(CODE, 2)];
  const out = applyRatchetHold(diags, `${dir}/compiler/x.vl`, dir, false);
  if (out.length !== 2) {
    throw new Error(
      `a workspace that is not this repo must see today's behaviour, got ${out.length}`,
    );
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: a code is not held OUTSIDE the trees its ratchet walks", async () => {
  // `comment-budget.py` walks `compiler/` only; a std comment is graded by
  // `std-comment-audience`, which has no baseline. So a std file's comment findings
  // must publish as they always did, not as "+N over baseline".
  const dir = await workspace("scripts/comment-budget-baseline.json", {});
  await Deno.mkdir(`${dir}/std`, { recursive: true });
  const out = applyRatchetHold(
    [diag("comment-shouting", 1)],
    `${dir}/std/fmt.vl`,
    dir,
    false,
  );
  if (out.length !== 1 || out[0].message.includes("over baseline")) {
    throw new Error(
      `out of tree: want the finding unchanged, got ${JSON.stringify(out)}`,
    );
  }
  // The same finding IN `compiler/` is over a zero baseline and so is loud.
  const inTree = applyRatchetHold(
    [diag("comment-shouting", 1)],
    `${dir}/compiler/lint.vl`,
    dir,
    false,
  );
  if (inTree.length !== 1 || !inTree[0].message.startsWith("+1 over baseline: ")) {
    throw new Error(
      `in tree: want it loud over a zero baseline, got ${JSON.stringify(inTree)}`,
    );
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: a re-read picks up a baseline edited on disk", async () => {
  const dir = await workspace(LADDER, {
    "compiler/x.vl": { "kind-ladder-incomplete": 3 },
  });
  const diags = [diag(CODE, 1), diag(CODE, 2), diag(CODE, 3)];
  if (applyRatchetHold(diags, `${dir}/compiler/x.vl`, dir, false).length !== 0) {
    throw new Error("precondition: three findings against a baseline of 3 are held");
  }
  // Lower the baseline the way `--write-baseline` would. The cache is keyed on each
  // baseline's mtime+size, so the next call re-reads without any explicit hook.
  await Deno.writeTextFile(
    `${dir}/${LADDER}`,
    JSON.stringify({
      total: {},
      files: { "compiler/x.vl": { "kind-ladder-incomplete": 1 } },
    }),
  );
  const after = applyRatchetHold(diags, `${dir}/compiler/x.vl`, dir, false);
  if (after.length !== 3 || !after[0].message.startsWith("+2 over baseline: ")) {
    throw new Error(
      `after the edit: want 3 loud at +2, got ${JSON.stringify(after.map((d) => d.message))}`,
    );
  }
  await Deno.remove(dir, { recursive: true });
});

Deno.test("ratchet-hold: a file outside the workspace is untouched", async () => {
  const dir = await workspace(LADDER, {
    "compiler/x.vl": { "kind-ladder-incomplete": 3 },
  });
  const out = applyRatchetHold([diag(CODE, 1)], "/elsewhere/x.vl", dir, false);
  if (out.length !== 1 || out[0].message.includes("over baseline")) {
    throw new Error(`outside the workspace: want it unchanged, got ${JSON.stringify(out)}`);
  }
  if (workspaceRelative(dir, "/elsewhere/x.vl") !== undefined) {
    throw new Error("workspaceRelative must refuse a path outside the root");
  }
  await Deno.remove(dir, { recursive: true });
});

// ── the table cannot drift from the scripts ─────────────────────────────────
//
// `RATCHET_CODES` restates, in TypeScript, two facts the python ratchets own: which
// baseline file holds a code, and which trees that baseline was measured over. A tree
// that drifts one way makes the editor report "+N over baseline" for a baseline that
// does not cover the file; the other way silences a file the gate does grade. So the
// table is re-derived here from the scripts themselves.

/** `scripts/<x>-baseline.json` → the script that owns it, plus its census half. */
const OWNERS: Record<string, string[]> = {
  "scripts/ladder-budget-baseline.json": [
    "scripts/ladder-budget.py",
    "scripts/ladder-census.py",
  ],
  "scripts/sentinel-budget-baseline.json": [
    "scripts/sentinel-budget.py",
    "scripts/sentinel-census.py",
  ],
  "scripts/scan-budget-baseline.json": ["scripts/scan-budget.py"],
  "scripts/comment-budget-baseline.json": ["scripts/comment-budget.py"],
  "scripts/export-budget-baseline.json": ["scripts/export-budget.py"],
};

/**
 * The trees a ratchet DECLARES over its own sources: a `TREES = (...)` tuple where it
 * has one, else every `os.path.join(ROOT|root, "<dir>")` its walk opens. `CORPUS` (the
 * dirs export-budget searches for REFERENCES) is deliberately not read — a reference
 * is not a declaration, and only the declaration side is baselined.
 */
const declaredTrees = (scripts: string[]): Set<string> => {
  const out = new Set<string>();
  for (const rel of scripts) {
    const src = Deno.readTextFileSync(`${ROOT}/${rel}`);
    const tuple = /^TREES\s*=\s*\(([^)]*)\)/m.exec(src);
    if (tuple !== null) {
      for (const m of tuple[1].matchAll(/"([^"]+)"/g)) out.add(m[1]);
      continue;
    }
    for (const m of src.matchAll(/os\.path\.join\((?:ROOT|root),\s*"([^"]+)"\)/g)) {
      out.add(m[1]);
    }
  }
  return out;
};

Deno.test("ratchet-hold: every code's baseline file exists and is the one the script writes", () => {
  for (const [code, scope] of RATCHET_CODES) {
    if (OWNERS[scope.baseline] === undefined) {
      throw new Error(`${code}: no owning script known for ${scope.baseline}`);
    }
    const owner = OWNERS[scope.baseline][0];
    const src = Deno.readTextFileSync(`${ROOT}/${owner}`);
    const name = scope.baseline.replace("scripts/", "");
    if (!src.includes(`"${name}"`)) {
      throw new Error(
        `${code}: ${owner} does not name ${name} — the baseline this code is held ` +
          `against is not the one that script writes`,
      );
    }
  }
});

Deno.test("ratchet-hold: every code's trees match the ratchet that owns it", () => {
  for (const [code, scope] of RATCHET_CODES) {
    const want = declaredTrees(OWNERS[scope.baseline]);
    const got = new Set(scope.trees.map((t) => t.replace(/\/$/, "")));
    const missing = [...want].filter((t) => !got.has(t));
    const extra = [...got].filter((t) => !want.has(t));
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `${code}: RATCHET_CODES says trees ${JSON.stringify([...got])}, but ` +
          `${OWNERS[scope.baseline].join(" + ")} walks ${JSON.stringify([...want])}` +
          ` (missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)})`,
      );
    }
  }
});

Deno.test("ratchet-hold: every code the scripts gate on is in the table", () => {
  // The scripts' own code constants, so a sixth code added to a ratchet cannot land
  // with the editor still publishing it as a live problem.
  const declared = new Set<string>();
  for (const scripts of Object.values(OWNERS)) {
    const src = Deno.readTextFileSync(`${ROOT}/${scripts[0]}`);
    for (const m of src.matchAll(/^(?:CODE|[A-Z_]+)\s*=\s*"([a-z][a-z0-9-]+)"/gm)) {
      declared.add(m[1]);
    }
  }
  const missing = [...declared].filter((c) => !RATCHET_CODES.has(c));
  if (missing.length > 0) {
    throw new Error(
      `a ratchet gates on ${JSON.stringify(missing)} but lsp/src/ratchetHold.ts does ` +
        `not hold it — the editor would keep publishing held debt for that code`,
    );
  }
});
