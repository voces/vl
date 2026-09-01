// LOSSLESS RECOVERY, STAGE 1 — THE EDITOR PAYOFF, through the LSP's own path.
//
// The server compiles on every keystroke, so a file is mid-edit — and therefore
// syntactically broken — most of the time it is being read. Until now ANY parse
// diagnostic made `checkSrc` return before the checker ran, so the moment a brace
// was missing the editor lost EVERY type diagnostic in the file: squiggles
// vanished wholesale, and came back only when the syntax was repaired.
//
// The stage-1 rule (DECISIONS.md, 2026-09-01) lifts that bail for files whose
// every parse diagnostic is a LOSSLESS recovery — the unbraced-body arm, where
// the recovered statement is exactly the one the user wrote. This suite asserts
// it at the surface the LSP actually uses (`wasmChecker.check` / `.lint` /
// `.hoverTypeAt`), not just at the CLI: the driver has SIX pipeline entry points
// past the parser and they were gated one by one, so a CLI-only test would pass
// with the editor path still bailing.
//
// Seed-gated (self-ignores without `build/vl-compiler.wasm`), like every other
// `lsp_*_wasm_test.ts`; wired into ci.yml's "Editor features on the wasm
// compiler" step, which is what makes it run in CI at all.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

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

const BRACES = "an `if` body requires braces: `if cond { … }`";
const TYPE_ERR = "cannot assign string to 'n' of type i32";

// Mid-edit: the `if` body's braces are not typed yet, and there is a real type
// error further down the file.
const RECOVERED = 'const c = true\nif c print(1)\nconst n: i32 = "hi"\nprint(n)\n';

const fmt = (ds: { message: string; range: { start: { line: number } } }[]) =>
  ds.map((d) => `${d.range.start.line}: ${d.message}`).join("; ") || "(none)";

Deno.test({
  name: "lsp lossless: a missing brace and a later type error BOTH reach the editor",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const diags = await checker.check(RECOVERED, "/tmp/recovered.vl", noSiblings);
  if (diags.length !== 2) {
    throw new Error(`want 2 diagnostics, got ${diags.length}: ${fmt(diags)}`);
  }
  const parse = diags.find((d) => d.message === BRACES);
  const type = diags.find((d) => d.message === TYPE_ERR);
  if (parse === undefined || type === undefined) {
    throw new Error(`want the parse AND the type diagnostic, got: ${fmt(diags)}`);
  }
  // LSP positions are 0-based: the recovery is on source line 2, the type error
  // on line 3.
  if (parse.range.start.line !== 1) {
    throw new Error(`parse diagnostic on line ${parse.range.start.line}, want 1`);
  }
  if (type.range.start.line !== 2) {
    throw new Error(`type diagnostic on line ${type.range.start.line}, want 2`);
  }
  // Both are errors, and each carries a real span (not a zero-width caret).
  for (const d of [parse, type]) {
    if (d.severity !== "error") {
      throw new Error(`want severity error, got ${d.severity} on ${d.message}`);
    }
    if (d.range.end.character <= d.range.start.character) {
      throw new Error(`want a non-empty range on ${d.message}`);
    }
  }
});

// The negative half, at the same surface: a LOSSY parse error still suppresses
// the checker, so no phantom type diagnostic reaches the editor either. `f(1 2)`
// re-parses to a hole-free `f(1)` — the arity error a run checker would raise is
// about a call the user never wrote.
Deno.test({
  name: "lsp lossless: a lossy parse error still suppresses the type tier",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const diags = await checker.check(
    "function f(a: i32, b: i32) { a + b }\nprint(f(1 2))\n",
    "/tmp/lossy.vl",
    noSiblings,
  );
  if (diags.some((d) => d.message.includes("wrong number of arguments"))) {
    throw new Error(`phantom arity error reached the editor: ${fmt(diags)}`);
  }
  if (!diags.some((d) => d.message.includes("expected `)`"))) {
    throw new Error(`want the parse diagnostic itself, got: ${fmt(diags)}`);
  }
});

// The lint tier shares the gate, so an editor keeps its greyed-out unused
// bindings across a missing brace too.
Deno.test({
  name: "lsp lossless: lint still runs over a recovered file",
  ignore,
}, () => {
  const checker = loadWasmChecker(SEED, log)!;
  const diags = checker.lint("const c = true\nif c print(1)\nlet unusedX = 5\n");
  if (!diags.some((d) => d.code === "unused-variable")) {
    throw new Error(`want the unused-variable lint, got: ${fmt(diags)}`);
  }
  // …and still returns [] for a LOSSY one (`function f( {` drops tokens).
  if (checker.lint("function f( {\n").length !== 0) {
    throw new Error("want [] on a lossy parse error");
  }
});

// THE RESET, on ONE instance — the shape only the LSP produces. The flag column
// is keyed by `P.diags` INDEX, so an entry left behind by the previous keystroke
// claims THIS file's diagnostic 0 was lossless. The editor re-enters `checkSrc`
// on a single wasm instance per keystroke, so "check a recovered file, then a
// lossy one" is a sequence a user types in under a second — and a missing reset
// makes the second check invent the phantom. Order matters here: the lossless
// file must go FIRST, or there is nothing stale to leak.
Deno.test({
  name: "lsp lossless: the flag column does not leak across checks on one instance",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const first = await checker.check(RECOVERED, "/tmp/a.vl", noSiblings);
  if (!first.some((d) => d.message === TYPE_ERR)) {
    throw new Error(`setup: want the recovered file to typecheck, got: ${fmt(first)}`);
  }
  const second = await checker.check(
    "function f(a: i32, b: i32) { a + b }\nprint(f(1 2))\n",
    "/tmp/b.vl",
    noSiblings,
  );
  if (second.some((d) => d.message.includes("wrong number of arguments"))) {
    throw new Error(
      `a stale lossless mark from the PREVIOUS check let the phantom through: ${
        fmt(second)
      }`,
    );
  }
  // …and back the other way: the recovered file still typechecks after the lossy
  // one, so the reset does not leave the column wrongly EMPTY either.
  const third = await checker.check(RECOVERED, "/tmp/c.vl", noSiblings);
  if (!third.some((d) => d.message === TYPE_ERR)) {
    throw new Error(`want the type error again on re-check, got: ${fmt(third)}`);
  }
});

// `checkSrcSym` is a THIRD entry point with its own copy of the bail, and it is
// what serves hover / go-to-definition / find-references. Gating it separately
// is the difference between "the squiggles came back" and "the editor works".
Deno.test({
  name: "lsp lossless: hover still answers inside a recovered file",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // `n` is declared on line 3 (0-based 2) at column 6, in a file whose line 2
  // holds the unbraced-`if` recovery.
  const ty = await checker.hoverTypeAt(
    "const c = true\nif c print(1)\nconst n = 41 + 1\nprint(n)\n",
    "/tmp/recovered.vl",
    noSiblings,
    2,
    6,
  );
  if (ty !== "i32") {
    throw new Error(`want i32 for n across the recovery, got ${JSON.stringify(ty)}`);
  }
});
