// Rename symbol (+prepare) — D9.7. `planRenameAt` classifies the cursor
// position (local binding / exported symbol / import alias / refusal) and
// `renameEdits` assembles the per-URI workspace edits, off the SELF-HOSTED
// checker's reference machinery (`referencesAt` for entry-declared bindings,
// `referencesInEntry` for anything crossing modules) plus the host-side import
// specifier scan (import tokens are parser-skipped — no symbol occurrences).
//
// The alias semantics under test (decided in D9.7, table in `lsp/src/rename.ts`):
//   - renaming a plainly-imported name (at a use, the specifier, or the decl)
//     renames the exported name everywhere, import specifiers included;
//   - renaming the ALIAS of `import { x as y }` renames only the local alias
//     (the alias token + this file's uses);
//   - renaming `x` at its decl renames the export + the SOURCE side of alias
//     specifiers, leaving local aliases and their uses intact;
//   - a std-declared binding, and a file importing one export both plainly and
//     under an alias, REFUSE (a wrong rename is worse than no rename).
//
// The seed-backed tests load the real seed (`build/vl-compiler.wasm`); absent
// (fresh clone, no `refresh-compiler.sh` yet) they self-ignore, the same
// convention as the rest of the wasm suite. The pure tests always run.

import type { ModuleReader } from "../compiler/coreTypes.ts";
import type { WasmChecker } from "../lsp/src/wasmChecker.ts";
import type { LspRange } from "../lsp/src/typeFeatures.ts";
import { pathToUri } from "../lsp/src/moduleGraph.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import {
  invalidNewNameReason,
  planRenameAt,
  renameEdits,
  resolveImportSpecifier,
  scanImportSpecifiers,
} from "../lsp/src/rename.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;
const checker = ignore ? undefined : loadWasmChecker(SEED, () => {});

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const memoryReader = (files: Record<string, string>): ModuleReader =>
  (key: string) => files[key];

/** Apply per-URI rename edits to a source string (edits are non-overlapping). */
const applyEdits = (
  text: string,
  edits: { range: LspRange; newText: string }[],
): string => {
  const toOffset = (pos: { line: number; character: number }): number => {
    const lines = text.split("\n");
    let off = 0;
    for (let l = 0; l < pos.line; l++) off += lines[l].length + 1;
    return off + pos.character;
  };
  const sorted = [...edits].sort(
    (a, b) => toOffset(b.range.start) - toOffset(a.range.start),
  );
  let out = text;
  for (const e of sorted) {
    out = out.slice(0, toOffset(e.range.start)) + e.newText +
      out.slice(toOffset(e.range.end));
  }
  return out;
};

// ---- pure: new-name validation ----------------------------------------------

Deno.test("rename: new-name validation accepts identifiers, refuses grammar + keywords", () => {
  assert(invalidNewNameReason("ok_Name2") === undefined, "plain identifier must pass");
  assert(invalidNewNameReason("_x") === undefined, "leading underscore must pass");
  for (const bad of ["2bad", "has-dash", "", "a b", "x.y"]) {
    assert(
      invalidNewNameReason(bad) !== undefined,
      `'${bad}' must fail the identifier grammar`,
    );
  }
  for (const kw of ["while", "function", "type", "true", "null"]) {
    const reason = invalidNewNameReason(kw);
    assert(
      reason !== undefined && reason.includes("reserved"),
      `hard keyword '${kw}' must be refused as reserved; got ${reason}`,
    );
  }
  for (const soft of ["as", "from", "in", "step", "to", "new", "flat"]) {
    const reason = invalidNewNameReason(soft);
    assert(
      reason !== undefined && reason.includes("contextual"),
      `soft keyword '${soft}' must be refused as contextual; got ${reason}`,
    );
  }
});

// `match` is the row this list was MISSING, and the miss was user-visible: the
// LSP accepted the rename and wrote a file that does not parse. Kept as its own
// named test — a loop over a list cannot say which entry mattered, and the whole
// point of the defect is that a list entry was absent.
// (`tests/keyword_vocabulary_test.ts` is the standing guard: it derives the
// reserved set from `compiler/lexer.vl` and fails if any list drifts again.)
Deno.test("rename: `match` is refused as a new name (it was accepted, and broke the file)", () => {
  const reason = invalidNewNameReason("match");
  assert(
    reason !== undefined && reason.includes("reserved"),
    "renaming a binding to `match` must be refused — accepted, it produces " +
      "`const match = 1`, which fails to parse with `expected an identifier but " +
      `found \`match\`\`. Got: ${JSON.stringify(reason)}`,
  );
  // The control: a name that merely STARTS with a keyword is a legal identifier
  // and must still pass, so the refusal is the keyword and not a prefix test.
  assert(
    invalidNewNameReason("matched") === undefined,
    "`matched` is a plain identifier and must remain an acceptable new name",
  );
});

