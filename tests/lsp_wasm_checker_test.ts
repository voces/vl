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
} from "../lsp/src/wasmCheckerNode.ts";
import type { VLDiagnostic } from "../compiler/diagnostics.ts";

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
  // A plain type-soundness rejection carries NO category code.
  if (d.code !== undefined) {
    throw new Error(`expected no code on a type error, got ${JSON.stringify(d.code)}`);
  }
});

Deno.test({ name: "wasm-checker: an emitter-capability rejection surfaces its stable code", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // Type-valid, but codegen cannot lower an INFERRED nullable-MAP return — raised on the
  // distinct channel whose `unsupported-lowering` code rides the
  // `diagCodeLen`/`diagCodeByte` ABI into `VLDiagnostic.code`. (The annotated
  // `: {[string]: i32} | null` spelling of the same function lowers and runs, which is what
  // makes this a capability admission and not a type error.)
  //
  // THE WITNESS HAS MOVED TWICE NOW, AND THAT IS THE POINT OF THE TEST. It was
  // `print(pick(true))` over an `i32 | string` until D712 built the box-tag dispatch; it was
  // an inferred nullable-STRUCT return until D887 recorded that shape's row and gave the A20
  // pass and `emitReturnValue` the arms the annotated path already had. Any still-open
  // capability gap serves; what this asserts is the CHANNEL, not the gap.
  // D937 CLOSED the i32-valued spelling, so the witness has moved a THIRD time — by one word,
  // to a `string`-valued map. The five sites D937 wired are restricted to the i32-valued mono
  // shape (that is the shape whose slot is the mono default), so every other value type still
  // floors on this exact channel with the message unchanged.
  // `scripts/capability-probes/inferred-nullable-container-return.vl` is the standing probe
  // for the closed half; when the rest closes, this witness moves again.
  const diags = await checker.check(
    [
      "function pick(c: boolean) {",
      "  if c { return null }",
      "  const m: {[string]: string} = Map()",
      "  m",
      "}",
      "function go() {",
      "  const r = pick(true)",
      "  if r == null { print(0) } else { print(1) }",
      "}",
      "go()",
      "",
    ].join("\n"),
    "/tmp/x.vl",
    noSiblings,
  );
  if (diags.length !== 1) {
    throw new Error(`expected 1 diagnostic, got: ${JSON.stringify(diags)}`);
  }
  if (diags[0].code !== "unsupported-lowering") {
    throw new Error(
      `expected code "unsupported-lowering", got: ${JSON.stringify(diags[0])}`,
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
  // The `add` function declaration on line 1 — its name starts at column 9. A
  // FuncDecl binding hovers as its NAMED signature (D9 slot 5): the decl's
  // parameter names zipped with the type's parameter types.
  const addTy = await checker.hoverTypeAt(SYM_FIXTURE, "/tmp/x.vl", noSiblings, 1, 9);
  if (addTy !== "(a: i32, b: i32) => i32") {
    throw new Error(`expected the named signature for add, got ${JSON.stringify(addTy)}`);
  }
  // A cursor off any binding (column 0 of a blank-ish position) yields undefined.
  const none = await checker.hoverTypeAt(SYM_FIXTURE, "/tmp/x.vl", noSiblings, 2, 0);
  if (none !== undefined && none !== "") {
    throw new Error(`expected no type off a binding, got ${JSON.stringify(none)}`);
  }
});

Deno.test({
  name: "wasm-symbols: an un-annotated param hovers as everything its body demands",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // An `is` guard over an un-annotated param contributes an ALTERNATIVE, not extra
  // fields (see `tests/cases/inference/hole-is-guard-alternative.vl`). Hover reports
  // the SAME disjunction the call-arg diagnostic names — the hole itself renders as
  // an uninformative `_`.
  const guarded = "function foobar(v) {\n" +
    "  if v is { foo: string } { return v.foo }\n" +
    "  return v.bar\n" +
    "}\n" +
    'print(foobar({ foo: "foo" }))\n';
  const want = "{foo: string} | {bar: _}";
  // The param's declaration (line 0, col 16) and its use in `v.bar` (line 2, col 9).
  const declTy = await checker.hoverTypeAt(guarded, "/tmp/x.vl", noSiblings, 0, 16);
  if (declTy !== want) {
    throw new Error(`expected ${want} at the param decl, got ${JSON.stringify(declTy)}`);
  }
  const useTy = await checker.hoverTypeAt(guarded, "/tmp/x.vl", noSiblings, 2, 9);
  if (useTy !== want) {
    throw new Error(`expected ${want} at the param use, got ${JSON.stringify(useTy)}`);
  }
  // A hole the body never constrains stays the blank `_` — there is nothing to report.
  const free = "function twice(n) { return n + n }\nprint(twice(3))\n";
  const freeTy = await checker.hoverTypeAt(free, "/tmp/x.vl", noSiblings, 0, 15);
  if (freeTy !== "_") {
    throw new Error(`expected _ for an unconstrained hole, got ${JSON.stringify(freeTy)}`);
  }
});

Deno.test({ name: "wasm-symbols: typeAliasAt renders a user type name (decl + use)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // `type Pt = { x: i32 }` on line 0 (name at col 5); `let p: Pt = …` on line 1
  // (the `Pt` annotation use at col 7). Both resolve to the alias's body.
  const src = "type Pt = { x: i32 }\nlet p: Pt = { x: 1 }\n";
  const declTy = await checker.typeAliasAt(src, "/tmp/x.vl", noSiblings, 0, 5);
  if (declTy !== "{x: i32}") {
    throw new Error(`expected the alias body at the decl, got ${JSON.stringify(declTy)}`);
  }
  const useTy = await checker.typeAliasAt(src, "/tmp/x.vl", noSiblings, 1, 7);
  if (useTy !== "{x: i32}") {
    throw new Error(`expected the alias body at the use, got ${JSON.stringify(useTy)}`);
  }
  // The value binding `p` (col 4) is NOT a type name — typeAliasAt yields nothing
  // (it's served by `hoverTypeAt`); a non-identifier position likewise.
  const atValue = await checker.typeAliasAt(src, "/tmp/x.vl", noSiblings, 1, 4);
  if (atValue !== undefined && atValue !== "") {
    throw new Error(`expected no type-alias at the value binding, got ${JSON.stringify(atValue)}`);
  }
});

Deno.test({ name: "wasm-symbols: hover containment is end-inclusive at a name's right edge", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // A cursor JUST PAST a name's last character still resolves: every position
  // query shares `symOccCovers`'s end-inclusive convention (the host
  // `spanContains`), including the type-alias and member hovers.
  const src = "type Pt = { x: i32 }\nlet p: Pt = { x: 1 }\nprint(p.x)\n";
  // `Pt` use on line 1 spans cols 7-8; its right edge (col 9) still hits.
  const aliasEdge = await checker.typeAliasAt(src, "/tmp/x.vl", noSiblings, 1, 9);
  if (aliasEdge !== "{x: i32}") {
    throw new Error(`expected the alias at its right edge, got ${JSON.stringify(aliasEdge)}`);
  }
  // The member `x` of `p.x` on line 2 sits at col 8; its right edge (col 9) still hits.
  const memberEdge = await checker.memberTypeAt(src, "/tmp/x.vl", noSiblings, 2, 9);
  if (memberEdge !== "i32") {
    throw new Error(`expected the member type at its right edge, got ${JSON.stringify(memberEdge)}`);
  }
});

Deno.test({ name: "wasm-symbols: an unannotated function's inferred return is retained (hover)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // No return annotation — the checker now writes the demand-inferred return back
  // into the function's retained type, so hover renders `=> i32`, not the blank `=> _`.
  const src = "function add(a: i32, b: i32) {\n  a + b\n}\n";
  const ty = await checker.hoverTypeAt(src, "/tmp/x.vl", noSiblings, 0, 9);
  if (ty !== "(a: i32, b: i32) => i32") {
    throw new Error(`expected the inferred return retained, got ${JSON.stringify(ty)}`);
  }
});

Deno.test({ name: "wasm-symbols: an un-annotated polymorphic param hovers as the blank, not an inference hole", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // `x` is never annotated and only probed via `is i32`, so it stays a fresh
  // inference hole (`?describe.0`). The hover must render that as the blank `_`,
  // not leak the internal hole name — inside the named signature.
  const fixture = 'function describe(x): string {\n  if x is i32 { return "num" }\n  return "str"\n}\n';
  const ty = await checker.hoverTypeAt(fixture, "/tmp/x.vl", noSiblings, 0, 9);
  if (ty !== "(x: _) => string") {
    throw new Error(`expected (x: _) => string for a polymorphic param, got ${JSON.stringify(ty)}`);
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

// ── formatting (kill-TS step 1: the `format.vl` consumer) ────────────────────
// `formatSrc` drives the self-hosted formatter (`format.vl`) through the seed.
// Here we assert the wasm path reflows to a canonical, idempotent form, is stable
// on already-canonical source, and degrades to undefined on a parse error.

Deno.test({ name: "wasm-checker: formatSrc reflows messy source to a canonical, idempotent form", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  const messy = "let   x=1\nfunction f(a: i32, b: i32): i32 {\nreturn a+b\n}\n";
  const got = checker.formatSrc(messy);
  if (got === undefined) throw new Error("formatSrc returned undefined on valid source");
  if (!got.includes("let x = 1")) throw new Error(`not reflowed: ${JSON.stringify(got)}`);
  // The short single-statement body collapses to the inline form.
  if (!got.includes("function f(a: i32, b: i32): i32 { return a + b }")) {
    throw new Error(`not reflowed: ${JSON.stringify(got)}`);
  }
  // Idempotent: formatting the output again is a no-op.
  if (checker.formatSrc(got) !== got) throw new Error("formatSrc not idempotent");
});

Deno.test({ name: "wasm-checker: formatSrc is stable on already-canonical source (incl. params)", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // Already-canonical source must round-trip unchanged (params + a 2-space block
  // body included). A literal here — the canonical form `format.vl` produces; a
  // multi-statement body stays block (a single-statement one would inline-collapse).
  const canonical =
    "function f(a: i32, b: i32): i32 {\n  const s = a + b\n  return s\n}\nprint(f(1, 2))\n";
  const got = checker.formatSrc(canonical);
  if (got !== canonical) {
    throw new Error(`expected stable, got ${JSON.stringify(got)} for ${JSON.stringify(canonical)}`);
  }
});

Deno.test({ name: "wasm-checker: formatSrc returns undefined on a parse error (no edits)", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // An unterminated function body — the driver's formatSrc signals -1.
  const got = checker.formatSrc("function f( {\n");
  if (got !== undefined) {
    throw new Error(`expected undefined on parse error, got ${JSON.stringify(got)}`);
  }
});

// ── lint tier (Stage 3: the lint.vl consumer) ────────────────────────────────
// `lint` drives the self-hosted lint pass through the seed. The error-tier
// `check` excludes lint, so the diagnostics path merges both.

Deno.test({ name: "wasm-checker: lint surfaces a rule with code, non-error severity, and position", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // `x` is read but never reassigned → prefer-const (a lint warning the error
  // tier never reports).
  const diags = checker.lint("let x = 1\nprint(x)\n");
  const pc = diags.find((d) => d.code === "prefer-const");
  if (!pc) throw new Error(`expected a prefer-const diagnostic, got: ${JSON.stringify(diags)}`);
  if (pc.severity === "error") throw new Error(`lint should not be error-tier: ${pc.severity}`);
  if (pc.range.start.line !== 0) throw new Error(`expected line 0, got ${pc.range.start.line}`);
  if (pc.range.end.character <= pc.range.start.character) {
    throw new Error(`expected a non-empty range, got ${JSON.stringify(pc.range)}`);
  }
});

Deno.test({ name: "wasm-checker: lint surfaces unused-pure-expression, tagged unnecessary, final statement exempt", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The motivating shape: a stray pure literal ahead of the real work fires; the
  // block-tail `0` (the function's value) and the call statement do not.
  const src = "function f() {\n  3\n  print(1)\n  0\n}\nf()\n";
  const diags = checker.lint(src);
  const hits = diags.filter((d) => d.code === "unused-pure-expression");
  if (hits.length !== 1) {
    throw new Error(`expected exactly one unused-pure-expression, got: ${JSON.stringify(diags)}`);
  }
  const d = hits[0];
  if (d.severity !== "warning") throw new Error(`expected warning, got ${d.severity}`);
  if (d.range.start.line !== 1) throw new Error(`expected line 1 (the \`3\`), got ${d.range.start.line}`);
  // The span is dead code — editors grey it via the `unnecessary` tag.
  if (!d.tags || !d.tags.includes("unnecessary")) {
    throw new Error(`expected the unnecessary tag, got ${JSON.stringify(d.tags)}`);
  }
});

Deno.test({ name: "wasm-checker: lint returns [] on a parse error", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  if (checker.lint("function f( {\n").length !== 0) {
    throw new Error("expected [] on a parse error");
  }
});

// ── member hover (kill-TS: the typeFeatures.ts member-typing consumer) ────────
// `memberTypeAt` types the `.member` half of `receiver.member` via the seed —
// the member hover the binding-only `hoverTypeAt` can't serve.

Deno.test({ name: "wasm-symbols: memberTypeAt types an object field at the cursor", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // line 2 `print(p.x)`: `p`@6 `.`@7 `x`@8.
  const src = "type P = { x: i32, y: i32 }\nlet p: P = { x: 1, y: 2 }\nprint(p.x)\n";
  const t = await checker.memberTypeAt(src, "/tmp/x.vl", noSiblings, 2, 8);
  if (t !== "i32") throw new Error(`expected i32 for p.x, got ${JSON.stringify(t)}`);
});

Deno.test({ name: "wasm-symbols: memberTypeAt types string .length", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // line 1 `print(s.length)`: `s`@6 `.`@7 `length`@8..13.
  const src = 'let s = "hi"\nprint(s.length)\n';
  const t = await checker.memberTypeAt(src, "/tmp/x.vl", noSiblings, 1, 8);
  if (t !== "i32") throw new Error(`expected i32 for s.length, got ${JSON.stringify(t)}`);
});

Deno.test({ name: "wasm-symbols: memberTypeAt is undefined off any member access", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = "type P = { x: i32, y: i32 }\nlet p: P = { x: 1, y: 2 }\nprint(p.x)\n";
  // line 1, char 4 — the `p` binding decl, not a member access.
  const t = await checker.memberTypeAt(src, "/tmp/x.vl", noSiblings, 1, 4);
  if (t !== undefined) throw new Error(`expected undefined off a member, got ${JSON.stringify(t)}`);
});

// `memberTokensAt` enumerates every member-access property name with its span and
// `method`/`property` class — the native member slice for semantic tokens.

Deno.test({ name: "wasm-symbols: memberTokensAt classifies a field as a property", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // line 2 (0-based) `print(p.x)`: `x`@8, one char long, an object field.
  const src = "type P = { x: i32, y: i32 }\nlet p: P = { x: 1, y: 2 }\nprint(p.x)\n";
  const members = await checker.memberTokensAt(src, "/tmp/x.vl", noSiblings);
  const x = members.find((m) => m.line === 2 && m.char === 8);
  if (!x) throw new Error(`no member token at 2:8, got ${JSON.stringify(members)}`);
  if (x.length !== 1) throw new Error(`expected length 1 for .x, got ${x.length}`);
  if (x.isMethod) throw new Error("expected .x to be a property, not a method");
});

Deno.test({ name: "wasm-symbols: memberTokensAt classifies a function-typed member as a method", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // line 1 (0-based) `xs.push(2)`: `push`@3..7, a function-typed member.
  const src = "let xs = [1]\nxs.push(2)\n";
  const members = await checker.memberTokensAt(src, "/tmp/x.vl", noSiblings);
  const push = members.find((m) => m.line === 1 && m.char === 3);
  if (!push) throw new Error(`no member token at 1:3, got ${JSON.stringify(members)}`);
  if (push.length !== 4) throw new Error(`expected length 4 for .push, got ${push.length}`);
  if (!push.isMethod) throw new Error("expected .push to be a method");
});

Deno.test({ name: "wasm-symbols: memberTokensAt is empty on source with no member access", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const members = await checker.memberTokensAt("let a = 1\nprint(a)\n", "/tmp/x.vl", noSiblings);
  if (members.length !== 0) throw new Error(`expected no members, got ${JSON.stringify(members)}`);
});

// `scopeAt` enumerates the user bindings (var/param/function) visible at a
// position — the native `bindingsInScopeAt` behind scope-aware completion.

Deno.test({ name: "wasm-symbols: scopeAt sees params + locals + top-level in a function body", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = "function add(a: i32, b: i32): i32 {\n  let s = a + b\n  s\n}\nlet top = 1\n";
  // line 2 (0-based), inside the body: a, b (params), s (local), add + top (top-level).
  const names = (await checker.scopeAt(src, "/tmp/x.vl", noSiblings, 2, 4)).map((b) => b.name);
  for (const want of ["add", "a", "b", "s", "top"]) {
    if (!names.includes(want)) throw new Error(`expected '${want}' in scope, got ${JSON.stringify(names)}`);
  }
});

Deno.test({ name: "wasm-symbols: scopeAt classifies kind and carries the type", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = "function add(a: i32, b: i32): i32 {\n  let s = a + b\n  s\n}\nlet top = 1\n";
  const got = await checker.scopeAt(src, "/tmp/x.vl", noSiblings, 2, 4);
  const a = got.find((b) => b.name === "a");
  if (!a || a.kind !== 1) throw new Error(`expected 'a' kind 1 (parameter), got ${JSON.stringify(a)}`);
  if (a.type !== "i32") throw new Error(`expected 'a' type i32, got ${JSON.stringify(a?.type)}`);
  const fn = got.find((b) => b.name === "add");
  if (!fn || fn.kind !== 2) throw new Error(`expected 'add' kind 2 (function), got ${JSON.stringify(fn)}`);
});

Deno.test({ name: "wasm-symbols: scopeAt keeps a demand-inferred forward function global", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // `helper` has an un-annotated return and is forward-called from a NESTED block
  // in `main`, so it is demand-inferred from a deep stack. Its visibility must
  // stay global (the pass-1 stamp wins), so it appears at top-level positions.
  const src =
    "function main(): i32 {\n  let acc = 0\n  if acc == 0 {\n    acc = helper()\n  }\n  acc\n}\nfunction helper() {\n  42\n}\n";
  // line 5 (0-based), in main's body but OUTSIDE the if-block.
  const names = (await checker.scopeAt(src, "/tmp/x.vl", noSiblings, 5, 2)).map((b) => b.name);
  if (!names.includes("helper")) {
    throw new Error(`expected forward 'helper' visible, got ${JSON.stringify(names)}`);
  }
});

Deno.test({ name: "wasm-symbols: scopeAt respects block scope (an inner binding does not leak out)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = "let g = 1\nif g == 1 {\n  let inner = 2\n}\nlet after = 3\n";
  // line 2 (0-based), inside the if-block: inner IS visible.
  const inside = (await checker.scopeAt(src, "/tmp/x.vl", noSiblings, 2, 4)).map((b) => b.name);
  if (!inside.includes("inner")) throw new Error(`expected 'inner' inside the block, got ${JSON.stringify(inside)}`);
  // line 4 (0-based), after the block closed: inner is gone, g + after remain.
  const after = (await checker.scopeAt(src, "/tmp/x.vl", noSiblings, 4, 0)).map((b) => b.name);
  if (after.includes("inner")) throw new Error(`'inner' should not leak past its block, got ${JSON.stringify(after)}`);
  if (!after.includes("g") || !after.includes("after")) {
    throw new Error(`expected 'g' and 'after' visible, got ${JSON.stringify(after)}`);
  }
});

// ── D9 slot 5: ONE user-facing render pathway (`tyToStrUser`) + named signatures ──
// Every type string a person reads renders through `tyToStrUser`/`tyToStructStrUser`
// (demangle ∘ render, typecheck.vl) — the module merge renames every top-level decl
// `name` → `name$mN` (the ENTRY included, as `$m0`), and before the pathway existed
// each query exit leaked those internal names one surface at a time (hover showed
// `Expectation$m1` live). One fixture per leak surface, each pinned to the
// DEMANGLED spelling on a program whose types cross a module boundary.

// The user's live case: a std:test import whose return type is the dep-declared
// `Expectation` (rendered `Expectation$m1` before the pathway).
const STD_HOVER_FIXTURE = 'import { expect } from "std:test"\nconst e = expect(1)\nprint(1)\n';

// A local dep with a nominal type, a struct member OF that type, and an entry
// alias + newtype (the entry's own decls mangle too — `W$m0`).
const DEMANGLE_UTIL = [
  "export type Pair = { a: i32, b: i32 }",
  "export type Box = { inner: Pair }",
  "export function mkBox(): Box { { inner: { a: 1, b: 2 } } }",
  "export function fst(p: Pair): i32 { p.a }",
  "",
].join("\n");
const DEMANGLE_ENTRY = [
  'import { mkBox, fst } from "./util"', // line 0
  "const b = mkBox()", //                   line 1 — `b` at col 6
  "print(fst(b.inner))", //                 line 2 — `.inner` at col 12
  "type Id = new i32", //                   line 3
  "type W = { x: Id }", //                  line 4 — `W` at col 5
  "const w: W = { x: 7 }", //               line 5
  "print(w.x)", //                          line 6
  "",
].join("\n");
const demangleRead = (key: string) => (key.endsWith("util.vl") ? DEMANGLE_UTIL : undefined);

Deno.test({ name: "wasm-symbols: hover demangles a dep-nominal type (Expectation, not Expectation$m1)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const eTy = await checker.hoverTypeAt(STD_HOVER_FIXTURE, "/proj/main.vl", noSiblings, 1, 6);
  if (eTy !== "Expectation") {
    throw new Error(`expected Expectation for e, got ${JSON.stringify(eTy)}`);
  }
  const bTy = await checker.hoverTypeAt(DEMANGLE_ENTRY, "/proj/main.vl", demangleRead, 1, 6);
  if (bTy !== "Box") throw new Error(`expected Box for b, got ${JSON.stringify(bTy)}`);
});

Deno.test({ name: "wasm-symbols: member hover demangles (b.inner is Pair, not Pair$m1)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const ty = await checker.memberTypeAt(DEMANGLE_ENTRY, "/proj/main.vl", demangleRead, 2, 12);
  if (ty !== "Pair") throw new Error(`expected Pair for .inner, got ${JSON.stringify(ty)}`);
});

Deno.test({ name: "wasm-symbols: inlay hints demangle (dep nominals AND the entry's own $m0)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const std = await checker.inlayHintsAt(STD_HOVER_FIXTURE, "/proj/main.vl", noSiblings);
  const eHint = std.find((h) => h.line === 2 && h.kind === 0);
  if (!eHint || eHint.type !== "Expectation") {
    throw new Error(`expected an Expectation hint, got ${JSON.stringify(std)}`);
  }
  const dep = await checker.inlayHintsAt(DEMANGLE_ENTRY, "/proj/main.vl", demangleRead);
  const types = dep.map((h) => h.type);
  if (!types.includes("Box")) throw new Error(`expected a Box hint, got ${JSON.stringify(types)}`);
  if (types.some((t) => t.includes("$"))) {
    throw new Error(`a mangled name leaked into inlay hints: ${JSON.stringify(types)}`);
  }
});

Deno.test({ name: "wasm-symbols: type-alias hover survives a multi-module compile (the entry's key mangles to $m0)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // Before the `$m0` fallback the alias hover went dark in ANY program with an
  // import: the merge renamed the entry's `W` → `W$m0` in the declared-types map
  // while the hovered token still read `W`. The body render also demangles (the
  // nested NEWTYPE name `Id` is the one nominal a structural render keeps).
  const ty = await checker.typeAliasAt(DEMANGLE_ENTRY, "/proj/main.vl", demangleRead, 4, 5);
  if (ty !== "{x: Id}") {
    throw new Error(`expected the demangled alias body {x: Id}, got ${JSON.stringify(ty)}`);
  }
});

Deno.test({ name: "wasm-symbols: completion details demangle through the shared pathway", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The #2074 fix demangled these inline at symScopeAt's two fill sites; those
  // wraps collapsed into `symBindTypeStr` rendering via the ONE pathway. Pin the
  // detail (not just the name, which lsp_crossfile_wasm_test.ts already pins).
  const scope = await checker.scopeAt(STD_HOVER_FIXTURE, "/proj/main.vl", noSiblings, 2, 0);
  const e = scope.find((b) => b.name === "e");
  if (!e || e.type !== "Expectation") {
    throw new Error(`expected e: Expectation in completion, got ${JSON.stringify(e)}`);
  }
  const ex = scope.find((b) => b.name === "expect");
  if (!ex || ex.type !== "(i32 | i64 | f64 | boolean | string) => Expectation") {
    throw new Error(`expected expect's demangled signature, got ${JSON.stringify(ex)}`);
  }
});

// ── Named function signatures (hover shows parameter NAMES) ───────────────────
// `TyFunc` carries no parameter names by design; the query layer zips the
// binding's FuncDecl param names with the type's param types. Bare-type
// fallbacks: a lambda-bound value and a function-typed parameter have no
// FuncDecl, so they keep the structural render.

Deno.test({ name: "wasm-symbols: a local function hovers with parameter names (decl + use)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = 'function greet(who: string, times: i32): string {\n  who + "!"\n}\nprint(greet("a", 1))\n';
  const want = "(who: string, times: i32) => string";
  const decl = await checker.hoverTypeAt(src, "/tmp/x.vl", noSiblings, 0, 9);
  if (decl !== want) throw new Error(`expected ${want} at the decl, got ${JSON.stringify(decl)}`);
  const use = await checker.hoverTypeAt(src, "/tmp/x.vl", noSiblings, 3, 7);
  if (use !== want) throw new Error(`expected ${want} at the use, got ${JSON.stringify(use)}`);
});

Deno.test({ name: "wasm-symbols: an imported std function hovers with parameter names (it from std:test)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The imported binding's FuncDecl lives in the dep module; the merged program
  // shares one node table, so the zip works across the boundary — and the
  // rendered types demangle (`Expectation`, not `Expectation$m1`).
  const src = 'import { it, expect } from "std:test"\nit("adds", () => {\n  expect(1).toEqual(1)\n})\n';
  const itTy = await checker.hoverTypeAt(src, "/proj/main.vl", noSiblings, 1, 0);
  if (itTy !== "(name: string, body: () => void) => void") {
    throw new Error(`expected it's named signature, got ${JSON.stringify(itTy)}`);
  }
  const expectTy = await checker.hoverTypeAt(src, "/proj/main.vl", noSiblings, 2, 3);
  if (expectTy !== "(value: i32 | i64 | f64 | boolean | string) => Expectation") {
    throw new Error(`expected expect's named signature, got ${JSON.stringify(expectTy)}`);
  }
});

Deno.test({ name: "wasm-symbols: a lambda-bound value and a function-typed parameter keep the bare type", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // A lambda binding's decl node is the LetStmt — no FuncDecl, no names to zip.
  const lam = "const dbl = (x: i32) => x * 2\nprint(dbl(2))\n";
  const lamTy = await checker.hoverTypeAt(lam, "/tmp/x.vl", noSiblings, 0, 6);
  if (lamTy !== "(i32) => i32") {
    throw new Error(`expected the bare type for a lambda binding, got ${JSON.stringify(lamTy)}`);
  }
  // A function-typed PARAMETER's decl node is the Param — bare type kept, at the
  // decl and at a use. (The enclosing function still zips: `cb` is named there.)
  const hof = "function run(cb: (i32) => i32): i32 {\n  cb(1)\n}\nprint(run((x: i32) => x))\n";
  const paramDecl = await checker.hoverTypeAt(hof, "/tmp/x.vl", noSiblings, 0, 13);
  if (paramDecl !== "(i32) => i32") {
    throw new Error(`expected the bare type for a fn-typed param, got ${JSON.stringify(paramDecl)}`);
  }
  const paramUse = await checker.hoverTypeAt(hof, "/tmp/x.vl", noSiblings, 1, 2);
  if (paramUse !== "(i32) => i32") {
    throw new Error(`expected the bare type at the param's use, got ${JSON.stringify(paramUse)}`);
  }
  const fnDecl = await checker.hoverTypeAt(hof, "/tmp/x.vl", noSiblings, 0, 10);
  if (fnDecl !== "(cb: (i32) => i32) => i32") {
    throw new Error(`expected run's named signature, got ${JSON.stringify(fnDecl)}`);
  }
});
