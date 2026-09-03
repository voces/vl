// UFCS method completion + the missing-import quick-fix (LSP; DECISIONS.md, owner
// 2026-09-02 "UFCS is never implicit: the compiler resolves `x.f(…)` only against
// names IN SCOPE; the LSP surfaces the import").
//
// `expect(1 + 2).toEqual(3)` is `toEqual(expect(1 + 2), 3)` over a free
// `function toEqual<T>(self: Expectation<T>, …)` in `std:test`, so the file must
// import `toEqual`. Without it the compiler says `no field 'toEqual' on
// Expectation<i32>` — correct, and no help at all. The rule stays; the editor
// closes the papercut, in two places:
//
//   1. completion after `.` offers the method and writes the import on accept;
//   2. a quick-fix on that diagnostic adds the name to the import.
//
// COMPLETION rests on a checker query — `wasmChecker.ufcsCandidatesAt` — because
// the receiver's fit against a GENERIC `self` (`Expectation<i32>` into
// `self: Expectation<T>`) is a question only the checker can answer; the host
// holds rendered strings. THE QUICK-FIX ASKS NOTHING: the checker already decided
// at the raise, and the answer rides the diagnostic's `data.modules` — one field
// per candidate, spelled as a specifier this file can write.
//
// Seed-gated (loads the real `build/vl-compiler.wasm`); the pure helpers
// (`ufcsProbeSource` / `ufcsCompletions` / `ufcsMissingImportAt` /
// `ufcsImportModules` / `ufcsImportFixes`) run unconditionally.
//   deno test -A --no-check tests/lsp_ufcs_import_test.ts

import {
  importInsertionEdit,
  importSpecifierForKey,
  UFCS_PROBE_PROP,
  type UfcsCandidate,
  ufcsCompletions,
  ufcsProbeSource,
} from "../lsp/src/typeFeatures.ts";
import {
  diagCategory,
  ufcsImportFixes,
  ufcsImportModules,
  ufcsMissingImportAt,
} from "../lsp/src/codeActions.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { makeWorkspaceReader } from "../lsp/src/moduleGraph.ts";
import { STD_SOURCES } from "../std/embedded.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// ---- pure: the probe source --------------------------------------------------

Deno.test("ufcs probe: inserts the probe property at the cursor", () => {
  const src = 'import { expect } from "std:test"\n\nexpect(1 + 2).\n';
  const p = ufcsProbeSource(src, [], { line: 2, character: 14 });
  assert(p.lineOffset === 0, `no probe modules, no offset; got ${p.lineOffset}`);
  const want = `import { expect } from "std:test"\n\nexpect(1 + 2).${UFCS_PROBE_PROP}\n`;
  assert(p.source === want, `probe prop at the cursor; got ${JSON.stringify(p.source)}`);
});

Deno.test("ufcs probe: one aliased import per un-imported module, cursor shifts by that many lines", () => {
  const src = 'import { expect } from "std:test"\n\nexpect(1).\n';
  const p = ufcsProbeSource(src, [
    { key: "std:str", anyExport: "trim" },
    { key: "std:fmt", anyExport: "toString" },
  ]);
  assert(p.lineOffset === 2, `two fresh modules; got ${p.lineOffset}`);
  assert(
    p.source.startsWith(
      `import { trim as ${UFCS_PROBE_PROP}0 } from "std:str"\n` +
        `import { toString as ${UFCS_PROBE_PROP}1 } from "std:fmt"\n`,
    ),
    `aliased specifiers; got ${JSON.stringify(p.source.slice(0, 120))}`,
  );
});

Deno.test("ufcs probe: a module the file already imports is not probed again", () => {
  const src = 'import { expect } from "std:test"\n\nexpect(1).\n';
  const p = ufcsProbeSource(src, [{ key: "std:test", anyExport: "it" }]);
  assert(p.lineOffset === 0, `already imported; got ${p.lineOffset}`);
  assert(p.source === src, "source must be untouched");
});

// ---- pure: candidates -> completion items ------------------------------------

const cand = (name: string, moduleKey: string, detail = "() => void"): UfcsCandidate => ({
  name,
  detail,
  moduleKey,
});

