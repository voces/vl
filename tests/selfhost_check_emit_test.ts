// The self-hosted `vl check` substrate — type-check GATES emit, end to end in VL.
//
// Until now the self-host back end (`emitProgram`) ran straight off the parser arena
// with NO type-check pass: `lexer → parser → emitProgram`. This wires the self-hosted
// TYPECHECKER (`compiler/typecheck.vl`) into the chain —
//
//     lexer → parser → checkProgram → (gate) → emitProgram
//
// — all as one VL-compiled module: a clean program type-checks and then emits a valid,
// instantiable wasm module; an ill-typed program is REJECTED by `checkProgram` and
// NEVER reaches `emitProgram`. That is the substrate of a self-hosted `vl check`.
//
// ARCHITECTURE NOTE — why this is pure wiring. The self-host emitter takes ONLY the
// parser arena and re-derives all type info itself (`collectS`/`collectU`/`buildFnMap`
// + its own narrowing stack). So `checkProgram` is a DIAGNOSTICS GATE — it does not
// hand any data to `emitProgram`, and wiring it in does not change emit. The five
// modules concatenate with ZERO symbol collisions beyond the usual lexer renames.
//
// SCOPE (Phase 1). `typecheck.vl` today covers a SUBSET — primitives, arithmetic /
// logical / comparison / equality ops, function calls (arity + types), member access,
// `let`/`func`/`if`/`return`/`block`, structural assignability, scope/shadowing. These
// cases stay inside that subset on BOTH sides (check + emit). Growing `typecheck.vl` to
// the full emit vocabulary (structs/unions/arrays/strings/maps/`is`/loops) is the
// follow-on coverage-closure track, one feature per PR, mirroring the G1–G8 emit
// journey — terminating in a self-hosted `vl check` over the compiler's own source.
//
// Like the emit suite, every case runs in ONE compiled module (compile-once): the
// driver runs the chain over each source in turn, resetting parser + checker + emitter
// state between them, and prints per-case results the host splits by key. The lexer's
// `Tok`/`Diag`/`advance` are renamed in SOURCE TEXT before concat (glue only).