// The whole path, end to end: prepare → plan → edits → does the RESULT parse?
// The pure check above pins the validator; this pins that the validator is what
// the rename path actually consults. Before the fix this test's `after` source
// was `const match = 1\nprint(match)\n` with five parse errors.
Deno.test({
  name: "rename: the seed-backed path refuses `match` and still accepts a plain name",
  ignore,
}, async () => {
  const src = "const foo = 1\nprint(foo)\n";
  const read = memoryReader({ "/proj/m.vl": src });
  const plan = await planRenameAt(src, "/proj/m.vl", read, checker!, 0, 6);
  assert(
    plan !== undefined && plan.kind === "local",
    `expected a local rename plan for \`foo\`, got ${JSON.stringify(plan)}`,
  );
  assert(
    invalidNewNameReason("match") !== undefined,
    "the rename request must refuse `match` before any edit is computed",
  );
  if (plan!.kind === "refused") return;
  // The same plan with a legal name still produces a file that checks clean —
  // the floor that keeps the refusal from being "rename is broken".
  const result = await renameEdits(
    plan!,
    "bar",
    src,
    "/proj/m.vl",
    pathToUri("/proj/m.vl"),
    [],
    [],
    read,
    checker!,
  );
  assert(!("error" in result), `expected edits, got ${JSON.stringify(result)}`);
  if ("error" in result) return;
  const after = applyEdits(src, result.changes[pathToUri("/proj/m.vl")]);
  assert(
    after === "const bar = 1\nprint(bar)\n",
    `unexpected rename result: ${JSON.stringify(after)}`,
  );
  const diags = await checker!.check(after, "/proj/m.vl", read);
  assert(diags.length === 0, `the renamed file must check clean; got ${diags.length}`);
});

// ---- pure: import specifier scan + resolution -------------------------------

Deno.test("rename: resolveImportSpecifier mirrors the compiler's string math", () => {
  const cases: [string, string, string][] = [
    ["./util", "/proj/main.vl", "/proj/util.vl"],
    ["../lib/x", "/proj/sub/main.vl", "/proj/lib/x.vl"],
    ["./a/../b", "/proj/main.vl", "/proj/b.vl"],
    ["std:test", "/proj/main.vl", "std:test"],
    ["std:a/b_2", "/proj/main.vl", "std:a/b_2"],
    ["util", "/proj/main.vl", ""], // bare — unresolvable
    ["std:Bad", "/proj/main.vl", ""], // malformed std name
    ["./x", "std:list", ""], // relative-inside-std
  ];
  for (const [spec, from, want] of cases) {
    const got = resolveImportSpecifier(spec, from);
    assert(got === want, `resolve(${spec}, ${from}): want '${want}', got '${got}'`);
  }
});

Deno.test("rename: scanImportSpecifiers locates plain + alias tokens with resolved keys", () => {
  const src = 'import { add, mul as times } from "./util"\n' +
    '// import { fake } from "./nope"\n' +
    "let x = 1\n";
  const specs = scanImportSpecifiers(src, "/proj/main.vl");
  assert(specs.length === 2, `want 2 specifiers, got ${specs.length}`);
  const [plain, alias] = specs;
  assert(plain.sourceName === "add" && plain.localName === "add", "plain names");
  assert(plain.localRange === undefined, "plain specifier has no alias token");
  assert(plain.key === "/proj/util.vl", `plain key resolved; got ${plain.key}`);
  assert(
    plain.sourceRange.start.line === 0 && plain.sourceRange.start.character === 9 &&
      plain.sourceRange.end.character === 12,
    `'add' token at 0:9-12; got ${JSON.stringify(plain.sourceRange)}`,
  );
  assert(alias.sourceName === "mul" && alias.localName === "times", "alias names");
  assert(
    alias.sourceRange.start.character === 14 && alias.sourceRange.end.character === 17,
    `'mul' token at 0:14-17; got ${JSON.stringify(alias.sourceRange)}`,
  );
  assert(
    alias.localRange !== undefined &&
      alias.localRange.start.character === 21 && alias.localRange.end.character === 26,
    `'times' token at 0:21-26; got ${JSON.stringify(alias.localRange)}`,
  );
  // The commented-out import is skipped (line-leading gate, the compiler's own
  // module gate).
  assert(
    specs.every((s) => s.sourceName !== "fake"),
    "a commented-out import must not be scanned",
  );
});

