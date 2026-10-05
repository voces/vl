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

// A MULTI-LINE NODE UNDERLINES WHOLE. `diagEndCol` is a column on `diagEndLine`, so the
// range the editor gets ends on the node's LAST line; before the end line rode the ABI the
// same diagnostic collapsed to a one-column caret on the literal's opening `{`. The control
// is the second assertion: the range must cover more than the line it starts on.
Deno.test({ name: "wasm-checker: a multi-line node's range ends on its last line", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = 'type P = { x: i32 }\nconst p: P = {\n  x: "one",\n}\nprint(p.x)\n';
  const diags = await checker.check(src, "/tmp/x.vl", noSiblings);
  const d = diags.find((x) => x.severity === "error" && x.message.includes("cannot assign"));
  if (d === undefined) {
    throw new Error(`expected an assign error, got: ${diags.map((x) => x.message).join("; ")}`);
  }
  // 0-based LSP positions counted from `src`: `{` is the 14th column of line 2, and the
  // closing `}` is the whole of line 4.
  const want = { start: { line: 1, character: 13 }, end: { line: 3, character: 1 } };
  if (JSON.stringify(d.range) !== JSON.stringify(want)) {
    throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(d.range)}`);
  }
  if (d.range.end.line <= d.range.start.line) {
    throw new Error(`the range never left its first line: ${JSON.stringify(d.range)}`);
  }
  // The text the range selects is the literal, newlines and all.
  const lines = src.split("\n");
  const picked = [
    lines[d.range.start.line].slice(d.range.start.character),
    ...lines.slice(d.range.start.line + 1, d.range.end.line),
    lines[d.range.end.line].slice(0, d.range.end.character),
  ].join("\n");
  if (picked !== '{\n  x: "one",\n}') {
    throw new Error(`the range selects ${JSON.stringify(picked)}`);
  }
});

// D1590 (glean VL-039) — THE SUGGESTION REACHES THE EDITOR, because it rides the message
// rather than a second channel. Same `unknown type` diagnostic the CLI prints, arriving
// through the checker the LSP drives, so the assertion is on the exact text; the negative
// control beside it is what keeps a wrong guess from being invisible here.
Deno.test({ name: "wasm-checker: `unknown type` carries the `did you mean` suffix", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const msgs = async (src: string) =>
    (await checker.check(src, "/tmp/x.vl", noSiblings))
      .filter((d) => d.severity === "error")
      .map((d) => d.message);

  // glean's witness, verbatim.
  const hit = await msgs("const seen: {[i32]: bool} = Map()\nprint(0)\n");
  const wantHit = ["unknown type 'bool' within '{[i32]:bool}'; did you mean 'boolean'?"];
  if (JSON.stringify(hit) !== JSON.stringify(wantHit)) {
    throw new Error(`want ${JSON.stringify(wantHit)}, got ${JSON.stringify(hit)}`);
  }

  // NEGATIVE CONTROL: nothing near `Zork`, so nothing is offered.
  const miss = await msgs("type Circle = { r: f64 }\n\nconst z: Zork = 1\nprint(z)\n");
  if (JSON.stringify(miss) !== JSON.stringify(["unknown type 'Zork'"])) {
    throw new Error(`want ["unknown type 'Zork'"], got ${JSON.stringify(miss)}`);
  }
});

// D2860 (plumb PL-052) — a mismatch whose value reads an un-annotated numeric literal names that
// declaration and the annotation, on the same message the CLI prints. The control annotates the
// declaration wrongly, so the mismatch stands and the note must not.
Deno.test({ name: "wasm-checker: a defaulted numeric literal names its declaration", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const msgs = async (src: string) =>
    (await checker.check(src, "/tmp/x.vl", noSiblings))
      .filter((d) => d.severity === "error")
      .map((d) => d.message);
  const body = "function mul32(a: f32, b: f32): f32 { a * b }\n" +
    "const TABLE = [1.0, 0.0, 0.0, 1.0]\n" +
    "function f(): f32 { mul32(TABLE[0], 1.0) }\nprint(f())\n";
  const hit = await msgs(body);
  const wantHit = [
    "argument 1: expected f32, got f64 — `TABLE` on line 2 has no annotation, so its literal " +
    "defaulted to `f64[]`; annotate it: `const TABLE: f32[] = …`",
  ];
  if (JSON.stringify(hit) !== JSON.stringify(wantHit)) {
    throw new Error(`want ${JSON.stringify(wantHit)}, got ${JSON.stringify(hit)}`);
  }
  // No note: an annotated declaration, a non-literal initializer, and a list a non-literal write
  // reaches. A scalar `let` a non-literal write reaches takes its type from its uses (D3246), and
  // one whose read and write disagree is refused naming both, below.
  const g = "function g(a: f32): f32 { a }\nfunction src(): f64 { 3.0 }\n";
  const misses = [
    body.replace("const TABLE =", "const TABLE: f64[] ="),
    g + "const T: f64[] = [1.0]\nconst V = T[0]\nprint(g(V))\n",
    // A non-literal element write or push: the suggested `f32[]` would refuse it.
    g + "const A = [1.0, 0.0]\nA[1] = src()\nprint(g(A[0]))\n",
    g + "const B = [1.0, 0.0]\nB.push(src())\nprint(g(B[0]))\n",
    g + "let C = [1.0, 0.0]\nC[0] = src()\nprint(g(C[0]))\n",
    g + "const D = [1.0, 0.0]\nconst E = D\nE[0] = src()\nprint(g(D[0]))\n",
  ];
  for (const src of misses) {
    const miss = await msgs(src);
    if (JSON.stringify(miss) !== JSON.stringify(["argument 1: expected f32, got f64"])) {
      throw new Error(`want the bare mismatch for ${JSON.stringify(src)}, got ${JSON.stringify(miss)}`);
    }
  }
  const conflict = (nm: string, a: number, ta: string, b: number, tb: string) =>
    `\`${nm}\` takes its type from its uses, and they conflict: the use on line ${a} needs ` +
    `\`${ta}\` and the use on line ${b} needs \`${tb}\` — annotate \`${nm}\``;
  const scalars: [string, string[]][] = [
    [
      g + "let w = 1.5\nprint(g(w))\nw = src()\n",
      ["argument 1: expected f32, got f64", conflict("w", 4, "f32", 5, "f64")],
    ],
    [
      g + "let u = 1.5\nu += src()\nprint(g(u))\n",
      ["argument 1: expected f32, got f64", conflict("u", 4, "f64", 5, "f32")],
    ],
    // A literal `const` is its literal at the read, so the mismatch is the literal's own.
    ["function h(a: i32): i32 { a }\nconst F = 2.5\nprint(h(F))\n", ["constant 2.5 is not a whole number, so i32 cannot hold it"]],
  ];
  for (const [src, want] of scalars) {
    const got = await msgs(src);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`want ${JSON.stringify(want)} for ${JSON.stringify(src)}, got ${JSON.stringify(got)}`);
    }
  }
  // An exported declaration in another module, read through an import alias: the note names the
  // declaring file and keeps `export`.
  const lib = "export const TABLE = [1.0, 2.0]\n";
  const read = (key: string) => key.endsWith("lib.vl") ? lib : undefined;
  const cross = (await checker.check(
    'import { TABLE as T } from "./lib"\nfunction g(a: f32): f32 { a }\nprint(g(T[0]))\n',
    "/proj/main.vl",
    read,
  )).filter((d) => d.severity === "error").map((d) => d.message);
  const wantCross = [
    "argument 1: expected f32, got f64 — `TABLE` on line 1 of lib.vl has no annotation, so its " +
    "literal defaulted to `f64[]`; annotate it: `export const TABLE: f32[] = …`",
  ];
  if (JSON.stringify(cross) !== JSON.stringify(wantCross)) {
    throw new Error(`want ${JSON.stringify(wantCross)}, got ${JSON.stringify(cross)}`);
  }
});