Deno.test("ufcs completions: an un-imported method carries its module and an import edit", () => {
  const src = 'import { expect, it } from "std:test"\n\nit("x", () => {})\n';
  const items = ufcsCompletions(src, "/proj/main.vl", [cand("toEqual", "std:test")], () => false);
  assert(items.length === 1, `one item; got ${items.length}`);
  assert(items[0].kind === "function", `a method is a function; got ${items[0].kind}`);
  assert(items[0].description === "std:test", `module in the detail; got ${items[0].description}`);
  const edits = items[0].extraEdits;
  if (edits === undefined) throw new Error("expected an import edit");
  assert(
    edits[0].newText === 'import { expect, it, toEqual } from "std:test"',
    `merged import; got ${JSON.stringify(edits[0].newText)}`,
  );
});

Deno.test("ufcs completions: a name already imported gets NO edit", () => {
  const src = 'import { expect, it, toEqual } from "std:test"\n\nit("x", () => {})\n';
  const items = ufcsCompletions(src, "/proj/main.vl", [cand("toEqual", "std:test")], () => false);
  assert(items.length === 1, `still offered; got ${items.length}`);
  assert(
    items[0].extraEdits === undefined,
    `no edit when in scope; got ${JSON.stringify(items[0].extraEdits)}`,
  );
});

Deno.test("ufcs completions: a method declared in THIS file gets no edit and no module label", () => {
  const src = "type Box = { n: i32 }\n\nfunction twice(self: Box): i32 { self.n * 2 }\n";
  // The entry's own decls come back with the entry key, or "" in a single-file check.
  for (const key of ["/proj/main.vl", ""]) {
    const items = ufcsCompletions(src, "/proj/main.vl", [cand("twice", key)], () => false);
    assert(items.length === 1, `offered; got ${items.length}`);
    assert(items[0].extraEdits === undefined, `local needs no import (key ${JSON.stringify(key)})`);
    assert(items[0].description === undefined, `local needs no module label (key ${JSON.stringify(key)})`);
  }
});

Deno.test("ufcs completions: a FIELD of the same name wins — the free function is dropped", () => {
  const src = 'import { area } from "./shapes"\n';
  const items = ufcsCompletions(src, "/proj/main.vl", [cand("area", "./other")], (n) => n === "area");
  assert(items.length === 0, `field precedence; got ${JSON.stringify(items)}`);
});

Deno.test("ufcs completions: two modules exporting one name are two items", () => {
  const src = "const c = 1\n";
  const items = ufcsCompletions(
    src,
    "/proj/main.vl",
    [cand("area", "/proj/a.vl"), cand("area", "/proj/b.vl")],
    () => false,
  );
  assert(items.length === 2, `one per module; got ${items.length}`);
  assert(
    items[0].description === "./a" && items[1].description === "./b",
    `both modules named, as SPECIFIERS; got ${JSON.stringify(items.map((i) => i.description))}`,
  );
});

// ---- pure: a module KEY is not a SPECIFIER -----------------------------------

Deno.test("specifier: a std key is its own specifier", () => {
  assert(
    importSpecifierForKey("", "/proj/main.vl", "std:test") === "std:test",
    "std keys are verbatim",
  );
});

Deno.test("specifier: the file's own spelling wins over a derived one", () => {
  const src = 'import { Circle } from "./shapes"\n';
  assert(
    importSpecifierForKey(src, "/proj/main.vl", "/proj/shapes.vl") === "./shapes",
    "reuse the statement the edit will merge into",
  );
  const nested = 'import { Circle } from "../lib/shapes"\n';
  assert(
    importSpecifierForKey(nested, "/proj/app/main.vl", "/proj/lib/shapes.vl") === "../lib/shapes",
    "an author's `../` spelling is kept",
  );
});

Deno.test("specifier: derived relative to the entry when the file has no such import", () => {
  assert(
    importSpecifierForKey("", "/proj/main.vl", "/proj/shapes.vl") === "./shapes",
    "sibling module",
  );
  assert(
    importSpecifierForKey("", "/proj/app/main.vl", "/proj/lib/shapes.vl") === "../lib/shapes",
    "one directory up",
  );
});

