// LSP-on-wasm Stage 1: the wasm-backed checker (`lsp/src/wasmChecker.ts`)
// drives the SELF-HOSTED compiler seed for editor diagnostics. These tests load
// the real seed (`build/vl-compiler.wasm`) — absent (fresh clone, no
// `refresh-compiler.sh` yet) they self-ignore with build instructions, the same
// convention as the native align suite. The diff helper tests run always.

import {
  diffDiagnostics,
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

const at = (line: number, ch: number, message: string): VLDiagnostic => ({
  message,
  severity: "error",
  source: "vital",
  range: { start: { line, character: ch }, end: { line, character: ch + 1 } },
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