// D2966 (plumb PL-054) — a store the defaulted literal refuses names the declaration too. The
// misses pin the note's ABSENCE, which a fixture's substring directive cannot.
Deno.test({ name: "wasm-checker: a store into a defaulted literal names its declaration", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const msgs = async (src: string) =>
    (await checker.check(src, "/tmp/x.vl", noSiblings))
      .filter((d) => d.severity === "error")
      .map((d) => d.message);
  const witness = "function ld32(a: i64) { (__load_i32__(a as% i32) as% i64) & 4294967295 }\n" +
    "function sum(p: i64, n: i64) { let s = 0; let i = 0; while i < n { s += ld32(p + i * 4); i += 1 }; s }\n" +
    "print(sum(0, 0))\n";
  // PL-054's witness now checks: `s` takes `i64` from its store (D3246).
  const clean = await msgs(witness);
  if (clean.length !== 0) throw new Error(`want the witness clean, got ${JSON.stringify(clean)}`);
  const hits: [string, string][] = [
    [
      "function fl(): f32 { 1.5 }\nconst r = { x: 0 }\nr.x += fl()\nprint(r.x)\n",
      "operator '+' mixes i32 and f32 — field `x` of `r` on line 2 has no annotation, so its " +
      "literal defaulted to `i32`; write it `x: 0 as f32`",
    ],
  ];
  for (const [src, want] of hits) {
    const got = await msgs(src);
    if (JSON.stringify(got) !== JSON.stringify([want])) {
      throw new Error(`want ${JSON.stringify([want])}, got ${JSON.stringify(got)}`);
    }
  }
  // No note: an annotated declaration, an integer `let` a float is stored into, a float `let` an
  // integer is stored into (each keeps its kind, D3246), and a store to a `const`.
  const g = "function big(): i64 { 5 }\nfunction fl(): f32 { 1.5 }\n";
  const misses: [string, string[]][] = [
    [g + "let a: i32 = 0\na = big()\nprint(a)\n", ["cannot assign i64 to i32"]],
    [g + "let b = 0\nb = big()\nb = fl()\nprint(b)\n", ["cannot assign f32 to i64"]],
    [g + "let c = 0.5\nc = big()\nprint(c)\n", ["cannot assign i64 to f64"]],
    // A whole store to a `const` is refused; a `const` is never re-typed by a store.
    [
      "function big(): i64 { 5000000000 }\nconst t = 0\n" +
      "function run() { const s = 0; s += big(); t = big() }\nrun()\n",
      [
        "cannot reassign `const` s",
        "cannot assign i64 to i32",
        "cannot reassign `const` t",
        "cannot assign i64 to i32",
      ],
    ],
  ];
  for (const [src, want] of misses) {
    const got = await msgs(src);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`want ${JSON.stringify(want)} for ${JSON.stringify(src)}, got ${JSON.stringify(got)}`);
    }
  }
});

// D2977 (plumb PL-056) — the refused value reads the literal binding as a first argument, an
// operand, or inside a record or list literal. The misses pin the note's ABSENCE when another read
// wants the literal's own type: the suggestion would refuse that read.
Deno.test({ name: "wasm-checker: a defaulted literal read inside a value names its declaration", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const msgs = async (src: string) =>
    (await checker.check(src, "/tmp/x.vl", noSiblings))
      .filter((d) => d.severity === "error")
      .map((d) => d.message);
  const g = "function mul(a: f32, b: f32): f32 { a * b }\nfunction gi(a: i32): i32 { a }\n";
  // A literal `const` is its literal at every read (D3246, owner ruling C): a first argument, an
  // operand, a record field, a list element, and reads that want different types all check.
  const clean = [
    g + "const x = 0.0\nfunction f(y: f32): f32 { mul(x, y) }\nprint(f(2.0))\n",
    g + "function f(y: f32): f32 {\n  const n = 3\n  n * y\n}\nprint(f(2.0))\n",
    g + "type V = { v: f32 }\nlet fv = 1.5\nconst r: V = { v: fv }\nprint(r.v)\n",
    g + "const e = 4\nconst xs: f32[] = [e]\nprint(xs[0])\n",
    g + "const d = 7\nprint(mul(d, 1.0))\nprint(d / 2)\n",
    g + "const b = 3\nprint(mul(b, 1.0))\nprint(gi(b))\n",
    g + "const i = 1\nconst ys = [7, 8]\nprint(ys[i])\nprint(mul(i, 1.0))\n",
    g + "const m = 3\nfunction a(): f32 { mul(m, 1.0) }\nfunction c(n: i32): boolean { m < n }\nprint(a())\n",
    g + "const q = 3\nprint(mul(q, 1.0))\nprint(q == 3)\n",
    g + "function id<T>(a: T): T { a }\nconst p = 3\nprint(mul(p, 1.0))\nprint(id(p) + gi(1))\n",
  ];
  for (const src of clean) {
    const got = await msgs(src);
    if (got.length !== 0) throw new Error(`want ${JSON.stringify(src)} clean, got ${JSON.stringify(got)}`);
  }
  // An `f32` holds integers only up to 2^24 exactly: the constant's refusal at the read.
  const v = await msgs(g + "const v = 16777217\nprint(mul(v, 1.0))\n");
  const wantV = ["constant 16777217 is not exact at f32 — write it as a float literal to round it"];
  if (JSON.stringify(v) !== JSON.stringify(wantV)) {
    throw new Error(`want the bare mismatch, got ${JSON.stringify(v)}`);
  }
  // D2981: a float literal stored into an integer `let` is refused; the `let` keeps its kind.
  const store = await msgs(g + "const b = 1.5\nlet w = 0\nw = b\nprint(gi(w))\n");
  const wantStore = ["constant 1.5 is not a whole number, so i32 cannot hold it"];
  if (JSON.stringify(store) !== JSON.stringify(wantStore)) {
    throw new Error(`want ${JSON.stringify(wantStore)}, got ${JSON.stringify(store)}`);
  }
});