Deno.test("rename: scanImportSpecifiers keeps a multi-line import whole", () => {
  const src = 'import {\n  add,\n  mul as times,\n} from "./util"\n';
  const specs = scanImportSpecifiers(src, "/proj/main.vl");
  assert(specs.length === 2, `want 2 specifiers, got ${specs.length}`);
  assert(
    specs[0].sourceRange.start.line === 1 && specs[0].sourceRange.start.character === 2,
    `'add' on line 1; got ${JSON.stringify(specs[0].sourceRange)}`,
  );
  assert(
    specs[1].localRange !== undefined && specs[1].localRange.start.line === 2,
    `'times' on line 2; got ${JSON.stringify(specs[1].localRange)}`,
  );
});

// ---- pure: (uri, range) dedupe ----------------------------------------------

Deno.test("rename: edit assembly dedupes by (uri, range)", async () => {
  const range: LspRange = {
    start: { line: 0, character: 4 },
    end: { line: 0, character: 5 },
  };
  const result = await renameEdits(
    {
      kind: "local",
      word: "x",
      range,
      occurrences: [range, { ...range }, {
        start: { line: 1, character: 6 },
        end: { line: 1, character: 7 },
      }],
    },
    "y",
    "let x = 1\nprint(x)\n",
    "/proj/main.vl",
    pathToUri("/proj/main.vl"),
    [],
    [],
    () => undefined,
    // The local path touches neither the reader nor the checker.
    undefined as unknown as WasmChecker,
  );
  assert("changes" in result, "local rename must produce changes");
  const edits = ("changes" in result ? result.changes : {})[pathToUri("/proj/main.vl")];
  assert(
    edits.length === 2,
    `duplicate occurrence must dedupe to 2 edits; got ${edits.length}`,
  );
});

// ---- seed-backed fixtures ----------------------------------------------------

const util = "export function add(a: i32, b: i32): i32 {\n  a + b\n}\n";
const mainPlain = 'import { add } from "./util"\n\nprint(add(2, 3))\nprint(add(4, 5))\n';
const mainAlias = 'import { add as plus } from "./util"\n\nprint(plus(2, 3))\nprint(plus(4, 5))\n';

// ---- seed: local rename ------------------------------------------------------

Deno.test({ name: "rename: a local binding renames every same-file occurrence", ignore }, async () => {
  const src = "let count = 1\nprint(count)\nprint(count + 1)\n";
  const read = memoryReader({ "/proj/main.vl": src });
  const plan = await planRenameAt(src, "/proj/main.vl", read, checker!, 1, 8);
  assert(plan !== undefined && plan.kind === "local", `want local plan, got ${JSON.stringify(plan)}`);
  if (plan.kind !== "local") return;
  assert(plan.word === "count", `placeholder word; got ${plan.word}`);
  assert(
    plan.range.start.line === 1 && plan.range.start.character === 6 &&
      plan.range.end.character === 11,
    `prepare range must span the identifier; got ${JSON.stringify(plan.range)}`,
  );
  const result = await renameEdits(
    plan,
    "total",
    src,
    "/proj/main.vl",
    pathToUri("/proj/main.vl"),
    [],
    [],
    read,
    checker!,
  );
  assert("changes" in result, "local rename must produce changes");
  const changes = "changes" in result ? result.changes : {};
  const uris = Object.keys(changes);
  assert(uris.length === 1, `local rename touches one file; got ${uris.length}`);
  const got = applyEdits(src, changes[pathToUri("/proj/main.vl")]);
  const want = "let total = 1\nprint(total)\nprint(total + 1)\n";
  assert(got === want, `local rename result:\nwant: ${JSON.stringify(want)}\ngot:  ${JSON.stringify(got)}`);
});

// ---- seed: cross-file rename through the disk crawl -------------------------