Deno.test("specifier: unspellable keys yield \"\" and are never offered", () => {
  assert(importSpecifierForKey("", "/proj/main.vl", "") === "", "no module");
  assert(
    importSpecifierForKey("", "/proj/main.vl", "/proj/main.vl") === "",
    "the entry itself needs no import",
  );
  assert(
    importSpecifierForKey("", "/proj/main.vl", "/elsewhere/x.vl") === "",
    "no shared root is left unspelt rather than guessed",
  );
  const src = "const c = 1\n";
  const items = ufcsCompletions(src, "/proj/main.vl", [cand("f", "/elsewhere/x.vl")], () => false);
  assert(items.length === 0, `an unspellable module is dropped; got ${JSON.stringify(items)}`);
});

// ---- pure: the quick-fix -----------------------------------------------------

const noFieldDiag = (source: string, name: string, line: number) => {
  const col = source.split("\n")[line].indexOf(name);
  return {
    source: "vital",
    message: `no field '${name}' on Expectation<i32>`,
    range: {
      start: { line, character: col },
      end: { line, character: col + name.length },
    },
  };
};

Deno.test("quick-fix: the member name is read from the diagnostic's RANGE, not its sentence", () => {
  const src = 'import { expect, it } from "std:test"\n\nexpect(1 + 2).toEqual(3)\n';
  assert(
    ufcsMissingImportAt(src, {
      ...noFieldDiag(src, "toEqual", 2),
      code: "ufcs-not-imported",
    }) === "toEqual",
    "the range names the member",
  );
});

Deno.test("quick-fix: keys on the stable code when the diagnostic carries one", () => {
  const src = 'import { expect } from "std:test"\n\nexpect(1).toEqual(3)\n';
  const d = { ...noFieldDiag(src, "toEqual", 2), code: "ufcs-not-imported", message: "anything at all" };
  assert(ufcsMissingImportAt(src, d) === "toEqual", "the code alone identifies it");
});

Deno.test("quick-fix: an unrelated diagnostic is not one of ours", () => {
  const src = "let x = 1\n";
  const d = {
    source: "vital",
    code: "prefer-const",
    message: "prefer `const`",
    range: { start: { line: 0, character: 4 }, end: { line: 0, character: 5 } },
  };
  assert(ufcsMissingImportAt(src, d) === undefined, "prefer-const is not a missing import");
  assert(ufcsImportModules(d).length === 0, "and it offers no modules");
});

// ---- the candidate modules come from `data`, never from a parsed code --------

Deno.test("quick-fix: the candidate modules are the diagnostic's own `data.modules`", () => {
  const src = 'import { expect } from "std:test"\n\nexpect(1).toEqual(3)\n';
  const d = {
    ...noFieldDiag(src, "toEqual", 2),
    code: "ufcs-not-imported",
    data: { member: ["toEqual"], modules: ["std:test"], recv: ["Expectation<i32>"] },
  };
  assert(
    JSON.stringify(ufcsImportModules(d)) === JSON.stringify(["std:test"]),
    `one module from data; got ${JSON.stringify(ufcsImportModules(d))}`,
  );
});

Deno.test("quick-fix: TWO candidate modules come back in wire order", () => {
  const src = 'import { A } from "./a"\nimport { B } from "./b"\n\nx.area()\n';
  const d = {
    ...noFieldDiag(src, "area", 3),
    code: "ufcs-not-imported",
    data: { member: ["area"], modules: ["./a", "./b"], recv: ["X"] },
  };
  assert(
    JSON.stringify(ufcsImportModules(d)) === JSON.stringify(["./a", "./b"]),
    `both modules; got ${JSON.stringify(ufcsImportModules(d))}`,
  );
});

