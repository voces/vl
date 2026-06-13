// LSP-on-wasm Stage 1: the wasm-backed checker (`lsp/src/wasmChecker.ts`)
// drives the SELF-HOSTED compiler seed for editor diagnostics. These tests load
// the real seed (`build/vl-compiler.wasm`) — absent (fresh clone, no
// `refresh-compiler.sh` yet) they self-ignore with build instructions, the same
// convention as the native align suite. The diff helper tests run always.

import {
  diffDefinition,
  diffDiagnostics,
  diffHoverType,
  diffReferences,
  loadWasmChecker,
} from "../lsp/src/wasmChecker.ts";
import type { VLDiagnostic } from "../compiler/compile.ts";

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
const logs: string[] = [];
const log = (m: string) => logs.push(m);

const noSiblings = () => undefined;

Deno.test({ name: "wasm-checker: missing seed degrades to undefined", ignore }, () => {
  const checker = loadWasmChecker("/nonexistent/vl-compiler.wasm", log);
  if (checker !== undefined) throw new Error("expected undefined for a missing seed");
});

Deno.test({ name: "wasm-checker: clean source yields zero diagnostics", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const diags = await checker.check("print(1 + 2)\n", "/tmp/x.vl", noSiblings);
  if (diags.length !== 0) {
    throw new Error(`expected clean, got: ${diags.map((d) => d.message).join("; ")}`);
  }
});

Deno.test({ name: "wasm-checker: a type error carries a message and a non-empty range", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const diags = await checker.check(
    'const x: i32 = "nope"\nprint(x)\n',
    "/tmp/x.vl",
    noSiblings,
  );
  if (diags.length === 0) throw new Error("expected a type error");
  const d = diags[0];
  if (d.severity !== "error" || d.message.length === 0) {
    throw new Error(`bad diagnostic: ${JSON.stringify(d)}`);
  }
  if (d.range.start.line !== 0) {
    throw new Error(`expected line 0, got ${d.range.start.line}`);
  }
  if (d.range.end.character <= d.range.start.character) {
    throw new Error(
      `expected a non-empty range (diagEndCol), got ${JSON.stringify(d.range)}`,
    );
  }
});

Deno.test({ name: "wasm-checker: imports resolve through the injected reader", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const util = "export function add(a: i32, b: i32): i32 { return a + b }\n";
  const entry = 'import { add } from "./util"\nprint(add(2, 3))\n';
  const reads: string[] = [];
  const read = (key: string) => {
    reads.push(key);
    return key.endsWith("util.vl") ? util : undefined;
  };
  const diags = await checker.check(entry, "/proj/main.vl", read);
  if (reads.length === 0) throw new Error("reader was never consulted");
  if (diags.length !== 0) {
    throw new Error(`expected clean, got: ${diags.map((d) => d.message).join("; ")}`);
  }
  // And state isolation: an immediately following SINGLE-FILE check must not
  // see the module table (the modReset-per-check contract).
  const after = await checker.check("print(7)\n", "/tmp/y.vl", noSiblings);
  if (after.length !== 0) {
    throw new Error(`module state leaked: ${after.map((d) => d.message).join("; ")}`);
  }
});

Deno.test({ name: "wasm-checker: a missing import is a diagnostic, not a crash", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const diags = await checker.check(
    'import { gone } from "./nowhere"\nprint(1)\n',
    "/proj/main.vl",
    noSiblings,
  );
  if (diags.length === 0) throw new Error("expected an unresolvable-import diagnostic");
});

Deno.test({ name: "wasm-checker: a std: import resolves through withStd (embedded map)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The injected reader knows NOTHING about std — the fetch loop's withStd
  // wrapper serves `std:seed` from the embedded map.
  const diags = await checker.check(
    'import { stdSmoke } from "std:seed"\nprint(stdSmoke())\n',
    "/proj/main.vl",
    noSiblings,
  );
  if (diags.length !== 0) {
    throw new Error(`expected clean, got: ${diags.map((d) => d.message).join("; ")}`);
  }
  // An unknown std module falls out as the existing Cannot-resolve diagnostic.
  const bad = await checker.check(
    'import { x } from "std:nope"\nprint(1)\n',
    "/proj/main.vl",
    noSiblings,
  );
  if (!bad.some((d) => d.message.includes("Cannot resolve import"))) {
    throw new Error(
      `expected a Cannot-resolve diagnostic for std:nope, got: ${
        bad.map((d) => d.message).join("; ")
      }`,
    );
  }
});