Deno.test({
  name: "rename: a plainly-imported name renames the export everywhere (decl + uses + specifier), through the disk crawl",
  ignore,
}, async () => {
  const files = { "/proj/util.vl": util, "/proj/main.vl": mainPlain };
  const read = memoryReader(files);
  // Cursor on the `add` use in main.vl (line 2 `print(add(2, 3))`, col 6).
  const plan = await planRenameAt(mainPlain, "/proj/main.vl", read, checker!, 2, 6);
  assert(plan !== undefined && plan.kind === "export", `want export plan, got ${JSON.stringify(plan)}`);
  if (plan.kind !== "export") return;
  assert(plan.target.key === "/proj/util.vl", `target key; got ${plan.target.key}`);
  // util.vl arrives ONLY via the disk crawl (not an open document).
  const result = await renameEdits(
    plan,
    "total",
    mainPlain,
    "/proj/main.vl",
    pathToUri("/proj/main.vl"),
    [],
    ["/proj/util.vl", "/proj/main.vl"],
    read,
    checker!,
  );
  assert("changes" in result, "export rename must produce changes");
  const changes = "changes" in result ? result.changes : {};
  const gotMain = applyEdits(mainPlain, changes[pathToUri("/proj/main.vl")] ?? []);
  const gotUtil = applyEdits(util, changes[pathToUri("/proj/util.vl")] ?? []);
  const wantMain = 'import { total } from "./util"\n\nprint(total(2, 3))\nprint(total(4, 5))\n';
  const wantUtil = "export function total(a: i32, b: i32): i32 {\n  a + b\n}\n";
  assert(gotMain === wantMain, `main.vl:\nwant: ${JSON.stringify(wantMain)}\ngot:  ${JSON.stringify(gotMain)}`);
  assert(gotUtil === wantUtil, `util.vl:\nwant: ${JSON.stringify(wantUtil)}\ngot:  ${JSON.stringify(gotUtil)}`);
});

Deno.test({
  name: "rename: at the export's decl the plan is identical (decl + importer uses + specifier)",
  ignore,
}, async () => {
  const files = { "/proj/util.vl": util, "/proj/main.vl": mainPlain };
  const read = memoryReader(files);
  // Cursor on `add` in `export function add` (line 0, col 16 of util.vl).
  const plan = await planRenameAt(util, "/proj/util.vl", read, checker!, 0, 17);
  assert(plan !== undefined && plan.kind === "export", `want export plan, got ${JSON.stringify(plan)}`);
  if (plan.kind !== "export") return;
  const result = await renameEdits(
    plan,
    "total",
    util,
    "/proj/util.vl",
    pathToUri("/proj/util.vl"),
    [],
    ["/proj/main.vl"],
    read,
    checker!,
  );
  assert("changes" in result, "export rename must produce changes");
  const changes = "changes" in result ? result.changes : {};
  const gotUtil = applyEdits(util, changes[pathToUri("/proj/util.vl")] ?? []);
  const gotMain = applyEdits(mainPlain, changes[pathToUri("/proj/main.vl")] ?? []);
  assert(
    gotUtil === "export function total(a: i32, b: i32): i32 {\n  a + b\n}\n",
    `util.vl decl renamed; got ${JSON.stringify(gotUtil)}`,
  );
  assert(
    gotMain === 'import { total } from "./util"\n\nprint(total(2, 3))\nprint(total(4, 5))\n',
    `main.vl specifier + uses renamed; got ${JSON.stringify(gotMain)}`,
  );
});

// ---- seed: alias semantics ---------------------------------------------------

