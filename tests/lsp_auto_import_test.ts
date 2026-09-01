// std auto-import completions (LSP): a std-module export that is NOT in scope
// is offered as a completion whose accept ALSO rewrites the import statement
// (`additionalTextEdits`), placed where `vl fmt` keeps it (fmt sorts a
// statement's specifiers alphabetically). Pure-helper tests for
// `importInsertionEdit` / `stdAutoImportCompletions` (`lsp/src/typeFeatures.ts`)
// plus seed-backed checks: the real formatter spelling, and the native
// `scopeAt` module filter these items depend on (dep-module bindings no longer
// leak into entry completions — only the entry's own bindings + its imports).
//
// Run: deno test -A --no-check tests/lsp_auto_import_test.ts

import {
  importInsertionEdit,
  stdAutoImportCompletions,
  type StdExportCandidate,
} from "../lsp/src/typeFeatures.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { makeWorkspaceReader } from "../lsp/src/moduleGraph.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// ---- importInsertionEdit: merge into an existing import ----------------------

Deno.test("auto-import: merges into an existing import, alphabetically (fallback)", () => {
  const src = 'import { it } from "std:test"\n\nit("x", () => {})\n';
  const edit = importInsertionEdit(src, "std:test", "expect");
  if (edit === undefined) throw new Error("expected an edit");
  assert(
    edit.newText === 'import { expect, it } from "std:test"',
    `sorted merge; got ${JSON.stringify(edit.newText)}`,
  );
  assert(
    edit.range.start.line === 0 && edit.range.start.character === 0,
    `edit must start at the statement; got ${JSON.stringify(edit.range.start)}`,
  );
  assert(
    edit.range.end.line === 0 &&
      edit.range.end.character === 'import { it } from "std:test"'.length,
    `edit must span the whole statement; got ${JSON.stringify(edit.range.end)}`,
  );
});

Deno.test("auto-import: the formatter spells the merged statement when supplied", () => {
  const src = 'import { it } from "std:test"\n';
  const seen: string[] = [];
  const edit = importInsertionEdit(src, "std:test", "expect", (stmt) => {
    seen.push(stmt);
    return 'import { expect, it } from "std:test"\n';
  });
  assert(edit !== undefined, "expected an edit");
  assert(
    edit!.newText === 'import { expect, it } from "std:test"',
    `formatter output (trimmed) wins; got ${JSON.stringify(edit!.newText)}`,
  );
  assert(
    seen.length === 1 && seen[0].includes("expect") && seen[0].includes("it"),
    `formatter must see the merged statement; got ${JSON.stringify(seen)}`,
  );
});

Deno.test("auto-import: a name already imported (plain or alias source) yields no edit", () => {
  const plain = 'import { expect, it } from "std:test"\n';
  assert(
    importInsertionEdit(plain, "std:test", "expect") === undefined,
    "plain: already imported",
  );
  const aliased = 'import { expect as check } from "std:test"\n';
  assert(
    importInsertionEdit(aliased, "std:test", "expect") === undefined,
    "alias source: already imported",
  );
});

Deno.test("auto-import: a multi-line import statement is replaced whole", () => {
  const src = 'import {\n  it,\n  describe,\n} from "std:test"\nprint(1)\n';
  const edit = importInsertionEdit(src, "std:test", "expect");
  if (edit === undefined) throw new Error("expected an edit");
  assert(
    edit.newText === 'import { describe, expect, it } from "std:test"',
    `merged sorted; got ${JSON.stringify(edit.newText)}`,
  );
  assert(
    edit.range.end.line === 3,
    `end must be on the statement's last line; got ${edit.range.end.line}`,
  );
});

// ---- importInsertionEdit: a fresh statement ----------------------------------

