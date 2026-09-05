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
import { STD_SOURCES } from "../std/embedded.ts";

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
  // The insertion lands directly above a statement, so it carries the blank
  // line fmt guarantees between the import block and the first statement.
  assert(
    edit.newText === 'import { it } from "std:test"\n\n' &&
      edit.range.start.line === 0 && edit.range.start.character === 0,
    `top insertion; got ${JSON.stringify(edit)}`,
  );
});

Deno.test("auto-import: a new import directly above a statement carries the blank line", () => {
  // No blank after the import block (pre-fmt source): the inserted line lands
  // above `it(...)`, so it must bring the blank line with it to stay fmt-stable.
  const src = 'import { it } from "std:test"\nit("x", () => {})\n';
  const edit = importInsertionEdit(src, "std:fmt", "pad");
  if (edit === undefined) throw new Error("expected an edit");
  assert(
    edit.newText === 'import { pad } from "std:fmt"\n\n' &&
      edit.range.start.line === 1 && edit.range.start.character === 0,
    `insert with blank; got ${JSON.stringify(edit)}`,
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
    // A name a second module also exports.
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
    expect.description === "std:test",
    `the file already imports std:test, so that offer wins; got ${expect.description}`,
  );
  assert(
    expect.extraEdits !== undefined && expect.extraEdits.length === 1,
    "an auto-import item must carry its import rewrite",
  );
  assert(
    expect.extraEdits![0].newText === 'import { expect, it } from "std:test"',
    `the accepted item extends the statement already there; got ${
      JSON.stringify(expect.extraEdits![0].newText)
    }`,
  );
});

// ---- the provider rule when a name is re-exported (survey §3.5) --------------
//
// `std:fmt` re-exports `join` from `std:str`, so the surface offers it from two
// modules. The pick is: a module the file already imports from, else the module
// that DECLARES the name, else the sorted-first re-exporter.

const REEXPORT_CANDIDATES = new Map<string, StdExportCandidate[]>([
  // sorts FIRST, and only re-exports the name
  ["std:fmt", [{ name: "join", kind: "function", origin: "std:str" }]],
  ["std:str", [{ name: "join", kind: "function", detail: "(string[], string) => string" }]],
]);

Deno.test("auto-import: with neither module imported, the DECLARING module wins", () => {
  const src = 'const s = join(["a"], ",")\n';
  const items = stdAutoImportCompletions(src, REEXPORT_CANDIDATES, () => false);
  assert(items.length === 1, `one offer for one name; got ${items.length}`);
  assert(
    items[0].description === "std:str",
    `std:fmt sorts first but only re-exports; got ${items[0].description}`,
  );
});

Deno.test("auto-import: the module the file already imports wins over the declarer", () => {
  const src = 'import { toString } from "std:fmt"\n\nconst s = join(["a"], ",")\n';
  const items = stdAutoImportCompletions(src, REEXPORT_CANDIDATES, () => false);
  assert(
    items[0].description === "std:fmt",
    `the already-imported re-exporter wins; got ${items[0].description}`,
  );
  assert(
    items[0].extraEdits![0].newText ===
      'import { join, toString } from "std:fmt"',
    `it extends the statement instead of adding a second; got ${
      JSON.stringify(items[0].extraEdits![0].newText)
    }`,
  );
});

Deno.test("auto-import: a re-exporter is offered when it is the only provider", () => {
  const only = new Map<string, StdExportCandidate[]>([
    ["std:args", [{ name: "Utf8Error", kind: "function", origin: "std:utf8" }]],
  ]);
  const items = stdAutoImportCompletions("const x = 1\n", only, () => false);
  assert(
    items.length === 1 && items[0].description === "std:args",
    `a re-export with no declarer in the map is still offered; got ${
      JSON.stringify(items.map((i) => i.description))
    }`,
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

// The whole point, against the REAL std: `std/args.vl` re-exports `Utf8Error`
// precisely so a caller of `programArgs` needs no second import, and the editor
// never offered it — 86 of 86 files in the first external consumer import it
// from `std:utf8` instead (glean VL-002, survey §3.5).
Deno.test({
  name: "auto-import: a file importing std:args is offered Utf8Error from std:args",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const stdExports = new Map<string, StdExportCandidate[]>();
  for (const key of Object.keys(STD_SOURCES)) {
    stdExports.set(
      key,
      checker.moduleSurface(STD_SOURCES[key], key).exports.map((e) => ({
        name: e.name,
        kind: "function" as const,
        ...(e.origin === "" ? {} : { origin: e.origin }),
      })),
    );
  }
  const src = 'import { programArgs } from "std:args"\n' +
    "\n" +
    "const a = programArgs()\n" +
    "if a is Utf8Error { print(a.at) }\n";
  const items = stdAutoImportCompletions(
    src,
    stdExports,
    () => false,
    (stmt) => checker.formatSrc?.(stmt),
  );
  const item = items.find((c) => c.name === "Utf8Error");
  if (item === undefined) {
    throw new Error("Utf8Error must be offered");
  }
  assert(
    item.description === "std:args",
    `the module the file already imports; got ${item.description}`,
  );
  assert(
    item.extraEdits![0].newText === 'import { Utf8Error, programArgs } from "std:args"',
    `one statement, not two; got ${JSON.stringify(item.extraEdits![0].newText)}`,
  );

  // A name the file imports NEITHER provider of still comes from the declarer:
  // `std:fmt` re-exports `join` and sorts first, `std:str` declares it.
  const join = items.find((c) => c.name === "join");
  if (join === undefined) throw new Error("join must be offered");
  assert(
    join.description === "std:str",
    `the declaring module; got ${join.description}`,
  );
});