Deno.test({ name: "wasm-checker: a workspace std/ dir wins over the embedded map", ignore }, async () => {
  // The workspace's std/seed.vl declares a DIFFERENT stdSmoke arity; the
  // zero-arg call that is clean against the embedded map must now error —
  // proving the workspace override took precedence.
  const checker = loadWasmChecker(SEED, log, () => "/ws/std")!;
  const read = (key: string) =>
    key === "/ws/std/seed.vl"
      ? "export function stdSmoke(n: i32): i32 {\n  return n\n}\n"
      : undefined;
  const diags = await checker.check(
    'import { stdSmoke } from "std:seed"\nprint(stdSmoke())\n',
    "/proj/main.vl",
    read,
  );
  if (diags.length === 0) {
    throw new Error("expected an arity error against the workspace std override");
  }
});

// ── Stage 2: native symbols (go-to-def / find-refs / hover types) ────────────

// A fixture with a top-level binding declared once and used twice, plus a typed
// function and a parameter — enough to exercise every Stage-2 query.
const SYM_FIXTURE =
  `const greeting: string = "hi"
function add(a: i32, b: i32): i32 {
  return a + b
}
function main(): i32 {
  let total = add(1, 2)
  print(total)
  return total
}
`;
// `total` is declared on LSP line 5 (0-based), used on lines 6 and 7. Its name
// `total` starts at column 6 on the declaration line; a cursor anywhere in the
// name resolves. We probe the use inside `print(total)` (line 6).
const TOTAL_USE = { line: 6, character: 9 };
const TOTAL_DECL_LINE = 5;

Deno.test({ name: "wasm-symbols: definitionAt jumps to the declaration", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const def = await checker.definitionAt(
    SYM_FIXTURE,
    "/tmp/x.vl",
    noSiblings,
    TOTAL_USE.line,
    TOTAL_USE.character,
  );
  if (def === undefined) throw new Error("expected a definition span");
  if (def.start.line !== TOTAL_DECL_LINE) {
    throw new Error(`expected decl on line ${TOTAL_DECL_LINE}, got ${def.start.line}`);
  }
  if (def.start.character !== 6) {
    throw new Error(`expected decl at column 6, got ${def.start.character}`);
  }
});

Deno.test({ name: "wasm-symbols: referencesAt returns the decl + all uses", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const refs = await checker.referencesAt(
    SYM_FIXTURE,
    "/tmp/x.vl",
    noSiblings,
    TOTAL_USE.line,
    TOTAL_USE.character,
    true,
  );
  // decl (line 5) + two uses (lines 6, 7).
  const lines = refs.map((r) => r.start.line).sort((a, b) => a - b);
  if (refs.length !== 3) {
    throw new Error(`expected 3 occurrences, got ${refs.length}: ${JSON.stringify(lines)}`);
  }
  if (lines[0] !== 5 || lines[1] !== 6 || lines[2] !== 7) {
    throw new Error(`unexpected reference lines: ${JSON.stringify(lines)}`);
  }
  // includeDeclaration=false drops the decl (line 5).
  const noDecl = await checker.referencesAt(
    SYM_FIXTURE,
    "/tmp/x.vl",
    noSiblings,
    TOTAL_USE.line,
    TOTAL_USE.character,
    false,
  );
  if (noDecl.length !== 2 || noDecl.some((r) => r.start.line === 5)) {
    throw new Error(
      `includeDeclaration=false should drop the decl, got lines ${
        JSON.stringify(noDecl.map((r) => r.start.line))
      }`,
    );
  }
});