// `Diagnostic.data` is LSP 3.16 and a client is NOT obliged to round-trip it. The
// server's own cache always has it, so the reader falls back to the identically
// coded, identically anchored cached twin rather than silently offering nothing.
Deno.test("quick-fix: a client that dropped `data` is covered by the server's cache", () => {
  const src = 'import { expect } from "std:test"\n\nexpect(1).toEqual(3)\n';
  const stripped = { ...noFieldDiag(src, "toEqual", 2), code: "ufcs-not-imported" };
  const cached = {
    ...stripped,
    data: { member: ["toEqual"], modules: ["std:test"], recv: ["Expectation<i32>"] },
  };
  assert(ufcsImportModules(stripped).length === 0, "alone it knows nothing");
  assert(
    JSON.stringify(ufcsImportModules(stripped, [cached])) === JSON.stringify(["std:test"]),
    "the cached twin supplies the answer",
  );
  // A twin at a DIFFERENT anchor is a different diagnostic and must not be borrowed.
  const elsewhere = {
    ...cached,
    range: { start: { line: 9, character: 0 }, end: { line: 9, character: 1 } },
  };
  assert(
    ufcsImportModules(stripped, [elsewhere]).length === 0,
    "another diagnostic's payload is not this one's",
  );
});

// A payload that is not the shape we wrote — a client that mangled it, a seed
// that changed the format — yields NOTHING, not a partial read. A wrong import is
// worse than the sentence the reader already has.
Deno.test("quick-fix: a malformed `data` offers no modules", () => {
  const src = 'import { expect } from "std:test"\n\nexpect(1).toEqual(3)\n';
  const base = { ...noFieldDiag(src, "toEqual", 2), code: "ufcs-not-imported" };
  const bad: unknown[] = [null, "std:test", { modules: "std:test" }, { modules: [1, 2] }, {}];
  for (const data of bad) {
    assert(
      ufcsImportModules({ ...base, data }).length === 0,
      `malformed data must offer nothing: ${JSON.stringify(data)}`,
    );
  }
});

// `diagCategory` STAYS, and nothing depends on it. It is a tolerant reader kept
// against the next packed code — the mistake it guards is cheap to make again —
// so it must still cut at the first `;` while a bare category passes through.
Deno.test("quick-fix: diagCategory still tolerates a packed code, and nothing uses it", () => {
  assert(diagCategory("ufcs-not-imported") === "ufcs-not-imported", "a bare category is itself");
  assert(
    diagCategory("ufcs-not-imported;member=toEqual") === "ufcs-not-imported",
    "a packed code still yields its category",
  );
  assert(diagCategory(undefined) === "", "no code, no category");
  assert(diagCategory(42) === "", "a numeric code has no category");
  // And the fix keys on EQUALITY now: a packed code no longer identifies it.
  const src = 'import { expect } from "std:test"\n\nexpect(1).toEqual(3)\n';
  const packed = {
    ...noFieldDiag(src, "toEqual", 2),
    code: "ufcs-not-imported;member=toEqual;modules=std:test;recv=Expectation<i32>",
  };
  assert(
    ufcsMissingImportAt(src, packed) === undefined,
    "the code is a bare category — a packed one is not this diagnostic",
  );
});

Deno.test("quick-fix: one action per candidate module, titled with the module", () => {
  const src = 'import { expect, it } from "std:test"\n\nexpect(1).toEqual(3)\n';
  const fixes = ufcsImportFixes(
    src,
    "toEqual",
    ["std:test"],
    (s, key, name) => importInsertionEdit(s, key, name),
  );
  assert(fixes.length === 1, `one candidate; got ${fixes.length}`);
  assert(
    fixes[0].title === 'Import `toEqual` from "std:test"',
    `title; got ${JSON.stringify(fixes[0].title)}`,
  );
  assert(fixes[0].isPreferred === true, "the only candidate is preferred");
  assert(
    fixes[0].edits[0].newText === 'import { expect, it, toEqual } from "std:test"',
    `edit; got ${JSON.stringify(fixes[0].edits[0].newText)}`,
  );
});

Deno.test("quick-fix: two candidate modules yield two actions and no preferred one", () => {
  const src = 'import { A } from "./a"\nimport { B } from "./b"\n\nx.area()\n';
  const fixes = ufcsImportFixes(
    src,
    "area",
    ["./a", "./b"],
    (s, key, name) => importInsertionEdit(s, key, name),
  );
  assert(fixes.length === 2, `two candidates; got ${fixes.length}`);
  assert(fixes.every((f) => f.isPreferred === undefined), "no default when the author must pick");
});

// ---- seed-backed: the real checker query -------------------------------------

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