import { runWasm } from "../compiler/compile.ts";
import { compileCached } from "./_selfhost_cache.ts";

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");
const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const typecheck = read("../compiler/typecheck.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// The driver: lex → parse → (gate on parse diags) → initChecker → checkProgram →
// (gate on type diags) → emitProgram. `checkProgram`'s return MUST be consumed in
// expression position (the PR#5 codegen gap forbids binding it directly), so it rides
// inside `i32ToStr(checkProgram(root))`; `T.diags` is inspected AFTER to drive the gate.
const driver = `
function loadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i })
    i = i + 1
  }
  P.toks.length
}
function runCase(key: string, src: string): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  W.bytes = []
  fnNames = []
  fnIndices = []
  localNames = []
  globalStmts = []
  globalNames = []
  loadToks(src)
  let root = parseProgram()
  if P.diags.length > 0 {
    print(key + "\\tparse-err: " + P.diags[0].msg)
    return 0
  }
  initChecker()
  print(key + "\\tncheck: " + i32ToStr(checkProgram(root)))
  if T.diags.length > 0 {
    let i = 0
    while i < T.diags.length {
      print(key + "\\tcheck-err: " + T.diags[i].tmsg)
      i = i + 1
    }
    return 0
  }
  let rc = emitProgram(root)
  if rc < 0 {
    print(key + "\\temit-err: " + emitErr)
  } else {
    print(key + "\\tmain: " + bytesToStr())
  }
  0
}
`;

// A must-pass case: type-checks clean, emits, instantiates; `run` asserts behavior.
// A must-reject case: `checkProgram` raises a diagnostic CONTAINING `errSubstr`, and the
// gate keeps it OUT of `emitProgram` (no `main:` line).
type Case =
  | { key: string; src: string; kind: "emit"; run: (call: Caller) => Promise<void> }
  | { key: string; src: string; kind: "reject"; errSubstr: string };

type Caller = (name: string, ...args: number[]) => Promise<number>;

const CASES: Case[] = [
  {
    key: "p_min",
    kind: "emit",
    src: "function main(): i32 {\n  return 42\n}\n",
    run: async (call) => assertEq(await call("main"), 42, "main"),
  },
  {
    key: "p_fib",
    kind: "emit",
    src:
      "function fib(n: i32): i32 {\n  if n < 2 { return n }\n  return fib(n - 1) + fib(n - 2)\n}\n" +
      "function main(): i32 {\n  return fib(10)\n}\n",
    run: async (call) => assertEq(await call("main"), 55, "fib(10)"),
  },
  {
    key: "p_locals",
    kind: "emit",
    src:
      "function f(n: i32): i32 {\n  let acc = n * 2\n  const bonus = 5\n  acc = acc + bonus\n  return acc\n}\n",
    run: async (call) => assertEq(await call("f", 10), 25, "f(10)"),
  },
  {
    key: "p_callchain",
    kind: "emit",
    src:
      "function inc(x: i32): i32 {\n  return x + 1\n}\n" +
      "function main(): i32 {\n  return inc(41)\n}\n",
    run: async (call) => assertEq(await call("main"), 42, "inc(41)"),
  },
  {
    // Structs (Phase 2): two `type` decls, an object literal typed by a `let`
    // annotation, an obj-literal `return` typed by the function's struct return,
    // struct-typed param + field reads.
    key: "t_struct",
    kind: "emit",
    src:
      "type P = { x: i32, y: i32 }\n" +
      "type Q = { a: i32, b: i32 }\n" +
      "function mk(a: i32, b: i32): P {\n  return { x: a, y: b }\n}\n" +
      "function sumXY(p: P): i32 {\n  return p.x + p.y\n}\n" +
      "function main(): i32 {\n  let p = mk(20, 22)\n  let q: Q = { a: 1, b: 2 }\n  return sumXY(p) + q.a + q.b\n}\n",
    run: async (call) => assertEq(await call("main"), 45, "sumXY+q.a+q.b"),
  },
  {
    // Structs + module globals + struct field WRITE across calls.
    key: "t_globals",
    kind: "emit",
    src:
      "type Counter = { n: i32 }\n" +
      "let base: i32 = 40\n" +
      "let C: Counter = { n: 0 }\n" +
      "function bump(): i32 {\n  C.n = C.n + 1\n  return C.n\n}\n" +
      "function main(): i32 {\n  bump()\n  bump()\n  return base + C.n\n}\n",
    run: async (call) => assertEq(await call("main"), 42, "base + C.n"),
  },
  {
    // Unions + `is` (Phase 2.2): a discriminated union, `is`-narrowing in a then
    // branch (param `n` refined to the variant struct, then a field read), union
    // construction by object literal (`{ av: x }` typed by the `Node` return).
    key: "t_union",
    kind: "emit",
    src:
      "type A = { av: i32 }\n" +
      "type B = { bv: i32 }\n" +
      "type Node = A | B\n" +
      "function f(n: Node): i32 {\n  if n is A { return n.av }\n  if n is B { return n.bv }\n  return 0\n}\n" +
      "function mkA(x: i32): Node {\n  return { av: x }\n}\n" +
      "function main(): i32 {\n  return f(mkA(7))\n}\n",
    run: async (call) => assertEq(await call("main"), 7, "f(mkA(7))"),
  },
  {
    // Two distinct unions coexisting; `is`-narrowing on each; union locals built by
    // annotation-typed object literals.
    key: "t_multiunion",
    kind: "emit",
    src:
      "type Lit = { val: i32 }\n" +
      "type Var = { vname: string }\n" +
      "type Node = Lit | Var\n" +
      "type TyInt = { width: i32 }\n" +
      "type TyStr = { len: i32 }\n" +
      "type Ty = TyInt | TyStr\n" +
      "function readNode(n: Node): i32 {\n  if n is Lit { return n.val }\n  return 0\n}\n" +
      "function readTy(t: Ty): i32 {\n  if t is TyInt { return t.width }\n  return 0\n}\n" +
      "function main(): i32 {\n  let n: Node = { val: 10 }\n  let t: Ty = { width: 20 }\n  return readNode(n) + readTy(t)\n}\n",
    run: async (call) => assertEq(await call("main"), 30, "readNode+readTy"),
  },
  {
    // `is`-narrows `n` to A, then reads a field that only B has → rejected.
    key: "r_union_wrong_field",
    kind: "reject",
    src:
      "type A = { av: i32 }\n" +
      "type B = { bv: i32 }\n" +
      "type N = A | B\n" +
      "function f(n: N): i32 {\n  if n is A { return n.bv }\n  return 0\n}\n" +
      "function main(): i32 {\n  return f({ av: 1 })\n}\n",
    errSubstr: "no field",
  },
  {
    // A union naming an undeclared variant → rejected in the pre-pass.
    key: "r_union_unknown_variant",
    kind: "reject",
    src:
      "type A = { av: i32 }\n" +
      "type N = A | Bogus\n" +
      "function f(n: N): i32 {\n  return 0\n}\n" +
      "function main(): i32 {\n  return 0\n}\n",
    errSubstr: "unknown type",
  },
  {
    key: "r_struct_field_type",
    kind: "reject",
    src:
      "type P = { x: i32 }\n" +
      "function main(): i32 {\n  let p: P = { x: \"hi\" }\n  return p.x\n}\n",
    errSubstr: "cannot assign",
  },
  {
    key: "r_struct_unknown_field",
    kind: "reject",
    src:
      "type P = { x: i32 }\n" +
      "function main(): i32 {\n  let p: P = { x: 1 }\n  return p.y\n}\n",
    errSubstr: "no field",
  },
  {
    key: "r_undeclared",
    kind: "reject",
    src: "function main(): i32 {\n  return x\n}\n",
    errSubstr: "undeclared identifier",
  },
  {
    key: "r_arity",
    kind: "reject",
    src:
      "function f(a: i32): i32 {\n  return a\n}\n" +
      "function main(): i32 {\n  return f()\n}\n",
    errSubstr: "wrong number of arguments",
  },
  {
    key: "r_assign_mismatch",
    kind: "reject",
    src: "function main(): i32 {\n  let x: i32 = \"hi\"\n  return x\n}\n",
    errSubstr: "cannot assign string",
  },
];

const assertEq = (got: number, want: number, what: string) => {
  if (got !== want) throw new Error(`${what} returned ${got}, expected ${want}`);
};

const calls = CASES
  .map((c) => `runCase(${JSON.stringify(c.key)}, ${JSON.stringify(c.src)})`)
  .join("\n");

// Compile + run the combined module ONCE (memoized); return the per-key log lines.
let allLogs: Promise<Map<string, string[]>> | undefined;
const runAll = (): Promise<Map<string, string[]>> =>
  allLogs ??= (async () => {
    const source = lexer + "\n" + ast + "\n" + parser + "\n" + typecheck + "\n" +
      wasmEmit + "\n" + driver + "\n" + calls + "\n";
    const { wasm, diagnostics } = await compileCached(source);
    const errs = diagnostics.filter((d) => d.severity === "error");
    if (errs.length > 0 || !wasm) {
      throw new Error(
        "check→emit driver failed to compile: " +
          errs.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    const byKey = new Map<string, string[]>();
    for (const line of logs) {
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const key = line.slice(0, tab);
      const arr = byKey.get(key) ?? [];
      arr.push(line.slice(tab + 1));
      byKey.set(key, arr);
    }
    return byKey;
  })();

// Parse a case's `main: b0,b1,…` line into bytes (throws if the case did not emit).
const bytesOf = (key: string, lines: string[]): Uint8Array => {
  const line = lines.find((l) => l.startsWith("main: "));
  if (!line) {
    throw new Error(
      `${key}: expected a clean type-check + emit, but got: ${JSON.stringify(lines)}`,
    );
  }
  return new Uint8Array(line.slice("main: ".length).split(",").map((s) => Number(s)));
};

const callerFor = async (bytes: Uint8Array): Promise<Caller> => {
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {});
  return (name: string, ...args: number[]): Promise<number> => {
    const fn = instance.exports[name] as (...a: number[]) => number;
    return Promise.resolve(fn(...args));
  };
};

CASES.forEach((c) => {
  if (c.kind === "emit") {
    Deno.test(`check→emit: ${c.key} type-checks clean, emits, runs`, async () => {
      const lines = (await runAll()).get(c.key) ?? [];
      const checkErrs = lines.filter((l) => l.startsWith("check-err: "));
      if (checkErrs.length > 0) {
        throw new Error(`${c.key}: expected a clean type-check, got: ${checkErrs.join(" | ")}`);
      }
      const bytes = bytesOf(c.key, lines);
      await WebAssembly.compile(bytes); // valid wasm
      await c.run(await callerFor(bytes));
    });
  } else {
    Deno.test(`check→emit: ${c.key} is REJECTED by the type-checker (gate blocks emit)`, async () => {
      const lines = (await runAll()).get(c.key) ?? [];
      const checkErrs = lines.filter((l) => l.startsWith("check-err: "));
      if (checkErrs.length === 0) {
        throw new Error(`${c.key}: expected a type error containing "${c.errSubstr}", got: ${JSON.stringify(lines)}`);
      }
      if (!checkErrs.some((l) => l.includes(c.errSubstr))) {
        throw new Error(`${c.key}: no diagnostic contained "${c.errSubstr}"; got: ${checkErrs.join(" | ")}`);
      }
      if (lines.some((l) => l.startsWith("main: "))) {
        throw new Error(`${c.key}: the gate LEAKED — an ill-typed program reached emitProgram`);
      }
    });
  }
});
