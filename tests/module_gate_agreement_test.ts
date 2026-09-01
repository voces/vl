// THE MODULE-ARMING GATE'S AGREEMENT GUARD — four implementations, three
// languages, one question: "does this source need the MODULE FETCH LOOP?"
//
//   1. `compiler/cli_util.vl`         `cliLineIsImport` / `cliHasTplHole` / `cliNeedsModules`
//   2. `scripts/vl-host/src/main.rs`  the inline gate in `stage_program` + `has_template_hole`
//   3. `compiler/moduleGate.ts`       the shared TS copy, imported by …
//   4. … `lsp/src/wasmChecker.ts` (VS Code LSP + browser playground) and
//      `tests/cases_wasm_test.ts` (the corpus oracle)
//
// WHY: a host that answers `false` where the compiler answers `true` leaves the
// guest asking for a module nobody will fetch, and the symptom is SILENCE, not an
// error. #2182 gave 1 and 2 the `export { … } from "…"` arm; 3 and 4 were two
// hand-maintained copies and did not follow, under a comment that still claimed
// the gate was a line-leading `import {` and nothing else — the exact sentence
// the last test below now refuses tree-wide, paraphrased here so this file does
// not trip its own check. Measured on `export { helper } from "./nope"` +
// `print(1)`:
//
//     LSP  (checker.check):  0 diagnostic(s)
//     CLI  (vl check):       [ERROR]: Cannot resolve import "./nope" (…)
//
// A stale comment is not a guard, and the audit
// (`docs/internals/ladder-audit-2026-09.md` §3.2 A1) filed this pair with
// "Guard: NONE". This file is the guard.
//
// WHAT IT DOES, and why it is not a smell test. Sites 3 and 4 are now ONE module,
// so they cannot drift — asserted structurally below. Sites 1 and 2 cannot import
// TypeScript, so they stay MIRRORED, and this test EXTRACTS each one's arm set
// from its own source and requires it to equal `MODULE_LINE_KEYWORDS`. Deleting
// the `export` arm from either reddens this test by name. The behavioural table
// is shared: `tests/vl_module_gate_test.ts` re-runs it through the native `vl`
// binary (which exercises sites 1 AND 2 in series) and
// `tests/lsp_wasm_checker_test.ts` runs its re-export row through the seed-backed
// LSP checker (site 3), so the same rows are graded by three executors.
//
// PURE — no seed, no binary, no network. It runs in the `ci` job.

import {
  hasImports,
  hasTemplateHole,
  MODULE_LINE_KEYWORDS,
  needsModules,
} from "../compiler/moduleGate.ts";
import { GATE_CASES } from "./support/moduleGateCases.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const read = (rel: string): string => Deno.readTextFileSync(`${ROOT}/${rel}`);

const CLI_UTIL = "compiler/cli_util.vl";
const MAIN_RS = "scripts/vl-host/src/main.rs";
const GATE_TS = "compiler/moduleGate.ts";
const LSP_CHECKER = "lsp/src/wasmChecker.ts";
const CORPUS_ORACLE = "tests/cases_wasm_test.ts";

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

// ── 1. the shared TS implementation answers the table ─────────────────────────

Deno.test("module-gate: the shared TS gate answers every row of the table", () => {
  for (const c of GATE_CASES) {
    const got = needsModules(c.source);
    assert(
      got === c.arms,
      `needsModules disagrees on "${c.name}": want ${c.arms}, got ${got}\n` +
        `  source: ${JSON.stringify(c.source)}`,
    );
  }
  // The two halves are separable — a row that arms must arm for a NAMED reason,
  // so a bug in one half cannot be masked by the other.
  assert(
    hasImports('export { a } from "./x"\n') && !hasTemplateHole('export { a } from "./x"\n'),
    "the re-export row must arm through hasImports, not through the template scan",
  );
  assert(
    hasTemplateHole("print(`v=\\{x}`)\n") && !hasImports("print(`v=\\{x}`)\n"),
    "the template row must arm through hasTemplateHole, not through the import scan",
  );
  // BOTH quoted forms interpolate, so both must arm — the plain-string half is
  // the one a `${`-era gate would silently miss, and missing it is SILENT.
  assert(
    hasTemplateHole('print("v=\\{x}")\n') && !hasImports('print("v=\\{x}")\n'),
    "a hole in a PLAIN STRING must arm through hasTemplateHole too — the trigger " +
      "is `\\{` in the escape namespace, which is legal in `\"…\"` as well as in a template",
  );
  // And the property the whole spelling was chosen for: a literal `{` in a
  // string is DATA, forever. 4,821 in-tree literals depend on it.
  assert(
    !hasTemplateHole('print("{plain}")\n') && !hasTemplateHole('print("${x}")\n'),
    "a bare `{` (or a `${`) in a string must never arm module mode",
  );
});

