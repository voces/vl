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
  // Type-valid, but codegen cannot lower the boxed value-union print — raised
  // on the distinct channel whose `unsupported-lowering` code rides the
  // `diagCodeLen`/`diagCodeByte` ABI into `VLDiagnostic.code`.
  const diags = await checker.check(
    [
      "function pick(c: boolean): i32 | string {",
      "  if c { return 1 }",
      '  return "x"',
      "}",
      "print(pick(true))",
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
  // into the function's retained type, so hover renders `-> i32`, not `-> <none>`.
  const src = "function add(a: i32, b: i32) {\n  a + b\n}\n";
  const ty = await checker.hoverTypeAt(src, "/tmp/x.vl", noSiblings, 0, 9);
  if (ty !== "(i32, i32) -> i32") {
    throw new Error(`expected the inferred return retained, got ${JSON.stringify(ty)}`);
  }
});

Deno.test({ name: "wasm-symbols: an un-annotated polymorphic param hovers as any, not an inference hole", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // `x` is never annotated and only probed via `is i32`, so it stays a fresh
  // inference hole (`?describe.0`). The hover must render that as `any` (host
  // parity), not leak the internal hole name.
  const fixture = 'function describe(x): string {\n  if x is i32 { return "num" }\n  return "str"\n}\n';
  const ty = await checker.hoverTypeAt(fixture, "/tmp/x.vl", noSiblings, 0, 9);
  if (ty !== "(any) -> string") {
    throw new Error(`expected (any) -> string for a polymorphic param, got ${JSON.stringify(ty)}`);
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
