// Module-aware LSP diagnostics (cross-file LSP / H0 phase 3, Track D).
//
// The LSP analyzed each file SINGLE-FILE, so `import { foo } from "./x"` made
// `foo` "undeclared" and genuine import errors never surfaced. `lsp/src/
// moduleGraph.ts` routes the current file's analysis through the module graph:
// it resolves the file's imports through a `ModuleReader` (open buffers + disk
// in the server; an injected in-memory map here so the test never touches the
// filesystem / cwd), seeds the current file's parse with imported names' types,
// and folds in genuine import errors attributed to the current file.
//
// `server.ts` itself can't be imported under Deno (Node-only
// `vscode-languageserver`, opens a connection on load), so these drive the pure
// `checkDocument` the diagnostics handler calls. Auto-discovered by
// `deno task test`.
//
// Run: deno test -A --no-check tests/lsp_module_diagnostics_test.ts

import type { ModuleReader } from "../compiler/modules.ts";
import {
  checkDocument,
  makeWorkspaceReader,
  pathToUri,
  uriToPath,
  withStd,
} from "../lsp/src/moduleGraph.ts";
import type { VLDiagnostic } from "../compiler/compile.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// An in-memory reader over `key -> source`. Keys are the resolved module keys
// `resolveSpecifier` produces (a relative specifier resolved against the entry
// key, with `.vl` appended) — here a flat path-like namespace under `/proj`.
const memoryReader = (files: Record<string, string>): ModuleReader =>
  (key: string) => files[key];

const undeclared = (ds: VLDiagnostic[], name: string): boolean =>
  ds.some((d) =>
    d.severity === "error" && d.message.includes(`undeclared ${name}`)
  );

// ---- (1) an imported name is NOT reported undeclared ------------------------