const checkerAndReader = (extra?: (key: string) => string | undefined) => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const base = makeWorkspaceReader({ get: () => undefined }, () => undefined, () => undefined);
  const read = (key: string) => extra?.(key) ?? base(key);
  return { checker, read };
};

// The probe modules the server assembles, off each std module's own surface.
const stdProbeModules = (checker: ReturnType<typeof loadWasmChecker>) => {
  const out: { key: string; anyExport: string }[] = [];
  for (const key of Object.keys(STD_SOURCES)) {
    const exports = checker!.moduleSurface(STD_SOURCES[key], key).exports;
    if (exports.length > 0) out.push({ key, anyExport: exports[0].name });
  }
  return out;
};

Deno.test({
  name: "seed: completion after `expect(1).` offers toEqual from std:test with the import edit",
  ignore,
}, async () => {
  const { checker, read } = checkerAndReader();
  // What the editor holds when the author has just typed the `.`.
  const src = 'import { expect, it } from "std:test"\n\nit("x", () => {\n  expect(1).\n})\n';
  const cursor = { line: 3, character: 12 };
  const probe = ufcsProbeSource(src, stdProbeModules(checker), cursor);
  const candidates = await checker.ufcsCandidatesAt(
    probe.source,
    "/proj/main.vl",
    read,
    cursor.line + probe.lineOffset,
    cursor.character,
  );
  const items = ufcsCompletions(src, "/proj/main.vl", candidates, () => false);
  const toEqual = items.find((i) => i.name === "toEqual");
  if (toEqual === undefined) {
    throw new Error(`toEqual must be offered; got ${JSON.stringify(items.map((i) => i.name))}`);
  }
  assert(toEqual.description === "std:test", `module; got ${toEqual.description}`);
  const edits = toEqual.extraEdits;
  if (edits === undefined) throw new Error("expected an import edit");
  assert(
    edits[0].newText === 'import { expect, it, toEqual } from "std:test"',
    `edit; got ${JSON.stringify(edits[0].newText)}`,
  );
  // The receiver is a CALL, which the field scan's bare-identifier receiver
  // lookup cannot resolve — this list existing at all is the new capability.
  assert(
    items.some((i) => i.name === "toBeTrue"),
    `the whole matcher family is offered; got ${JSON.stringify(items.map((i) => i.name))}`,
  );
});

Deno.test({
  name: "seed: applying the completion's import edit makes the file check CLEAN",
  ignore,
}, async () => {
  const { checker, read } = checkerAndReader();
  const src = 'import { expect, it } from "std:test"\n\nit("x", () => {\n  expect(1 + 2).toEqual(3)\n})\n';
  const before = await checker.check(src, "/proj/main.vl", read);
  assert(
    before.some((d) => (d.code ?? "").startsWith("ufcs-not-imported")),
    `the D1230 diagnostic must be present; got ${JSON.stringify(before.map((d) => d.message))}`,
  );
  const edit = importInsertionEdit(
    src,
    "std:test",
    "toEqual",
    (stmt) => checker.formatSrc?.(stmt),
  );
  if (edit === undefined) throw new Error("expected an import edit");
  const lines = src.split("\n");
  lines[edit.range.start.line] = lines[edit.range.start.line].slice(0, edit.range.start.character) +
    edit.newText + lines[edit.range.end.line].slice(edit.range.end.character);
  const after = lines.join("\n");
  const diags = await checker.check(after, "/proj/main.vl", read);
  assert(
    diags.length === 0,
    `must check clean after the edit; got ${JSON.stringify(diags.map((d) => d.message))}`,
  );
});