Deno.test({ name: "wasm-symbols: hoverTypeAt renders a non-empty type", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The `total` use — its binding is `i32`.
  const totalTy = await checker.hoverTypeAt(
    SYM_FIXTURE,
    "/tmp/x.vl",
    noSiblings,
    TOTAL_USE.line,
    TOTAL_USE.character,
  );
  if (totalTy !== "i32") throw new Error(`expected i32 for total, got ${JSON.stringify(totalTy)}`);
  // The `greeting` declaration on line 0 — its name starts at column 6.
  const greetTy = await checker.hoverTypeAt(SYM_FIXTURE, "/tmp/x.vl", noSiblings, 0, 6);
  if (greetTy !== "string") {
    throw new Error(`expected string for greeting, got ${JSON.stringify(greetTy)}`);
  }
  // The `add` function declaration on line 1 — its name starts at column 9.
  const addTy = await checker.hoverTypeAt(SYM_FIXTURE, "/tmp/x.vl", noSiblings, 1, 9);
  if (addTy !== "(i32, i32) -> i32") {
    throw new Error(`expected the function type for add, got ${JSON.stringify(addTy)}`);
  }
  // A cursor off any binding (column 0 of a blank-ish position) yields undefined.
  const none = await checker.hoverTypeAt(SYM_FIXTURE, "/tmp/x.vl", noSiblings, 2, 0);
  if (none !== undefined && none !== "") {
    throw new Error(`expected no type off a binding, got ${JSON.stringify(none)}`);
  }
});

Deno.test({ name: "wasm-symbols: an imported name resolves through the reader", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const util = "export function add(a: i32, b: i32): i32 { return a + b }\n";
  const entry = 'import { add } from "./util"\nlet s = add(2, 3)\nprint(s)\n';
  const read = (key: string) => (key.endsWith("util.vl") ? util : undefined);
  // `s` is a local binding (line 1, name at column 4) typed by an imported call —
  // its definition + hover come from the native symbol table through the reader.
  const def = await checker.definitionAt(entry, "/proj/main.vl", read, 2, 6);
  if (def === undefined || def.start.line !== 1) {
    throw new Error(`expected s's decl on line 1, got ${JSON.stringify(def)}`);
  }
  const ty = await checker.hoverTypeAt(entry, "/proj/main.vl", read, 1, 4);
  if (ty !== "i32") throw new Error(`expected i32 for s, got ${JSON.stringify(ty)}`);
});

const at = (line: number, ch: number, message: string): VLDiagnostic => ({
  message,
  severity: "error",
  source: "vital",
  range: { start: { line, character: ch }, end: { line, character: ch + 1 } },
});

const rng = (sl: number, sc: number, el: number, ec: number) => ({
  start: { line: sl, character: sc },
  end: { line: el, character: ec },
});

Deno.test("wasm-parity diff: definition agreement (same start) is no divergence", () => {
  const d = diffDefinition(rng(5, 6, 5, 11), rng(5, 6, 5, 99));
  if (d !== undefined) throw new Error(`expected no divergence, got: ${d}`);
});

Deno.test("wasm-parity diff: definition start mismatch reports", () => {
  const d = diffDefinition(rng(5, 6, 5, 11), rng(7, 0, 7, 4));
  if (d === undefined || !d.includes("5:6") || !d.includes("7:0")) {
    throw new Error(`bad definition divergence: ${d}`);
  }
});

Deno.test("wasm-parity diff: reference sets match order-independently", () => {
  const a = [rng(5, 6, 5, 11), rng(6, 8, 6, 13)];
  const b = [rng(6, 8, 6, 13), rng(5, 6, 5, 11)];
  if (diffReferences(a, b) !== undefined) {
    throw new Error("expected no divergence for the same set in a different order");
  }
});

Deno.test("wasm-parity diff: hover type wording is compared exactly", () => {
  if (diffHoverType("i32", "i32") !== undefined) {
    throw new Error("expected no divergence for identical types");
  }
  const d = diffHoverType("i32", "I32");
  if (d === undefined || !d.includes("i32") || !d.includes("I32")) {
    throw new Error(`bad hover divergence: ${d}`);
  }
});

Deno.test("wasm-parity diff: same positions (different wording) is no divergence", () => {
  const d = diffDiagnostics([at(2, 4, "expected i32")], [at(2, 4, "type mismatch")]);
  if (d !== undefined) throw new Error(`expected no divergence, got:\n${d}`);
});

Deno.test("wasm-parity diff: lint warnings on the TS side are excluded", () => {
  const warn: VLDiagnostic = { ...at(1, 0, "unused"), severity: "warning" };
  const d = diffDiagnostics([warn], []);
  if (d !== undefined) throw new Error(`expected no divergence, got:\n${d}`);
});

Deno.test("wasm-parity diff: a missing error reports both lists", () => {
  const d = diffDiagnostics([at(2, 4, "expected i32")], []);
  if (d === undefined || !d.includes("ts errors (1)") || !d.includes("wasm errors (0)")) {
    throw new Error(`bad divergence report: ${d}`);
  }
});