// ── 2. sites 3 and 4 are ONE module, not two copies ───────────────────────────

Deno.test("module-gate: both TS consumers import the shared gate and define no twin", () => {
  for (const rel of [LSP_CHECKER, CORPUS_ORACLE]) {
    const src = read(rel);
    assert(
      /import \{[^}]*needsModules[^}]*\} from "[^"]*moduleGate\.ts"/.test(src),
      `${rel} must import needsModules from compiler/moduleGate.ts — it is the ` +
        `shared copy, and re-inlining it is how the \`export {\` arm was lost`,
    );
    for (const twin of ["hasImports", "hasTemplateHole", "needsModules"]) {
      assert(
        !new RegExp(`(const|function)\\s+${twin}\\s*[=(]`).test(src),
        `${rel} defines its own \`${twin}\` again — the module gate has ONE TS ` +
          `implementation (${GATE_TS}); import it instead`,
      );
    }
  }
});

Deno.test("module-gate: no fifth implementation has appeared", () => {
  const scan = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of Deno.readDirSync(`${ROOT}/${dir}`)) {
      if (!e.isFile || !e.name.endsWith(".ts")) continue;
      const rel = `${dir}/${e.name}`;
      if (rel === GATE_TS) continue;
      const src = Deno.readTextFileSync(`${ROOT}/${rel}`);
      if (/(const|function)\s+(hasImports|needsModules)\s*[=(]/.test(src)) out.push(rel);
    }
    return out;
  };
  const copies = [...scan("lsp/src"), ...scan("playground/src"), ...scan("tests"), ...scan("compiler")];
  assert(
    copies.length === 0,
    `these files re-implement the module gate instead of importing ${GATE_TS}:\n  ` +
      copies.join("\n  "),
  );
});

// ── 3. the two mirrored copies still carry every arm ──────────────────────────
//
// Extraction, not a `.includes` smell test: each copy's arm set is pulled from
// the function that decides, and compared with the TS module's declared set.

/**
 * The text of the declaration starting at `header`, up to the next top-level
 * declaration. Brace COUNTING is not usable here — both bodies compare `'{'` and
 * `b'{'` as character literals, which a counter reads as real braces — and this
 * is only ever asked for anchor presence, so a slice to the next declaration is
 * both sufficient and immune to that.
 */
const declText = (src: string, header: string, rel: string): string => {
  const at = src.indexOf(header);
  assert(at >= 0, `${rel}: could not find \`${header}\` — this guard's extraction is stale`);
  const rest = src.slice(at + header.length);
  const next = rest.search(/\n(export function |function |fn |pub fn |\/\/\/ )/);
  return rest.slice(0, next < 0 ? rest.length : next);
};