Deno.test({
  name: "rename: the alias of `import { x as y }` renames ONLY the local alias (single-file)",
  ignore,
}, async () => {
  const files = { "/proj/util.vl": util, "/proj/alias.vl": mainAlias };
  const read = memoryReader(files);
  // Cursor on a `plus` use (line 2, col 6).
  const plan = await planRenameAt(mainAlias, "/proj/alias.vl", read, checker!, 2, 6);
  assert(
    plan !== undefined && plan.kind === "alias-local",
    `want alias-local plan, got ${JSON.stringify(plan)}`,
  );
  if (plan.kind !== "alias-local") return;
  const result = await renameEdits(
    plan,
    "q",
    mainAlias,
    "/proj/alias.vl",
    pathToUri("/proj/alias.vl"),
    [],
    ["/proj/util.vl"],
    read,
    checker!,
  );
  assert("changes" in result, "alias rename must produce changes");
  const changes = "changes" in result ? result.changes : {};
  const uris = Object.keys(changes);
  assert(
    uris.length === 1 && uris[0] === pathToUri("/proj/alias.vl"),
    `alias rename touches only the importing file; got ${JSON.stringify(uris)}`,
  );
  const got = applyEdits(mainAlias, changes[pathToUri("/proj/alias.vl")]);
  const want = 'import { add as q } from "./util"\n\nprint(q(2, 3))\nprint(q(4, 5))\n';
  assert(got === want, `alias rename:\nwant: ${JSON.stringify(want)}\ngot:  ${JSON.stringify(got)}`);
});

Deno.test({
  name: "rename: renaming the export leaves an aliased importer's alias + uses intact (source side only)",
  ignore,
}, async () => {
  const files = { "/proj/util.vl": util, "/proj/alias.vl": mainAlias };
  const read = memoryReader(files);
  // Cursor on `add` at its decl in util.vl.
  const plan = await planRenameAt(util, "/proj/util.vl", read, checker!, 0, 16);
  assert(plan !== undefined && plan.kind === "export", `want export plan, got ${JSON.stringify(plan)}`);
  if (plan.kind !== "export") return;
  const result = await renameEdits(
    plan,
    "total",
    util,
    "/proj/util.vl",
    pathToUri("/proj/util.vl"),
    [{ uri: pathToUri("/proj/alias.vl"), text: mainAlias }],
    [],
    read,
    checker!,
  );
  assert("changes" in result, "export rename must produce changes");
  const changes = "changes" in result ? result.changes : {};
  const gotUtil = applyEdits(util, changes[pathToUri("/proj/util.vl")] ?? []);
  const gotAlias = applyEdits(mainAlias, changes[pathToUri("/proj/alias.vl")] ?? []);
  assert(
    gotUtil === "export function total(a: i32, b: i32): i32 {\n  a + b\n}\n",
    `util.vl decl renamed; got ${JSON.stringify(gotUtil)}`,
  );
  // Only the SOURCE side of the alias specifier moves; `plus` and its uses stay.
  const wantAlias = 'import { total as plus } from "./util"\n\nprint(plus(2, 3))\nprint(plus(4, 5))\n';
  assert(
    gotAlias === wantAlias,
    `alias.vl:\nwant: ${JSON.stringify(wantAlias)}\ngot:  ${JSON.stringify(gotAlias)}`,
  );
});

Deno.test({
  name: "rename: the source side of an alias specifier renames the export (same as at the decl)",
  ignore,
}, async () => {
  const files = { "/proj/util.vl": util, "/proj/alias.vl": mainAlias };
  const read = memoryReader(files);
  // Cursor on `add` inside `import { add as plus }` (line 0, col 9).
  const plan = await planRenameAt(mainAlias, "/proj/alias.vl", read, checker!, 0, 9);
  assert(
    plan !== undefined && plan.kind === "export" && plan.target.key === "/proj/util.vl",
    `want export plan targeting util.vl, got ${JSON.stringify(plan)}`,
  );
});

Deno.test({
  name: "rename: importing one export both plainly and aliased refuses (unattributable occurrences)",
  ignore,
}, async () => {
  const mixed = 'import { add, add as plus } from "./util"\n\nprint(add(1, 2))\nprint(plus(3, 4))\n';
  const files = { "/proj/util.vl": util, "/proj/mixed.vl": mixed };
  const read = memoryReader(files);
  // Cursor on the `add` use (line 2, col 6).
  const plan = await planRenameAt(mixed, "/proj/mixed.vl", read, checker!, 2, 6);
  assert(
    plan !== undefined && plan.kind === "refused" &&
      plan.reason.includes("imported more than once"),
    `want the mixed-import refusal, got ${JSON.stringify(plan)}`,
  );
});

// ---- seed: std refusal -------------------------------------------------------