Deno.test("auto-import: a new import lands after the last existing import", () => {
  const src = 'import { trim } from "std:str"\nimport { it } from "std:test"\n\nit("x", () => {})\n';
  const edit = importInsertionEdit(src, "std:fmt", "pad");
  if (edit === undefined) throw new Error("expected an edit");
  assert(
    edit.newText === 'import { pad } from "std:fmt"\n' &&
      edit.range.start.line === 2 && edit.range.start.character === 0 &&
      edit.range.end.line === 2 && edit.range.end.character === 0,
    `insert on the line after the last import; got ${JSON.stringify(edit)}`,
  );
});

Deno.test("auto-import: a file with no imports gets one at the very top", () => {
  const src = 'print("hi")\n';
  const edit = importInsertionEdit(src, "std:test", "it");
  if (edit === undefined) throw new Error("expected an edit");
  assert(
    edit.newText === 'import { it } from "std:test"\n' &&
      edit.range.start.line === 0 && edit.range.start.character === 0,
    `top insertion; got ${JSON.stringify(edit)}`,
  );
});

// ---- stdAutoImportCompletions ------------------------------------------------

const CANDIDATES = new Map<string, StdExportCandidate[]>([
  ["std:test", [
    { name: "it", kind: "function", detail: "(string, () => void) => void" },
    { name: "expect", kind: "function", detail: "(i32) => Expectation" },
  ]],
  ["std:str", [
    { name: "trim", kind: "function", detail: "(string) => string" },
    // A name a second module also exports — sorted-key order makes std:str win.
    { name: "expect", kind: "function" },
  ]],
]);

Deno.test("auto-import completions: skips in-scope names, carries module + edit", () => {
  const src = 'import { it } from "std:test"\n\nit("x", () => {})\n';
  const items = stdAutoImportCompletions(src, CANDIDATES, (n) => n === "it");
  const names = items.map((c) => c.name).sort();
  assert(
    names.join(",") === "expect,trim",
    `it is in scope, the rest offered once each; got ${JSON.stringify(names)}`,
  );
  const expect = items.find((c) => c.name === "expect")!;
  assert(
    expect.description === "std:str",
    `sorted-key order dedupe: std:str wins; got ${expect.description}`,
  );
  assert(
    expect.extraEdits !== undefined && expect.extraEdits.length === 1,
    "an auto-import item must carry its import rewrite",
  );
});

// ---- seed-backed: real formatter spelling + the native scopeAt filter --------

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

Deno.test({ name: "auto-import: the seed's formatter sorts the merged specifiers", ignore }, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const src = 'import { it } from "std:test"\n\nit("x", () => {})\n';
  const edit = importInsertionEdit(
    src,
    "std:test",
    "expect",
    (stmt) => checker.formatSrc?.(stmt),
  );
  if (edit === undefined) throw new Error("expected an edit");
  if (edit.newText !== 'import { expect, it } from "std:test"') {
    throw new Error(`fmt spelling; got ${JSON.stringify(edit.newText)}`);
  }
});

Deno.test({
  name: "scopeAt filter: a dep module's internals and un-imported exports stay out of entry scope",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const reader = makeWorkspaceReader({ get: () => undefined }, () => undefined, () => undefined);
  const entry = 'import { it } from "std:test"\n\nlet localX = 1\nit("ok", () => {\n  print(localX)\n})\n';
  const scope = await checker.scopeAt(entry, "/proj/main.vl", reader, 4, 2);
  const names = scope.map((b) => b.name);
  if (!names.includes("it")) throw new Error(`the import must stay; got ${JSON.stringify(names)}`);
  if (!names.includes("localX")) throw new Error(`entry locals must stay; got ${JSON.stringify(names)}`);
  if (names.includes("expect")) {
    throw new Error(`an un-imported std export leaked: ${JSON.stringify(names)}`);
  }
  const internal = names.find((n) => n.startsWith("vlt"));
  if (internal !== undefined) {
    throw new Error(`a std internal leaked: ${internal}`);
  }
  const mangled = scope.find((b) => b.type.includes("$m"));
  if (mangled !== undefined) {
    throw new Error(
      `a mangled type leaked: ${mangled.name}: ${mangled.type}`,
    );
  }
});