// D3070 (plumb PL-070) — a function value whose un-annotated return defaulted from the numeric
// literals it returns names the function and the return annotation. The misses pin the note's
// ABSENCE when no single annotation fixes every use.
Deno.test({ name: "wasm-checker: a function value's defaulted literal return names the function", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const msgs = async (src: string) =>
    (await checker.check(src, "/tmp/x.vl", noSiblings))
      .filter((d) => d.severity === "error")
      .map((d) => d.message);
  const g = "function ap(f: (i64) => i64): i64 { f(1) }\nfunction af(f: (i64) => f32): f32 { f(1) }\n" +
    "function a32(f: (i64) => i32): i32 { f(1) }\n";
  const mis = "argument 1: expected (i64) => i64, got (i64) => i32";
  const hits: [string, string][] = [
    [
      g + "function never(x: i64) { -1 }\nprint(ap(never))\n",
      mis + " — `never` returns the literal `-1` on line 4, so its return defaulted to `i32`; " +
      "annotate it: `function never(x: i64): i64 { … }`",
    ],
    [
      g + "const k = (x: i64) => -1\nprint(ap(k))\n",
      mis + " — `k` returns the literal `-1` on line 4, so its return defaulted to `i32`; " +
      "annotate it: `const k = (x: i64): i64 => -1`",
    ],
    // A tree of literals is its constant, so it is named by its value.
    [
      g + "function m(x: i64) { 2 * 3 }\nprint(ap(m))\n",
      mis + " — `m` returns the literal `6` on line 4, so its return defaulted to `i32`; " +
      "annotate it: `function m(x: i64): i64 { … }`",
    ],
    // A call whose result still fits the annotated return keeps the note.
    [
      g + "function c(x: i64) { 5 }\nprint(ap(c))\nprint(c(2))\nc(3)\nconst y: i64 = c(4)\nprint(y)\n",
      mis + " — `c` returns the literal `5` on line 4, so its return defaulted to `i32`; " +
      "annotate it: `function c(x: i64): i64 { … }`",
    ],
  ];
  for (const [src, want] of hits) {
    const got = await msgs(src);
    if (JSON.stringify(got) !== JSON.stringify([want])) {
      throw new Error(`want ${JSON.stringify([want])}, got ${JSON.stringify(got)}`);
    }
  }
  const misses: [string, string[]][] = [
    // Another use needs the `i32` return: as a value, or as a call result.
    [g + "function a(x: i64) { -1 }\nprint(ap(a))\nprint(a32(a))\n", [mis]],
    [g + "function b(x: i64) { -1 }\nprint(ap(b))\nconst y: i32 = b(1)\nprint(y)\n", [mis]],
    // Two destinations want two annotations.
    [
      g + "function d(x: i64) { 2 }\nprint(ap(d))\nprint(af(d))\n",
      [mis, "argument 1: expected (i64) => f32, got (i64) => i32"],
    ],
    // An `f32` holds integers only up to 2^24 exactly.
    [g + "function e(x: i64) { 16777217 }\nprint(af(e))\n", ["argument 1: expected (i64) => f32, got (i64) => i32"]],
    // A lambda binding that is reassigned, or aliased.
    [g + "function z(x: i64): i32 { 0 }\nlet k = (x: i64) => -1\nprint(ap(k))\nk = z\n", [mis]],
    [g + "function h(x: i64) { 7 }\nconst al = h\nprint(ap(h))\nprint(a32(al))\n", [mis]],
    // A return that is not a literal (a tree of literals is one: its constant, exact).
    [g + "function m(x: i64) { (x as% i32) * 3 }\nprint(ap(m))\n", [mis]],
    // A call result the annotation would change: cast, operator, inferred tail, member call.
    [g + "function c1(x: i64) { 5 }\nprint(ap(c1))\nprint(c1(1) as i32)\n", [mis]],
    [g + "function c2(x: i64) { 5 }\nprint(ap(c2))\nprint(c2(1) * 1000000000)\n", [mis]],
    [
      g + "function c3(x: i64) { 5 }\nprint(ap(c3))\nfunction w() { c3(1) }\nfunction t(v: i32): i32 { v }\nprint(t(w()))\n",
      [mis],
    ],
    [g + "function c4(self: i64) { 5 }\nprint(ap(c4))\nconst q: i32 = (1 as i64).c4()\nprint(q)\n", [mis]],
    // An exported function: another module may read its result at the old type.
    [g + "export function c5(x: i64) { 5 }\nprint(ap(c5))\n", [mis]],
  ];
  for (const [src, want] of misses) {
    const got = await msgs(src);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`want ${JSON.stringify(want)} for ${JSON.stringify(src)}, got ${JSON.stringify(got)}`);
    }
  }
});