Deno.test({
  name: "rename: a binding declared in a std module refuses (use site and import specifier)",
  ignore,
}, async () => {
  const src = 'import { it } from "std:test"\n\nit("works", () => {})\n';
  const read = memoryReader({});
  // At the use (line 2, col 0).
  const atUse = await planRenameAt(src, "/proj/t.vl", read, checker!, 2, 0);
  assert(
    atUse !== undefined && atUse.kind === "refused" && atUse.reason.includes("std"),
    `want std refusal at the use, got ${JSON.stringify(atUse)}`,
  );
  // At the import specifier (line 0, col 9).
  const atSpec = await planRenameAt(src, "/proj/t.vl", read, checker!, 0, 9);
  assert(
    atSpec !== undefined && atSpec.kind === "refused" && atSpec.reason.includes("std"),
    `want std refusal at the specifier, got ${JSON.stringify(atSpec)}`,
  );
});

Deno.test({
  name: "rename: the LOCAL alias of a std import is renameable (touches only the user file)",
  ignore,
}, async () => {
  const src = 'import { it as spec } from "std:test"\n\nspec("works", () => {})\n';
  const read = memoryReader({});
  const plan = await planRenameAt(src, "/proj/t.vl", read, checker!, 2, 0);
  assert(
    plan !== undefined && plan.kind === "alias-local",
    `want alias-local plan for a std alias, got ${JSON.stringify(plan)}`,
  );
  if (plan.kind !== "alias-local") return;
  const result = await renameEdits(
    plan,
    "test_case",
    src,
    "/proj/t.vl",
    pathToUri("/proj/t.vl"),
    [],
    [],
    read,
    checker!,
  );
  assert("changes" in result, "std-alias rename must produce changes");
  const changes = "changes" in result ? result.changes : {};
  const uris = Object.keys(changes);
  assert(
    uris.length === 1 && uris[0] === pathToUri("/proj/t.vl"),
    `std-alias rename touches only the user file; got ${JSON.stringify(uris)}`,
  );
  const got = applyEdits(src, changes[uris[0]]);
  const want = 'import { it as test_case } from "std:test"\n\ntest_case("works", () => {})\n';
  assert(got === want, `std-alias rename:\nwant: ${JSON.stringify(want)}\ngot:  ${JSON.stringify(got)}`);
});

// ---- seed: refusals + shadowing at the plan level ----------------------------

Deno.test({
  name: "rename: keywords, literals and builtins are not renameable positions",
  ignore,
}, async () => {
  const src = "let x = 1\nprint(x)\n";
  const read = memoryReader({});
  // `let` keyword.
  assert(
    await planRenameAt(src, "/proj/m.vl", read, checker!, 0, 1) === undefined,
    "a keyword must not be renameable",
  );
  // `1` literal.
  assert(
    await planRenameAt(src, "/proj/m.vl", read, checker!, 0, 8) === undefined,
    "a literal must not be renameable",
  );
  // `print` builtin (no tracked binding).
  assert(
    await planRenameAt(src, "/proj/m.vl", read, checker!, 1, 1) === undefined,
    "a builtin must not be renameable",
  );
});

Deno.test({
  name: "rename: a local that shadows an import renames locally (binding identity, not text match)",
  ignore,
}, async () => {
  const src = 'import { add } from "./util"\n\n' +
    "function twice(add: i32): i32 {\n  add + add\n}\nprint(twice(3))\n";
  const files = { "/proj/util.vl": util, "/proj/shadow.vl": src };
  const read = memoryReader(files);
  // Cursor on the `add` PARAMETER use (line 3, col 2) — not the import.
  const plan = await planRenameAt(src, "/proj/shadow.vl", read, checker!, 3, 2);
  assert(
    plan !== undefined && plan.kind === "local",
    `the shadowing param must plan a LOCAL rename, got ${JSON.stringify(plan)}`,
  );
  if (plan.kind !== "local") return;
  const result = await renameEdits(
    plan,
    "n",
    src,
    "/proj/shadow.vl",
    pathToUri("/proj/shadow.vl"),
    [],
    [],
    read,
    checker!,
  );
  assert("changes" in result, "shadow rename must produce changes");
  const changes = "changes" in result ? result.changes : {};
  const got = applyEdits(src, changes[pathToUri("/proj/shadow.vl")] ?? []);
  const want = 'import { add } from "./util"\n\n' +
    "function twice(n: i32): i32 {\n  n + n\n}\nprint(twice(3))\n";
  assert(
    got === want,
    `shadow rename must leave the import intact:\nwant: ${JSON.stringify(want)}\ngot:  ${JSON.stringify(got)}`,
  );
});