Deno.test({
  name: "seed: a WORKSPACE module's exported self-function is offered, its private one is not",
  ignore,
}, async () => {
  const shapes = "export type Circle = { r: f64 }\n\n" +
    "export function area(self: Circle): f64 { self.r * self.r * 3.14 }\n\n" +
    "function secret(self: Circle): f64 { 1.0 }\n";
  const { checker, read } = checkerAndReader((key) => key.endsWith("shapes.vl") ? shapes : undefined);
  const src = 'import { Circle } from "./shapes"\n\nconst c: Circle = { r: 2.0 }\nc.\n';
  const cursor = { line: 3, character: 2 };
  const probe = ufcsProbeSource(src, stdProbeModules(checker), cursor);
  const candidates = await checker.ufcsCandidatesAt(
    probe.source,
    "/proj/main.vl",
    read,
    cursor.line + probe.lineOffset,
    cursor.character,
  );
  const names = candidates.map((c) => c.name);
  assert(names.includes("area"), `an exported self-fn is offered; got ${JSON.stringify(names)}`);
  assert(!names.includes("secret"), `a PRIVATE dep self-fn must not be offered; got ${JSON.stringify(names)}`);
  const area = candidates.find((c) => c.name === "area")!;
  assert(area.moduleKey === "/proj/shapes.vl", `declaring module; got ${area.moduleKey}`);
  const items = ufcsCompletions(src, "/proj/main.vl", candidates, () => false);
  const areaItem = items.find((i) => i.name === "area");
  assert(
    areaItem?.description === "./shapes",
    `the SPECIFIER, not the key, is shown; got ${JSON.stringify(areaItem?.description)}`,
  );
  const edit = areaItem?.extraEdits?.[0];
  if (edit === undefined) throw new Error("expected an import edit for the workspace module");
  // fmt sorts specifiers by CODE POINT, so `Circle` (67) precedes `area` (97) —
  // the same order the fallback hand-sort gives, which is why this holds with or
  // without a formatter.
  assert(
    edit.newText === 'import { Circle, area } from "./shapes"',
    `merged workspace import; got ${JSON.stringify(edit.newText)}`,
  );
});

Deno.test({
  name: "seed: a receiver with no UFCS candidates gets nothing extra",
  ignore,
}, async () => {
  const { checker, read } = checkerAndReader();
  // `Box` is local, no self-function anywhere accepts it, and no std module does.
  const src = "type Box = { n: i32 }\n\nconst b: Box = { n: 1 }\nb.\n";
  const cursor = { line: 3, character: 2 };
  const probe = ufcsProbeSource(src, stdProbeModules(checker), cursor);
  const candidates = await checker.ufcsCandidatesAt(
    probe.source,
    "/proj/main.vl",
    read,
    cursor.line + probe.lineOffset,
    cursor.character,
  );
  assert(
    candidates.length === 0,
    `no candidates for a plain struct; got ${JSON.stringify(candidates.map((c) => c.name))}`,
  );
});

// THE WHOLE PATH, seed to edit, with NO checker query in it. `checker.check`
// returns the diagnostic; its `code` is the bare category and its `data` carries
// the modules; `ufcsImportFixes` writes the import. That is the server's
// `onCodeAction` arm, which is why it no longer awaits anything.
Deno.test({
  name: "seed: the quick-fix appears on the D1230 diagnostic and applying it fixes the file",
  ignore,
}, async () => {
  const { checker, read } = checkerAndReader();
  const src = 'import { expect, it } from "std:test"\n\nit("x", () => {\n  expect(1 + 2).toEqual(3)\n})\n';
  const diags = await checker.check(src, "/proj/main.vl", read);
  const d1230 = diags.find((d) => d.code === "ufcs-not-imported");
  if (d1230 === undefined) {
    throw new Error(`expected the D1230 diagnostic; got ${JSON.stringify(diags.map((x) => x.message))}`);
  }
  assert(
    JSON.stringify(d1230.data) ===
      JSON.stringify({ member: ["toEqual"], modules: ["std:test"], recv: ["Expectation<i32>"] }),
    `the payload decodes to all three fields; got ${JSON.stringify(d1230.data)}`,
  );
  const name = ufcsMissingImportAt(src, d1230);
  assert(name === "toEqual", `the fix knows the member; got ${name}`);
  const fixes = ufcsImportFixes(
    src,
    name!,
    ufcsImportModules(d1230),
    (s, key, n) => importInsertionEdit(s, key, n, (stmt) => checker.formatSrc?.(stmt)),
  );
  assert(fixes.length === 1, `one action; got ${JSON.stringify(fixes.map((f) => f.title))}`);
  assert(
    fixes[0].title === 'Import `toEqual` from "std:test"',
    `title; got ${JSON.stringify(fixes[0].title)}`,
  );
  const edit = fixes[0].edits[0];
  const lines = src.split("\n");
  lines[edit.range.start.line] = lines[edit.range.start.line].slice(0, edit.range.start.character) +
    edit.newText + lines[edit.range.end.line].slice(edit.range.end.character);
  const after = await checker.check(lines.join("\n"), "/proj/main.vl", read);
  assert(
    after.length === 0,
    `applying the fix must clear the file; got ${JSON.stringify(after.map((d) => d.message))}`,
  );
});