Deno.test("module-gate: compiler/cli_util.vl arms exactly the shared keyword set", () => {
  const body = declText(read(CLI_UTIL), "export function cliLineIsImport(", CLI_UTIL);
  const arms = sorted(
    [...body.matchAll(/cliLineStartsKwBrace\(\s*line\s*,\s*"([^"]+)"\s*\)/g)].map((m) => m[1]),
  );
  assert(
    arms.length > 0,
    `${CLI_UTIL}: extracted NO arms from cliLineIsImport — the guard's pattern is ` +
      `stale, not the source (it must call cliLineStartsKwBrace(line, "kw"))`,
  );
  assert(
    arms.join(",") === sorted(MODULE_LINE_KEYWORDS).join(","),
    `${CLI_UTIL} \`cliLineIsImport\` arms [${arms}] != MODULE_LINE_KEYWORDS ` +
      `[${sorted(MODULE_LINE_KEYWORDS)}] (${GATE_TS}). All four module gates must ` +
      `arm on the same line-leading keywords — a missing arm is SILENT: the fetch ` +
      `loop never runs and the unresolvable-module diagnostic never appears.`,
  );
});

Deno.test("module-gate: scripts/vl-host/src/main.rs arms exactly the shared keyword set", () => {
  const src = read(MAIN_RS);
  const at = src.indexOf("let has_imports = source.lines().any(");
  assert(at >= 0, `${MAIN_RS}: could not find the \`has_imports\` gate — extraction is stale`);
  const expr = src.slice(at, src.indexOf("has_template_hole(source);", at));
  const arms = sorted([...expr.matchAll(/strip_prefix\("([^"]+)"\)/g)].map((m) => m[1]));
  assert(
    arms.length > 0,
    `${MAIN_RS}: extracted NO arms from the has_imports gate — the guard's pattern ` +
      `is stale, not the source (it must use strip_prefix("kw"))`,
  );
  assert(
    arms.join(",") === sorted(MODULE_LINE_KEYWORDS).join(","),
    `${MAIN_RS} \`has_imports\` arms [${arms}] != MODULE_LINE_KEYWORDS ` +
      `[${sorted(MODULE_LINE_KEYWORDS)}] (${GATE_TS}). All four module gates must ` +
      `arm on the same line-leading keywords.`,
  );
});

// ── 4. the hole half stays a REAL scan, in BOTH literal forms, in both copies ──
//
// `contains("`")` would arm module mode for the 2,409 corpus files with a
// backtick in a comment, moving programs that have nothing to do with
// interpolation off the single-source path. These anchors are what separates the
// real scan from that shortcut.
//
// SINCE PLAIN STRINGS INTERPOLATE, the scan has a second thing to get right and
// the anchors say so: the `\{` test must appear inside the DOUBLE-QUOTE arm as
// well as the backtick arm, gated by a flag that keeps the CHAR arm out. A gate
// that only looked in backticks would answer `false` for `print("v=\{x}")` — and
// a gate that answers `false` where the compiler answers `true` fails SILENTLY,
// which is the whole reason this file exists.

Deno.test("module-gate: both mirrored hole scans skip comments and scan BOTH literal forms", () => {
  const checks: [string, string, [string, string][]][] = [
    [CLI_UTIL, "export function cliHasTplHole(", [
      ["a `//` comment skip", "s[i + 1] == '/'"],
      ["a double-quote literal skip", `c == '"'`],
      ["a single-quote literal skip", "c == '\\''"],
      ["the quoted-form hole flag (`\"` interpolates, `'` does not)", `const holes = c == '"'`],
      ["the `\\{` hole test in the STRING arm", "if holes && i + 1 < n && s[i + 1] == '{'"],
      ["the `\\{` hole test in the TEMPLATE arm", "if i + 1 < n && s[i + 1] == '{'"],
      ["the escaped-character skip (so `\\\\{` is not a hole)", "if s[i] == '\\\\'"],
    ]],
    [MAIN_RS, "fn has_template_hole(", [
      ["a `//` comment skip", "b[i + 1] == b'/'"],
      ["a quote literal skip", `q @ (b'"' | b'\\'')`],
      ["the quoted-form hole flag (`\"` interpolates, `'` does not)", `let holes = q == b'"'`],
      ["the `\\{` hole test in the STRING arm", "if holes && i + 1 < n && b[i + 1] == b'{'"],
      ["the `\\{` hole test in the TEMPLATE arm", "if i + 1 < n && b[i + 1] == b'{'"],
      ["the escaped-character skip (so `\\\\{` is not a hole)", "if b[i] == b'\\\\'"],
    ]],
  ];
  for (const [rel, header, anchors] of checks) {
    const body = declText(read(rel), header, rel);
    for (const [what, needle] of anchors) {
      assert(
        body.includes(needle),
        `${rel} \`${header.replace(/[({].*$/, "")}\` lost ${what} (${JSON.stringify(needle)}). ` +
          `The hole gate is a REAL SCAN over BOTH quoted forms, not \`contains("\`")\`: ` +
          `a backtick in a \`//\` comment is ordinary (2,409 corpus files carry one) and ` +
          `must not arm module mode, while \`print("v=\\{x}")\` MUST.`,
      );
    }
  }
});

// ── 5. the stale comment that stood in for a guard must not come back ─────────

Deno.test("module-gate: no source claims the gate is `import {` only", () => {
  const stale = "Mirrors the Rust host's module gate: a LINE-LEADING `import {`";
  for (const rel of [LSP_CHECKER, CORPUS_ORACLE, GATE_TS, CLI_UTIL, MAIN_RS]) {
    assert(
      !read(rel).includes(stale),
      `${rel} carries the stale comment ${JSON.stringify(stale)}. The gate takes ` +
        `\`export {\` too (#2182), and that sentence is what made the drift ` +
        `invisible for two releases.`,
    );
  }
});