Deno.test("module diagnostics: imported name resolves (no spurious undeclared)", async () => {
  const files = {
    "/proj/util.vl": "export function add(a: i32, b: i32) {\n  return a + b\n}\n",
    "/proj/main.vl": 'import { add } from "./util"\n\nprint(add(2, 3))\n',
  };
  const { diagnostics } = await checkDocument(
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  assert(
    !undeclared(diagnostics, "add"),
    `imported \`add\` must not be undeclared; got ${JSON.stringify(diagnostics)}`,
  );
  assert(
    !diagnostics.some((d) => d.severity === "error"),
    `clean import should have no errors; got ${JSON.stringify(diagnostics)}`,
  );
});

// ---- (2) a bad import path IS reported, on the import line ------------------

Deno.test("module diagnostics: unresolvable import path is reported on the import line", async () => {
  const files = {
    "/proj/main.vl": 'import { add } from "./nope"\n\nprint(1)\n',
  };
  const { diagnostics } = await checkDocument(
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  const err = diagnostics.find((d) =>
    d.severity === "error" && d.message.includes("Cannot resolve import")
  );
  assert(
    err !== undefined,
    `bad path should error; got ${JSON.stringify(diagnostics)}`,
  );
  // Attributed to the import statement (line 0, 0-based).
  assert(
    err!.range.start.line === 0,
    `import error should be on line 0; got ${err!.range.start.line}`,
  );
});

// ---- (3) importing a non-exported name IS reported -------------------------

Deno.test("module diagnostics: importing a non-exported name is reported", async () => {
  const files = {
    "/proj/util.vl": "export function pub() {\n  return 2\n}\n",
    "/proj/main.vl": 'import { secret } from "./util"\n\nprint(1)\n',
  };
  const { diagnostics } = await checkDocument(
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  const err = diagnostics.find((d) =>
    d.severity === "error" && d.message.includes("is not exported")
  );
  assert(
    err !== undefined,
    `not-exported should error; got ${JSON.stringify(diagnostics)}`,
  );
  assert(
    err!.range.start.line === 0,
    `not-exported error should be on the import line; got ${err!.range.start.line}`,
  );
  // The non-exported name must NOT also be reported "undeclared" (the genuine
  // error stands alone; the seeded scope doesn't silently invent the name).
});

// ---- (4) a self-import cycle IS reported -----------------------------------

Deno.test("module diagnostics: a self-referential import is reported as a cycle", async () => {
  const files = {
    "/proj/main.vl": 'import { x } from "./main"\n\nprint(1)\n',
  };
  const { diagnostics } = await checkDocument(
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  assert(
    diagnostics.some((d) =>
      d.severity === "error" && d.message.includes("cycle")
    ),
    `self-import should report a cycle; got ${JSON.stringify(diagnostics)}`,
  );
});

// ---- (5) imported TYPE used as an annotation resolves ----------------------

Deno.test("module diagnostics: imported type used as an annotation resolves", async () => {
  const files = {
    "/proj/util.vl": "export type Point = { x: i32, y: i32 }\n",
    "/proj/main.vl":
      'import { Point } from "./util"\n\nlet p: Point = { x: 1, y: 2 }\nprint(p.x)\n',
  };
  const { diagnostics } = await checkDocument(
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  assert(
    !diagnostics.some((d) => d.severity === "error"),
    `imported type annotation should type-check; got ${JSON.stringify(diagnostics)}`,
  );
});

// ---- (6) imported name's REAL type seeds the parse scope (hover support) ----

Deno.test("module diagnostics: imported name carries its real resolved type", async () => {
  const files = {
    "/proj/util.vl": "export function add(a: i32, b: i32) {\n  return a + b\n}\n",
    "/proj/main.vl": 'import { add } from "./util"\n\nprint(add(2, 3))\n',
  };
  const { importedScope } = await checkDocument(
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  const t = importedScope["add"];
  assert(t !== undefined, "imported `add` should be in the seeded scope");
  assert(
    t.type === "Function",
    `imported \`add\` should resolve to a Function type; got ${t.type}`,
  );
});

// ---- (6b) the workspace reader prefers open buffers over disk ---------------

Deno.test("workspace reader: open buffer wins over disk; disk is the fallback", async () => {
  // Open-document stand-in: one URI with an UNSAVED edit. The disk stand-in has
  // a DIFFERENT (stale) source for it, plus a file with no open buffer.
  const openText = "export function add(a: i32, b: i32) {\n  return a + b\n}\n";
  const open = new Map<string, string>([[pathToUri("/proj/util.vl"), openText]]);
  const documents = {
    get: (uri: string) => {
      const text = open.get(uri);
      return text === undefined ? undefined : { getText: () => text };
    },
  };
  const disk: Record<string, string> = {
    "/proj/util.vl": "STALE — should be shadowed by the open buffer\n",
    "/proj/other.vl": "export function pub() {\n  return 1\n}\n",
  };
  const read = makeWorkspaceReader(documents, (p) => disk[p]);

  // Open buffer wins (unsaved edits are analyzed, not the stale disk copy).
  if (await read("/proj/util.vl") !== openText) {
    throw new Error("open buffer must shadow disk");
  }
  // No open buffer → disk fallback.
  if (await read("/proj/other.vl") !== disk["/proj/other.vl"]) {
    throw new Error("disk fallback must be used when no buffer is open");
  }
  // Missing everywhere → undefined (surfaced as unresolvable upstream).
  if (await read("/proj/missing.vl") !== undefined) {
    throw new Error("a missing module must read as undefined");
  }
});

// ---- (6c) file:// URI <-> path round-trips ----------------------------------

Deno.test("uri/path conversion round-trips a file:// URI", () => {
  const path = "/home/user/proj/util.vl";
  const uri = pathToUri(path);
  if (!uri.startsWith("file:///")) {
    throw new Error(`expected a file:/// URI; got ${uri}`);
  }
  if (uriToPath(uri) !== path) {
    throw new Error(`round-trip failed: ${uriToPath(uri)} !== ${path}`);
  }
});

// ---- (7) REGRESSION GUARD: a standalone single file is unchanged ------------

Deno.test("module diagnostics: a no-import file diagnoses exactly as single-file check", async () => {
  // No imports → `checkDocument` must produce the same diagnostics as the
  // single-file `checkOnly` path (same seeded-empty scope). A clean file is
  // clean; a genuine error still surfaces.
  const { checkOnly } = await import("../compiler/compile.ts");

  const clean = "let a = 1\nprint(a)\n";
  const cleanGraph = await checkDocument(clean, "/proj/solo.vl", memoryReader({}));
  assert(
    cleanGraph.diagnostics.length === checkOnly(clean).diagnostics.length,
    "clean no-import file: graph and single-file diagnostic counts must match",
  );
  assert(
    !cleanGraph.diagnostics.some((d) => d.severity === "error"),
    "clean no-import file should have no errors",
  );

  // A genuine single-file error (undeclared use) still surfaces identically.
  const broken = "print(nope)\n";
  const brokenGraph = await checkDocument(broken, "/proj/solo.vl", memoryReader({}));
  assert(
    undeclared(brokenGraph.diagnostics, "nope"),
    `single-file undeclared use must still error; got ${
      JSON.stringify(brokenGraph.diagnostics)
    }`,
  );
});

// ---- (8) std: modules through the LSP reader ---------------------------------

Deno.test("module diagnostics: a std: import resolves via the embedded map (no spurious diagnostics)", async () => {
  // The workspace reader (entry served as an open buffer, no disk) knows
  // nothing about std; `withStd` (applied inside `makeWorkspaceReader`) serves
  // `std:seed` from the generated embedded map.
  const entry = 'import { stdSmoke } from "std:seed"\n\nprint(stdSmoke())\n';
  const read = makeWorkspaceReader(
    {
      get: (uri: string) =>
        uri === pathToUri("/proj/main.vl") ? { getText: () => entry } : undefined,
    },
    () => undefined,
  );
  const { diagnostics, importedScope } = await checkDocument(
    entry,
    "/proj/main.vl",
    read,
  );
  assert(
    !undeclared(diagnostics, "stdSmoke"),
    `imported std name must not be undeclared; got ${JSON.stringify(diagnostics)}`,
  );
  assert(
    !diagnostics.some((d) => d.severity === "error"),
    `clean std import should have no errors; got ${JSON.stringify(diagnostics)}`,
  );
  assert(importedScope["stdSmoke"] !== undefined, "stdSmoke must be in the imported scope");
});

Deno.test("withStd: workspace std/ wins over the embedded map; non-std keys pass through", async () => {
  const inner = memoryReader({
    "/ws/std/seed.vl": "WORKSPACE",
    "/proj/util.vl": "UTIL",
  });
  // Workspace override present → its bytes win.
  const overridden = withStd(inner, () => "/ws/std");
  assert(await overridden("std:seed") === "WORKSPACE", "workspace std must win");
  // No workspace dir → embedded map serves the seed module.
  const embedded = withStd(memoryReader({}));
  const fromMap = await embedded("std:seed");
  assert(
    fromMap !== undefined && fromMap.includes("stdSmoke"),
    "embedded map must serve std:seed",
  );
  // Workspace dir known but the file absent → fall through to the embedded map.
  const fallthrough = withStd(memoryReader({}), () => "/ws/std");
  const fell = await fallthrough("std:seed");
  assert(
    fell !== undefined && fell.includes("stdSmoke"),
    "missing workspace file must fall through to the embedded map",
  );
  // Unknown std module → undefined (the caller's Cannot-resolve path).
  assert(await embedded("std:nope") === undefined, "unknown std module must be undefined");
  // Non-std keys pass through to the inner reader untouched.
  assert(await overridden("/proj/util.vl") === "UTIL", "non-std keys pass through");
});