// TWO MODULES, END TO END, and this is the case the old route could get wrong: it
// mapped checker module KEYS back to specifiers in the host. The payload carries
// the specifiers the compiler already chose, so both actions are offered and
// neither is preferred — the author picks.
Deno.test({
  name: "seed: two candidate modules yield two actions, both from the payload",
  ignore,
}, async () => {
  const mods: Record<string, string> = {
    "/proj/a.vl":
      "export type Box = { v: i32 }\nexport function box(v: i32): Box { return { v: v } }\nexport function area(self: Box): i32 { return self.v * self.v }\n",
    "/proj/b.vl":
      'import { Box } from "./a"\nexport function area(self: Box): i32 { return self.v + self.v }\nexport function other(): i32 { return 1 }\n',
  };
  const { checker, read } = checkerAndReader((key) => mods[key]);
  const src = 'import { box } from "./a"\nimport { other } from "./b"\n\nprint(box(5).area())\nprint(other())\n';
  const diags = await checker.check(src, "/proj/main.vl", read);
  const d1230 = diags.find((d) => d.code === "ufcs-not-imported");
  if (d1230 === undefined) {
    throw new Error(`expected the D1230 diagnostic; got ${JSON.stringify(diags.map((x) => x.message))}`);
  }
  const specs = ufcsImportModules(d1230);
  assert(
    JSON.stringify(specs) === JSON.stringify(["./a", "./b"]),
    `both specifiers, in the graph's order; got ${JSON.stringify(specs)}`,
  );
  const fixes = ufcsImportFixes(
    src,
    ufcsMissingImportAt(src, d1230)!,
    specs,
    (s, key, n) => importInsertionEdit(s, key, n, (stmt) => checker.formatSrc?.(stmt)),
  );
  assert(fixes.length === 2, `two actions; got ${JSON.stringify(fixes.map((f) => f.title))}`);
  assert(
    fixes.every((f) => f.isPreferred === undefined),
    "no default when the author must pick",
  );
  // Applying EITHER one clears the file, which is what makes them both real.
  for (const fix of fixes) {
    const edit = fix.edits[0];
    const lines = src.split("\n");
    lines[edit.range.start.line] = lines[edit.range.start.line].slice(0, edit.range.start.character) +
      edit.newText + lines[edit.range.end.line].slice(edit.range.end.character);
    const after = await checker.check(lines.join("\n"), "/proj/main.vl", read);
    assert(
      after.length === 0,
      `${fix.title} must clear the file; got ${JSON.stringify(after.map((d) => d.message))}`,
    );
  }
});

Deno.test({
  name: "seed: a string receiver reaches std:str, which the file never imported",
  ignore,
}, async () => {
  const { checker, read } = checkerAndReader();
  const src = 'const s = "hi"\ns.\n';
  const cursor = { line: 1, character: 2 };
  const probe = ufcsProbeSource(src, stdProbeModules(checker), cursor);
  const candidates = await checker.ufcsCandidatesAt(
    probe.source,
    "/proj/main.vl",
    read,
    cursor.line + probe.lineOffset,
    cursor.character,
  );
  const trim = candidates.find((c) => c.name === "trim");
  if (trim === undefined) {
    throw new Error(`std:str's trim must be reachable; got ${JSON.stringify(candidates.map((c) => c.name))}`);
  }
  assert(trim.moduleKey === "std:str", `module; got ${trim.moduleKey}`);
  const items = ufcsCompletions(src, "/proj/main.vl", candidates, () => false);
  const edit = items.find((i) => i.name === "trim")?.extraEdits?.[0];
  if (edit === undefined) throw new Error("expected a fresh import statement");
  assert(
    edit.newText.startsWith('import { trim } from "std:str"'),
    `a new import line; got ${JSON.stringify(edit.newText)}`,
  );
});