Deno.test({ name: "wasm-checker: an emitter-capability rejection surfaces its stable code", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // Type-valid, but codegen cannot lower an INFERRED nullable i32-KEYED MAP return — raised
  // on the distinct channel whose `unsupported-lowering` code rides the
  // `diagCodeLen`/`diagCodeByte` ABI into `VLDiagnostic.code`. (The annotated
  // `: {[i32]: i32} | null` spelling of the same function lowers and runs, which is what
  // makes this a capability admission and not a type error.)
  //
  // THE WITNESS HAS MOVED TWICE NOW, AND THAT IS THE POINT OF THE TEST. It was
  // `print(pick(true))` over an `i32 | string` until D712 built the box-tag dispatch; it was
  // an inferred nullable-STRUCT return until D887 recorded that shape's row and gave the A20
  // pass and `emitReturnValue` the arms the annotated path already had. Any still-open
  // capability gap serves; what this asserts is the CHANNEL, not the gap.
  // D956 CLOSED THE STRING-KEYED MAP ENTIRELY, so the witness moved a FOURTH time — to
  // `i64[] | null`. D1062 then closed the nullable LIST at every element type (the pin
  // `synthNulListRetAnns` gives a named function's inferred `T[] | null` return the
  // annotation the user did not write), which is why it has moved a FIFTH. What still floors
  // on this channel is the i32-KEYED map: `nullableRetName`'s map arm requires a `string`
  // key. The annotated twin runs, so it is a capability gap and the witness will move again.
  // `scripts/capability-probes/inferred-nullable-container-return.vl` and
  // `inferred-nullable-list-return.vl` are the standing probes for the closed halves; when
  // the rest closes, this witness moves again.
  const diags = await checker.check(
    [
      "function pick(c: boolean) {",
      "  if c { return null }",
      "  const m: {[i32]: i32} = Map()",
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

// A literal `const` is its literal at each read (D3246), so a read hovers as the type it takes
// there, and every read stays a reference — including when a `let` pin re-checks the program.
Deno.test({
  name: "wasm-symbols: a literal const read hovers per use and stays a reference",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = "const K = 7\n" +
    "function takeF32(x: f32): f32 { x }\n" +
    "function takeI64(x: i64): i64 { x }\n" +
    "print(takeF32(K))\n" +
    "print(takeI64(K))\n" +
    "let bb = 1\n" +
    "bb = takeI64(K)\n";
  const want: [number, number, string][] = [[3, 14, "f32"], [4, 14, "i64"]];
  for (const [line, col, ty] of want) {
    const got = await checker.hoverTypeAt(src, "/tmp/x.vl", noSiblings, line, col);
    if (got !== ty) {
      throw new Error(`hover at ${line}:${col}: want ${ty}, got ${JSON.stringify(got)}`);
    }
  }
  const refs = await checker.referencesAt(src, "/tmp/x.vl", noSiblings, 3, 14, true);
  const lines = refs.map((r) => r.start.line).sort((a, b) => a - b);
  if (JSON.stringify(lines) !== "[0,3,4,6]") {
    throw new Error(`references: want [0,3,4,6], got ${JSON.stringify(lines)}`);
  }
});

// A read above its binding's declaration — a literal `const` at the top level, or any module
// binding read in a function written above it — is still a reference, so a rename reaches it.
Deno.test({
  name: "wasm-symbols: a read above the declaration is a reference",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = "print(K + 1)\n" +
    "function above(): i32 { K + N }\n" +
    "const K = 3\n" +
    "function one(): i32 { 1 }\n" +
    "const N = one()\n";
  const at = (r: { start: { line: number; character: number } }) =>
    `${r.start.line}:${r.start.character}`;
  const k = (await checker.referencesAt(src, "/tmp/x.vl", noSiblings, 2, 6, true)).map(at).sort();
  if (JSON.stringify(k) !== '["0:6","1:24","2:6"]') {
    throw new Error(`K references: want ["0:6","1:24","2:6"], got ${JSON.stringify(k)}`);
  }
  const n = (await checker.referencesAt(src, "/tmp/x.vl", noSiblings, 4, 6, true)).map(at).sort();
  if (JSON.stringify(n) !== '["1:28","4:6"]') {
    throw new Error(`N references: want ["1:28","4:6"], got ${JSON.stringify(n)}`);
  }
  const hover = await checker.hoverTypeAt(src, "/tmp/x.vl", noSiblings, 0, 6);
  if (hover !== "i32") throw new Error(`hover above the declaration: want i32, got ${hover}`);
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

// A binding's hover type is FLOW-SENSITIVE: inside `if r is string { … }` the very
// same `r` is a `string`, and `symBindType` (one slot per binding, last write wins)
// cannot hold that as well as the declared union. The checker's own narrowed type is
// retained per OCCURRENCE (`symOccTy`), and hover prefers it.
const NARROW_SRC = "type IoError = { msg: string, code: i32 }\n" +
  "function f(r: string | IoError) {\n" +
  "  if r is string {\n" +
  "    print(r)\n" +
  "  } else {\n" +
  "    print(r.msg)\n" +
  "  }\n" +
  "  const after = r\n" +
  "  return 0\n" +
  "}\n" +
  'print(f("x"))\n';

Deno.test({
  name: "wasm-symbols: hover inside an `is` arm shows the NARROWED type",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // Line 3 `    print(r)` — the `r` at col 10 sits under `if r is string`.
  const then = await checker.hoverTypeAt(NARROW_SRC, "/tmp/x.vl", noSiblings, 3, 10);
  if (then !== "string") {
    throw new Error(`expected string in the is-string arm, got ${JSON.stringify(then)}`);
  }
  // Line 5 `    print(r.msg)` — the NEGATIVE arm narrows to the other member. This is
  // the checker's own `else`-arm narrowing, not one the query layer invents.
  const els = await checker.hoverTypeAt(NARROW_SRC, "/tmp/x.vl", noSiblings, 5, 10);
  if (els !== "IoError") {
    throw new Error(`expected IoError in the else arm, got ${JSON.stringify(els)}`);
  }
});

Deno.test({
  name: "wasm-symbols: hover OUTSIDE the arms still shows the declared union",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const want = "string | IoError";
  // The parameter's own declaration (line 1, col 11) — a decl is never narrowed.
  const decl = await checker.hoverTypeAt(NARROW_SRC, "/tmp/x.vl", noSiblings, 1, 11);
  if (decl !== want) {
    throw new Error(`expected ${want} at the param decl, got ${JSON.stringify(decl)}`);
  }
  // The guard's OWN receiver (line 2 `  if r is string {`, col 5): the narrowing is
  // not in force yet at the operand being tested.
  const guard = await checker.hoverTypeAt(NARROW_SRC, "/tmp/x.vl", noSiblings, 2, 5);
  if (guard !== want) {
    throw new Error(`expected ${want} at the guard operand, got ${JSON.stringify(guard)}`);
  }
  // RE-WIDENED after the `if` closes (line 7 `  const after = r`, col 16) — `popScope`
  // unwound the narrowing shadow, so the declared union is the answer again.
  const after = await checker.hoverTypeAt(NARROW_SRC, "/tmp/x.vl", noSiblings, 7, 16);
  if (after !== want) {
    throw new Error(`expected ${want} after the if, got ${JSON.stringify(after)}`);
  }
});

Deno.test({
  name: "wasm-symbols: a nullable guard narrows hover, a function binding is untouched",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // `if s != null` is the same bare-name shadow mechanism as `is`.
  const nul = "function f(s: string | null) {\n" +
    "  if s != null {\n" +
    "    print(s)\n" +
    "  }\n" +
    "  return 0\n" +
    "}\n" +
    'print(f("x"))\n';
  const inside = await checker.hoverTypeAt(nul, "/tmp/x.vl", noSiblings, 2, 10);
  if (inside !== "string") {
    throw new Error(`expected string inside the null guard, got ${JSON.stringify(inside)}`);
  }
  const at = await checker.hoverTypeAt(nul, "/tmp/x.vl", noSiblings, 0, 11);
  if (at !== "string | null") {
    throw new Error(`expected the declared nullable, got ${JSON.stringify(at)}`);
  }
  // A FUNCTION binding still renders as its NAMED signature — `fnSigStr` is only
  // skipped for an occurrence that actually carries a narrowing, and a function
  // name never does.
  const fn = "function add(a: i32, b: i32) {\n  a + b\n}\nprint(add(1, 2))\n";
  const use = await checker.hoverTypeAt(fn, "/tmp/x.vl", noSiblings, 3, 6);
  if (use !== "(a: i32, b: i32) => i32") {
    throw new Error(`expected the named signature at a fn use, got ${JSON.stringify(use)}`);
  }
});

// Flow facts reach hover too: a binding filled on the `null` arm of an `if` is its non-null type
// below it (D3556), and the first `pop()` under a `.length` test is the element (D3558).
Deno.test({
  name: "wasm-symbols: hover after a fill-on-null join and under a `.length` test",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = "type S = { n: i32 }\n" +
    "function get(m: Map<i32, S>, k: i32): S {\n" +
    "  let s = m.get(k)\n" +
    "  if s == null { s = { n: k } }\n" +
    "  const t = s\n" +
    "  t\n" +
    "}\n" +
    "const stack = [1, 2]\n" +
    "while stack.length > 0 {\n" +
    "  const k = stack.pop()\n" +
    "  print(k + 1)\n" +
    "}\n" +
    "const after = stack.pop()\n" +
    "print(after ?? 0)\n";
  const cases: [number, number, string][] = [
    [2, 6, "S | null"], // `let s` — the declaration keeps its declared type
    [4, 12, "S"], // `s` below the join
    [4, 8, "S"], // `t`
    [9, 8, "i32"], // `k` from the first pop under the test
    [12, 6, "i32 | null"], // `after`, outside the test
  ];
  for (const [line, col, want] of cases) {
    const got = await checker.hoverTypeAt(src, "/tmp/x.vl", noSiblings, line, col);
    if (got !== want) {
      throw new Error(`${line}:${col}: want ${want}, got ${JSON.stringify(got)}`);
    }
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

// ── the lint range comes from the RULE, not from a host guess ───────────────
//
// The host used to widen a lint finding to the identifier starting at `col`
// (`wordEndCol`), while the CLI widened it to `col + 1`: two guesses, neither of them
// the rule's own answer, and they disagreed — a kind-ladder finding read two columns
// wide in VS Code and one in `vl check`. The seed now carries `[col, endCol)` per rule
// and both faces read it. Every expectation below is DERIVED from the source text, so
// this cannot pass by recording whatever the compiler emits.

/** The source text an LSP range underlines. Ranges are 0-based, end exclusive. */
const rangeText = (src: string, r: { start: { line: number; character: number }; end: { line: number; character: number } }): string => {
  if (r.start.line !== r.end.line) return "";
  return (src.split("\n")[r.start.line] ?? "").slice(r.start.character, r.end.character);
};

Deno.test({ name: "wasm-checker: a lint range covers what the message names", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  const src = "function neverCalledHelper(unusedParameterName: i32) {\n" +
    "  let neverReassignedLocal = 1\n" +
    "  neverReassignedLocal + 2\n" +
    "}\n" +
    "print(1)\n";
  const diags = checker.lint(src);
  for (const code of ["unused-function", "unused-variable"]) {
    const d = diags.find((x) => x.code === code);
    if (d === undefined) throw new Error(`no ${code} in ${JSON.stringify(diags.map((x) => x.code))}`);
    const named = /`([^`]*)`/.exec(d.message)?.[1] ?? "";
    if (rangeText(src, d.range) !== named) {
      throw new Error(
        `${code}: want the range over ${JSON.stringify(named)}, got ` +
          `${JSON.stringify(rangeText(src, d.range))} at ${JSON.stringify(d.range)}`,
      );
    }
  }
  // `prefer-const` is anchored at the `let` keyword its fix rewrites, so its range is
  // that keyword — not the name the message names, and not one character of it.
  const pc = diags.find((d) => d.code === "prefer-const");
  if (pc === undefined) throw new Error("no prefer-const fired");
  if (rangeText(src, pc.range) !== "let") {
    throw new Error(`prefer-const: want the range over "let", got ${JSON.stringify(rangeText(src, pc.range))}`);
  }
});

Deno.test({ name: "wasm-checker: shadowed-local warns on the inner binding's name (D3579)", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // sunpa SP-021: the loop's scalar `sheet` hides the function's array `sheet`.
  const src = "function f() {\n" +
    "  const sheet = [1.0, 2.0]\n" +
    "  let s = 0.0\n" +
    "  for k in 0 until 2 { const sheet = 10.0 * k as f64; s += sheet }\n" +
    "  s + sheet[0]\n" +
    "}\n" +
    "print(f())\n";
  const diags = checker.lint(src).filter((x) => x.code === "shadowed-local");
  if (diags.length !== 1) throw new Error(`want one shadowed-local, got ${JSON.stringify(diags)}`);
  const d = diags[0];
  const want = "`sheet` shadows the `sheet` declared at 2:9 in this function; " +
    "rename one if they are different values";
  if (d.severity !== "warning" || d.message !== want) {
    throw new Error(`want a warning ${JSON.stringify(want)}, got ${d.severity} ${JSON.stringify(d.message)}`);
  }
  const innerCol = src.split("\n")[3].indexOf("sheet");
  if (d.range.start.line !== 3 || d.range.start.character !== innerCol || rangeText(src, d.range) !== "sheet") {
    throw new Error(`want the range over the inner \`sheet\` at 3:${innerCol}, got ${JSON.stringify(d.range)}`);
  }
  // The control: a lambda's own binding is not the enclosing function's.
  const lam = "function g() {\n  const n = 1\n  const h = (k: i32) => { const n = k; n }\n  h(n)\n}\nprint(g())\n";
  const quiet = checker.lint(lam).filter((x) => x.code === "shadowed-local");
  if (quiet.length !== 0) throw new Error(`a lambda binding fired: ${JSON.stringify(quiet)}`);
});

Deno.test({ name: "wasm-checker: shadowed-function warns on a local hiding a function it calls above (D3599)", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // sunpa SP-029: `over` is called, then a `const over` hides the module's function.
  const src = "function over(x: i32) { x + 1 }\n" +
    "export function f(k: i32) {\n" +
    "  let a = over(k)\n" +
    "  const over = 3\n" +
    "  a + over\n" +
    "}\n";
  const diags = checker.lint(src).filter((x) => x.code === "shadowed-function");
  if (diags.length !== 1) throw new Error(`want one shadowed-function, got ${JSON.stringify(diags)}`);
  const d = diags[0];
  const want = "`over` shadows the function `over` declared at 1:10, which this function calls " +
    "above it; below it the name means the binding, so rename one";
  if (d.severity !== "warning" || d.message !== want) {
    throw new Error(`want a warning ${JSON.stringify(want)}, got ${d.severity} ${JSON.stringify(d.message)}`);
  }
  if (d.range.start.line !== 3 || rangeText(src, d.range) !== "over") {
    throw new Error(`want the range over the \`const\`'s name on line 3, got ${JSON.stringify(d.range)}`);
  }
  // The control: a binding named like a builtin the function never calls is quiet.
  const quiet = checker.lint("function h(max: i32) { max + 1 }\nprint(h(1))\n")
    .filter((x) => x.code === "shadowed-function");
  if (quiet.length !== 0) throw new Error(`an uncalled builtin name fired: ${JSON.stringify(quiet)}`);
});

Deno.test({ name: "wasm-checker: a sentinel-index range covers the whole read", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The owner's case: `const n = P.nodes[ix]` highlighted `P`, one column, because the
  // host widened to the identifier at `col`. The rule's own span is the read.
  const src = "type Node = { nKid: i32 }\n" +
    "let nodes: Node[] = []\n" +
    "function holeOf(n: Node) {\n" +
    "  if n.nKid < 0 { return -1 }\n" +
    "  n.nKid\n" +
    "}\n" +
    "function readIt(n: Node) {\n" +
    "  const kid = nodes[n.nKid]\n" +
    "  kid.nKid\n" +
    "}\n" +
    "print(holeOf({ nKid: 1 }) + readIt({ nKid: 0 }))\n";
  // A repo-policy rule, so it grades `compiler/` alone (docs/internals/lint-rule-scope.md).
  const diags = checker.lint(src, "compiler/probe.vl");
  const d = diags.find((x) => x.code === "sentinel-index-unguarded");
  if (d === undefined) throw new Error("no sentinel-index-unguarded fired");
  const named = /`([^`]*)`/.exec(d.message)?.[1] ?? "";
  if (rangeText(src, d.range) !== named || named !== "nodes[n.nKid]") {
    throw new Error(
      `want the range over "nodes[n.nKid]", got ${JSON.stringify(rangeText(src, d.range))}`,
    );
  }
  // The CONTROL for "the host is no longer guessing": the identifier `wordEndCol` would
  // have widened to is `nodes`, five characters, and the range is longer than that.
  if (d.range.end.character - d.range.start.character <= "nodes".length) {
    throw new Error("the range is no wider than the host's old identifier guess");
  }
});

Deno.test({ name: "wasm-checker: byte-as-code-point shows in the editor, over the read (D3641)", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // sunpa SP-029: a glyph looked up per BYTE of a copied `string` parameter. The editor
  // lints before it checks, so this is the untyped face: the receiver is visibly a string.
  const src = "function glyphOf(cp: i32) { cp }\n" +
    "function letter(text0: string, xs: i32[]) {\n" +
    "  let text = text0\n" +
    "  text = text + \"\"\n" +
    "  let n = glyphOf(text[0]) + glyphOf(xs[0])\n" +
    "  if text.slice(0, 2)[1] == 'í' { n = n + 1 }\n" +
    "  n + fromCodePoint(xs[1]).length\n" +
    "}\n" +
    "print(letter(\"Hrímey\", [1, 2]))\n";
  const diags = checker.lint(src).filter((x) => x.code === "byte-as-code-point");
  const got = diags.map((d) => rangeText(src, d.range));
  if (JSON.stringify(got) !== JSON.stringify(["text[0]", "text.slice(0, 2)[1]"])) {
    throw new Error(`want the two string reads, not the i32[] ones; got ${JSON.stringify(got)}`);
  }
  const want = "`s[i]` is a byte, not a character; use `for cp in s` or `codePoints(s)[i]`";
  for (const d of diags) {
    if (d.severity !== "warning" || d.message !== want) {
      throw new Error(`want a warning ${JSON.stringify(want)}, got ${d.severity} ${JSON.stringify(d.message)}`);
    }
  }
});

Deno.test({ name: "wasm-checker: a discarded line led by `-x` shows in the editor, over the statement, and `- x` continues (D3673, D3698)", ignore }, () => {
  const checker = loadWasmChecker(SEED, log)!;
  // sunpa SP-040: `-b` with no space after the minus is its own statement, while `- b`
  // continues `v`. The editor lints before it checks, so this is the untyped face: parameters
  // annotated as scalars fire, while a field read and a local initialised by a call need the
  // check's types and stay quiet here.
  const src = "type Cam = { x: f64, y: f64 }\n" +
    "function mk() { 2.0 }\n" +
    "function f(a: f64, b: f64, c: Cam): f64 {\n" +
    "  const w = a * 3.0\n" +
    "    -b * 3.5\n" +
    "  const v = a * 3.0\n" +
    "    - b * 3.5\n" +
    "  a + b\n" +
    "  c.x - c.y\n" +
    "  const t = mk()\n" +
    "  t * 2.0\n" +
    "  w\n" +
    "}\n" +
    "print(f(1.0, 1.0, { x: 1.0, y: 2.0 }))\n";
  const diags = checker.lint(src).filter((x) => x.code === "unused-pure-expression");
  const got = diags.map((d) => [rangeText(src, d.range), d.severity, d.message.slice(0, 34)]);
  const want = [
    ["-b * 3.5", "warning", "this line is a separate statement;"],
    ["a + b", "warning", "This expression has no effect: it "],
  ];
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
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
//
// THE RETARGET IS PARTLY LIFTED (D949). std:test v2 made `Expectation` generic, and an
// INSTANTIATION briefly rendered structurally — a 7-field receipt dump in hover, inlay and
// completion, which was a regression and not a contract. `Expectation<i32>` is pinned exactly
// again at all three, and it is strictly better than the pre-v2 `Expectation`: the argument is
// part of what the reader wants.
//
// THE TWO `expect` SIGNATURE PINS STAY PROPERTY-SHAPED, and that is a real bound rather than
// leftover caution. Those render the UNINSTANTIATED generic, whose argument is a `TyVar`, and
// `genAppNameOfTy` declines an application it cannot spell — its own stated rule, shared with
// the emit-side name-faithful renderer where a var-named argument would be wrong. Rendering
// `Expectation<T>` for a reader is desirable and is NOT what this pathway may decide alone; it
// needs a user-only mode on that renderer. Until then these pin $-freeness and named
// parameters, which is what this file exists to prove.
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
  if (eTy !== "Expectation<i32>") {
    throw new Error(`expected Expectation<i32> for e, got ${JSON.stringify(eTy)}`);
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
  if (!eHint || eHint.type !== "Expectation<i32>") {
    throw new Error(`expected an Expectation<i32> hint, got ${JSON.stringify(std)}`);
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
  if (!e || e.type !== "Expectation<i32>") {
    throw new Error(`expected e: Expectation<i32> in completion, got ${JSON.stringify(e)}`);
  }
  const ex = scope.find((b) => b.name === "expect");
  if (!ex || ex.type.includes("$") || !ex.type.includes("=>")) {
    throw new Error(`expected expect's demangled fn detail, got ${JSON.stringify(ex)}`);
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
  if (!expectTy || !expectTy.startsWith("(value:") || expectTy.includes("$")) {
    throw new Error(`expected expect's named $-free signature, got ${JSON.stringify(expectTy)}`);
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

// ── the module-arming gate through the EDITOR path ───────────────────────────
//
// `needsModules` (now `compiler/moduleGate.ts`, imported by `wasmChecker.ts`)
// decides whether the editor runs the module fetch loop, and it must agree with
// the Rust host's copy and the compiler's `cliNeedsModules`. It has TWO arms and
// each has its own failure shape:
//
//   • a module-dependency LINE — `import { … }` or a RE-EXPORT `export { … } from
//     "…"`. The re-export arm landed in the CLI and the Rust host in #2182 and NOT
//     in the two TS copies, so a file whose only module syntax was a re-export got
//     ZERO diagnostics in the editor while `vl check` reported the unresolvable
//     import. The row below is that file.
//   • a TEMPLATE HOLE, whose renderer is a `std:fmt` export — so the editor path
//     has to arm the loop for a file with no `import` line in it at all.
//
// The shared table both arms are graded against lives in
// `tests/support/moduleGateCases.ts`; `tests/module_gate_agreement_test.ts` runs
// it against the TS gate and checks the two mirrored copies' source, and
// `tests/vl_module_gate_test.ts` runs it through the native `vl`.
Deno.test({
  name: "wasm-checker: a re-export of a missing module is diagnosed (the `export {` arm)",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The gate's ONLY module syntax is the re-export. With the arm missing the
  // fetch loop never runs, the entry is compiled single-source, and the editor
  // reports NOTHING — measured, 0 diagnostics against the CLI's error.
  const reexport = await checker.check(
    'export { helper } from "./nope"\nprint(1)\n',
    "/proj/main.vl",
    noSiblings,
  );
  if (!reexport.some((d) => d.message.includes("Cannot resolve import"))) {
    throw new Error(
      `expected the unresolvable-import diagnostic; got ${reexport.length}: ` +
        `${reexport.map((d) => d.message).join("; ") || "(none — the fetch loop never armed)"}`,
    );
  }
  // The control: the same file spelled with `import` — the arm that was never
  // missing. Change ONE thing between witness and control.
  const imported = await checker.check(
    'import { helper } from "./nope"\nprint(1)\n',
    "/proj/main.vl",
    noSiblings,
  );
  if (!imported.some((d) => d.message.includes("Cannot resolve import"))) {
    throw new Error(
      `the \`import\` control lost its diagnostic too: ` +
        `${imported.map((d) => d.message).join("; ") || "(none)"}`,
    );
  }
  // `export` WITHOUT a brace list is a plain declaration, not a module edge: it
  // must stay on the single-source path and check clean. This is the arm the `{`
  // test buys, and a gate widened to a bare `startsWith("export")` breaks here.
  const plainExport = await checker.check(
    "export function twice(n: i32): i32 { n * 2 }\nprint(twice(2))\n",
    "/proj/main.vl",
    noSiblings,
  );
  if (plainExport.length !== 0) {
    throw new Error(
      `an exported declaration must not arm the module loop; got: ` +
        plainExport.map((d) => d.message).join("; "),
    );
  }
});

// D3559: an export list with no `from` arms the loop (it is an `export {` line) and must
// be refused for what it is, underlining the listed name, never as a re-export from "".
Deno.test({
  name: "wasm-checker: `export { x }` of an import names the re-export to write (D3559)",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const lib = "export function sq(n: i32): i32 { n * n }\n";
  const siblings = (p: string) => p === "/proj/lib.vl" ? lib : undefined;
  const src = 'import { sq } from "./lib"\nexport { sq }\nprint(sq(3))\n';
  const diags = await checker.check(src, "/proj/main.vl", siblings);
  const want = '`export { sq }` names an imported binding; re-export it with `export { sq } from "./lib"`';
  const got = diags.map((d) => d.message);
  if (diags.length !== 1 || diags[0].message !== want) {
    throw new Error(`want exactly ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  const r = diags[0].range;
  if (r.start.line !== 1 || r.start.character !== 9 || r.end.character !== 11) {
    throw new Error(`want the span of \`sq\` on line 1 (9..11), got ${JSON.stringify(r)}`);
  }
  // The control: the suggested spelling, kept beside the import, checks clean.
  const fixed = await checker.check(
    'import { sq } from "./lib"\nexport { sq } from "./lib"\nprint(sq(3))\n',
    "/proj/main.vl",
    siblings,
  );
  if (fixed.length !== 0) {
    throw new Error(`the suggested re-export must check clean; got ${fixed.map((d) => d.message).join("; ")}`);
  }
});

// The interpolation arm's own failure shape: without it the loop never runs, `std:fmt`
// is never committed, and the injected reference resolves to nothing — an
// "undeclared identifier" on a program the CLI compiles cleanly, the worst shape
// of divergence, since it only appears in the editor.
Deno.test({ name: "wasm-checker: an interpolated literal with an i32 hole checks clean (std:fmt is fetched)", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The reader knows NOTHING about std — `withStd` serves `std:fmt` (and the
  // `std:str` it imports) from the embedded map.
  const diags = await checker.check(
    'const x = 5\nprint("v=\\{x}")\n',
    "/proj/main.vl",
    noSiblings,
  );
  if (diags.length !== 0) {
    throw new Error(`expected clean, got: ${diags.map((d) => d.message).join("; ")}`);
  }
  // A hole-LESS literal needs no renderer and stays on the single-source path.
  const plain = await checker.check('print("plain")\n', "/proj/main.vl", noSiblings);
  if (plain.length !== 0) {
    throw new Error(`expected clean, got: ${plain.map((d) => d.message).join("; ")}`);
  }
  // A NUMERIC hole is in the domain whatever its width — the domain is the
  // renderer's declared parameter, and `f64` joined it when serde Stage 0's
  // `renderF64` landed, with no template-side change. Checked here rather than
  // asserted, because this test used to use `f64` as its OUT-of-domain case and
  // the widening is what flipped it.
  const f64 = await checker.check(
    'const f = 1.5\nprint("v=\\{f}")\n',
    "/proj/main.vl",
    noSiblings,
  );
  if (f64.length !== 0) {
    throw new Error(`expected clean, got: ${f64.map((d) => d.message).join("; ")}`);
  }
  // An out-of-domain hole is a HOLE-shaped diagnostic, positioned at the
  // hole — the span the editor squiggles. A record is outside the domain at any
  // width: it has no rendering at all, and will not get one from a number
  // renderer.
  const bad = await checker.check(
    'const p = { x: 1 }\nprint("v=\\{p}")\n',
    "/proj/main.vl",
    noSiblings,
  );
  const hit = bad.find((d) => d.message.includes("an interpolation hole is"));
  if (hit === undefined) {
    throw new Error(
      `expected a template-domain diagnostic, got: ${bad.map((d) => d.message).join("; ")}`,
    );
  }
  if (hit.range.start.line !== 1 || hit.range.start.character !== 11) {
    throw new Error(
      `expected the hole's own span at 1:11, got ${JSON.stringify(hit.range)}`,
    );
  }
  // The range is the HOLE, one character wide — not the literal token it sits
  // in, which may span lines and whose end would land off its own line.
  if (hit.range.end.line !== 1 || hit.range.end.character !== 12) {
    throw new Error(
      `expected a one-character range ending at 1:12, got ${JSON.stringify(hit.range)}`,
    );
  }

  // THE PLAIN-STRING SPELLING OF ALL OF IT. The editor's gate is a TEXTUAL scan
  // run before any lexing, so a `"…"` hole is a second thing it has to see — and
  // if it does not, the symptom is an "undeclared identifier" on a program the
  // CLI compiles cleanly, which is the divergence shape this whole test exists
  // for. Same three rows, same geometry (`\{` is two characters, as `${` was).
  const sHole = await checker.check(
    'const x = 5\nprint("v=\\{x}")\n',
    "/proj/main.vl",
    noSiblings,
  );
  if (sHole.length !== 0) {
    throw new Error(
      `a plain-string hole must check clean, got: ${sHole.map((d) => d.message).join("; ")}`,
    );
  }
  // A brace in a string is DATA and must NOT arm the loop or split the literal.
  const braces = await checker.check(
    'print("{plain} and ${x}")\n',
    "/proj/main.vl",
    noSiblings,
  );
  if (braces.length !== 0) {
    throw new Error(
      `a literal brace must stay data, got: ${braces.map((d) => d.message).join("; ")}`,
    );
  }
  const sBad = await checker.check(
    'const p = { x: 1 }\nprint("v=\\{p}")\n',
    "/proj/main.vl",
    noSiblings,
  );
  const sHit = sBad.find((d) => d.message.includes("an interpolation hole is"));
  if (sHit === undefined) {
    throw new Error(
      `expected the hole-domain diagnostic in a plain string, got: ` +
        sBad.map((d) => d.message).join("; "),
    );
  }
  if (sHit.range.start.line !== 1 || sHit.range.start.character !== 11) {
    throw new Error(
      `expected the hole's own span at 1:11, got ${JSON.stringify(sHit.range)}`,
    );
  }
});

// D1585 — THE RESERVED-NAME REFUSAL CROSSES A MODULE BOUNDARY IN THE EDITOR TOO.
//
// The refusal is raised from the driver's pre-rename window rather than from `checkProgram`,
// and the sibling that carries the offending declaration is one the EDITOR fetched — so a
// rule wired only into the checker's own pass, or one that read only the entry file, would be
// reported by `vl check` and be silently absent here. The entry below is clean.
Deno.test({
  name: "wasm-checker: a dependency's built-in-named `type` is diagnosed across the boundary",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const lib = "export type f64 = { x: i32 }\n\nexport function ping(): i32 { return 1 }\n";
  const entry = 'import { ping } from "./lib"\nprint(ping())\n';
  const read = (key: string) => (key.endsWith("lib.vl") ? lib : undefined);
  const diags = await checker.check(entry, "/proj/main.vl", read);
  const hit = diags.find((d) => d.message.includes("may not take the built-in type name"));
  if (hit === undefined) {
    throw new Error(
      "expected the reserved-name refusal from the sibling, got " + diags.length + ": " +
        (diags.map((d) => d.message).join("; ") || "(none)"),
    );
  }
  // The CONTROL, one thing changed: the same declaration under a name no annotation resolves
  // on its own. It must stay clean, or the rule is refusing ordinary user types.
  const okLib = "export type Cell = { x: i32 }\n\nexport function ping(): i32 { return 1 }\n";
  const clean = await checker.check(
    entry,
    "/proj/main.vl",
    (key: string) => (key.endsWith("lib.vl") ? okLib : undefined),
  );
  if (clean.length !== 0) {
    throw new Error(
      "a user-named sibling type must check clean, got: " +
        clean.map((d) => d.message).join("; "),
    );
  }
});

// D2355 — `__memory_shared__()` is std-internal, refused outside std by the module's
// resolution ORIGIN, never a path. The editor opens a std file directly (no import), so
// `entryKey` is a bare absolute path with no `std:` specifier anywhere — `resolveVlRoot`
// (`vlRootFor`, #3122's checkout anchor) is what lets the checker still recognize it.
Deno.test({
  name: "wasm-checker: std/buffer.vl opened directly checks clean (its own intrinsic calls are std)",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const path = new URL("../std/buffer.vl", import.meta.url).pathname;
  const source = await Deno.readTextFile(path);
  const diags = await checker.check(source, path, noSiblings);
  const hit = diags.find((d) => d.message.includes("is internal to std"));
  if (hit !== undefined) {
    throw new Error(`std/buffer.vl should not be refused its own intrinsic: ${hit.message}`);
  }
});

// The control: a folder literally named `std/` buys nothing when it is not this
// checkout's own — `vlRootFor` walks up from the FILE and finds no checkout markers.
Deno.test({
  name: "wasm-checker: a user file under its own std/ folder (outside any VL checkout) is still refused",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const diags = await checker.check(
    "print(__memory_shared__())\n",
    "/tmp/unrelated-project/std/x.vl",
    noSiblings,
  );
  const hit = diags.find((d) => d.message.includes("is internal to std"));
  if (hit === undefined) {
    throw new Error(
      "expected the origin refusal for a user std/ folder outside any checkout, got: " +
        (diags.map((d) => d.message).join("; ") || "(none)"),
    );
  }
});

// D3069 — a keyword naming a binding is ONE editor diagnostic, spanning the keyword at the
// declaration; the uses of the name after it add nothing (they were a cascade of three).
Deno.test({ name: "wasm-checker: a keyword parameter name is one diagnostic at the declaration", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const diags = await checker.check(
    "function f(type: i64) { if type == 0 { return -1 }; type + 1 }\n",
    "/tmp/x.vl",
    noSiblings,
  );
  const want = "`type` is a keyword and can't name a parameter — rename it";
  const got = diags.map((d) =>
    `${d.severity} ${d.range.start.line}:${d.range.start.character}-${d.range.end.character} ${d.message}`
  );
  if (got.length !== 1 || got[0] !== `error 0:11-15 ${want}`) {
    throw new Error(`want exactly [error 0:11-15 ${want}], got: ${JSON.stringify(got)}`);
  }
});

// D3484 (owner ruling 2026-10-03) — a key given twice in an object literal is one editor
// error per repeat, spanning the repeated key and naming the first one's position.
Deno.test({ name: "wasm-checker: a repeated object key is an error at the repeat", ignore }, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const diags = await checker.check(
    "const seq = 1\nconst o = { seq, seq: 5, b: { a: 1, a: 2 } }\nprint(o.seq)\n",
    "/tmp/x.vl",
    noSiblings,
  );
  const got = diags.map((d) =>
    `${d.severity} ${d.range.start.line}:${d.range.start.character}-${d.range.end.character} ${d.message}`
  ).sort();
  const want = [
    "error 1:17-20 key `seq` is given twice in this object literal (first at 2:13)",
    "error 1:36-37 key `a` is given twice in this object literal (first at 2:31)",
  ];
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`want ${JSON.stringify(want)}, got: ${JSON.stringify(got)}`);
  }
});
