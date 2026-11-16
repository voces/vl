// THE IR SHADOW (`compiler/ir_build.vl`, ir-design-2026-11.md step I0).
//
// Armed, `emitFuncCode` hands each function to the phase-A builder after its legacy lowering;
// a function inside I1's construct set is built, verified and discarded. TWO HALVES:
//
//   covered — programs in the set build and verify, with a nonzero covered count and no
//             failure, and an armed compile's bytes equal an unarmed one's.
//   fires   — `irShadowCorrupt(1)` swaps a variable's rep and `irShadowCorrupt(2)` deletes a
//             temp's definition: the verifier must fail naming rule 3 and rule 4. Without
//             these a verifier that checked nothing would pass.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_ir_shadow_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[ir-shadow] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

/** Compiles `src` on a fresh instance; the shadow's rows when `arm` is set, and the output. */
const run = (src: string, arm: boolean | number, corrupt = 0) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.irShadowArm(typeof arm === "number" ? arm : arm ? 1 : 0);
  exp.irShadowCorrupt(corrupt);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  const rows = new Map<string, number>();
  for (let i = 0; i < exp.irShadowRowCount(); i++) {
    const b: number[] = [];
    for (let j = 0; j < exp.irShadowRowLen(i); j++) b.push(exp.irShadowRowAt(i, j));
    rows.set(String.fromCodePoint(...b), exp.irShadowRowN(i));
  }
  const out: number[] = [];
  for (let i = 0; i < exp.rbyteLen(); i++) out.push(exp.rbyteAt(i));
  return { rc, rows, out };
};

const failures = (rows: Map<string, number>) =>
  [...rows.keys()].filter((k) => k.startsWith("fail "));

// Scalars, locals, every control form, direct calls and a global: all inside I1's set.
const COVERED = `let total = 0
function sq(x: i32): i32 { return x * x }
function wide(a: i64, b: i64): i64 { return a * b + 7 }
function pos(x: f64): boolean { return x > 0.0 }
function above(x: f64): boolean { return x > -1.5 }
function sum(n: i32): i32 {
  let s = 0
  let i = 0
  while i < n {
    i = i + 1
    if i % 3 == 0 { continue }
    if i > 50 { break }
    s = s + sq(i)
  }
  return s
}
function pick(a: i32, b: i32): i32 {
  if a > b && b >= 0 || a == 0 { return a }
  return -b
}
function bump() { total = total + 1 }
bump()
print(sum(10))
print(pick(3, 2))
print(wide(3, 4))
print(pos(1.5))
print(above(-2.0))
print(total)
`;

Deno.test({
  name: "ir shadow: I1's constructs build and verify, and arming moves no byte",
  ignore,
  fn: () => {
    const armed = run(COVERED, true);
    if (armed.rc !== 0) throw new Error(`want compileSrc rc 0, got ${armed.rc}`);
    const fails = failures(armed.rows);
    if (fails.length > 0) throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    const covered = armed.rows.get("covered") ?? 0;
    const verified = armed.rows.get("verified") ?? 0;
    const fns = armed.rows.get("fns") ?? 0;
    console.log(`[ir-shadow] covered ${covered} of ${fns}; rows ${JSON.stringify([...armed.rows])}`);
    // sq, wide, pos, above, sum, pick and bump are each inside the set.
    if (covered < 7 || verified !== covered) {
      throw new Error(`want at least 7 covered, all verified; got covered ${covered}, verified ${verified}`);
    }
    const matched = armed.rows.get("matched") ?? 0;
    if (matched !== covered) {
      throw new Error(`want every covered function to match legacy's bytes, got ${matched} of ${covered}`);
    }
    const plain = run(COVERED, false);
    if (plain.rows.size !== 0) throw new Error(`want no rows unarmed, got ${plain.rows.size}`);
    if (plain.out.length !== armed.out.length || plain.out.some((b, i) => b !== armed.out[i])) {
      throw new Error(`want byte-identical output armed and unarmed (${plain.out.length} vs ${armed.out.length} bytes)`);
    }
  },
});

for (const [mode, rule] of [[1, 3], [2, 4]] as const) {
  Deno.test({
    name: `ir shadow: the failing control ${mode} makes the verifier name rule ${rule}`,
    ignore,
    fn: () => {
      const { rc, rows } = run(COVERED, true, mode);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      const named = fails.filter((k) => k.startsWith(`fail rule ${rule} `));
      if (named.length === 0) {
        throw new Error(`want a rule ${rule} failure, got: ${JSON.stringify([...rows.keys()].map((k) => k.split("\n")[0]))}`);
      }
      if (named.length !== fails.length) {
        throw new Error(`want only rule ${rule}, got: ${fails.map((k) => k.split("\n")[0]).join("; ")}`);
      }
    },
  });
}

// The dual emit's controls: a byte added to the lowering, and a span row dropped from it, must
// each turn every match into a mismatch of that class. Without these a comparison that compared
// nothing would pass.
for (const [mode, cls] of [[3, "mismatch bytes"], [4, "mismatch spans"]] as const) {
  Deno.test({
    name: `ir shadow: the dual emit's control ${mode} reports a ${cls.slice(9)} mismatch`,
    ignore,
    fn: () => {
      const { rc, rows } = run(COVERED, true, mode);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      const got = [...rows].filter(([k]) => k.startsWith(cls)).reduce((n, [, c]) => n + c, 0);
      const covered = rows.get("covered") ?? 0;
      if ((rows.get("matched") ?? 0) !== 0 || got !== covered) {
        throw new Error(`want all ${covered} covered as "${cls}", got ${JSON.stringify([...rows])}`);
      }
    },
  });
}

// Outside I1's set: a string, a list and a record each leave their function uncovered, named.
Deno.test({
  name: "ir shadow: a construct outside the set leaves its function uncovered, by reason",
  ignore,
  fn: () => {
    // A returned `if` that yields its arms' values is outside the set too.
    const src = `function greet(s: string | null): string { return s ?? "!" }
function fx(p: { x: i32 }): i32 { return p.x }
function sel(c: boolean): i32 { return if c { 1 } else { 2 } }
print(greet("a"))
print(fx({ x: 4 }))
print(sel(true))
`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    for (const why of ["expression if"]) {
      if (!rows.has(`uncovered ${why}`)) {
        throw new Error(`want an "uncovered ${why}" row, got ${JSON.stringify([...rows])}`);
      }
    }
    const unc = [...rows.keys()].filter((k) => k.startsWith("uncovered "));
    if (unc.length < 3) throw new Error(`want three uncovered reasons, got ${JSON.stringify([...rows])}`);
  },
});

// The decisions legacy and the lowering share (I1b): a reference global's read and its
// `ref.as_non_null`, a never-returning callee's `call; unreachable`, and an instance's parameter
// read; string operators, a char literal, a string list read and a void call's tail form (C2h);
// an atom result and its literals (C2i); string `.slice` and `.cpLen` (C2j); a list push (C2k).
// Each witness is one covered function that must match legacy's bytes.
const SHARED = [
  `let name = "vl"\nfunction who(): string { return name }\nprint(who())\n`,
  `function stop(code: i32): never { return __trap__() }
function guard(x: i32): i32 {
  if x < 0 { stop(x) }
  return x + 1
}
print(guard(2))
`,
  `function id<T>(v: T): T { return v }\nprint(id(3))\n`,
  `function cmp(a: string, b: string): boolean { return a + "x" == b || a > b }\nprint(cmp("a", "b"))\n`,
  `function dig(c: i32): boolean { return c >= '0' && c <= '9' }\nprint(dig(53))\n`,
  `function at(xs: string[], i: i32): string { return xs[i] }\nprint(at(["a", "b"], 1))\n`,
  `function note(s: string) { print(s) }\nfunction tw(s: string) { return note(s + "!") }\ntw("a")\n`,
  `type K = "p" | "q"\nfunction pick(c: boolean): K {\n  if c { return "p" }\n  return "q"\n}\nprint(pick(true) == "p")\n`,
  `function tl(s: string, n: i32): string { return s.slice(n, s.length) }\nprint(tl("hello", 2))\n`,
  `function cps(s: string): i32 { return s.cpLen() + 1 }\nprint(cps("ab"))\n`,
  `let gs: i32[] = []\nfunction add(x: i32): i32 {\n  gs.push(x)\n  return gs.push(x + 1)\n}\nprint(add(1))\n`,
  `let ns: string[] = ["a", "b"]\nfunction put(i: i32, s: string) { ns[i] = s + "!" }\nput(1, "z")\nprint(ns[1])\n`,
  `let fs: f64[] = [0.0, 0.0]\nfunction wid(i: i32, x: i32): f64 {\n  fs[i] = x\n  const y: f64 = x\n  return y\n}\nprint(wid(1, 3))\n`,
];
Deno.test({
  name: "ir shadow: each shared decision's witness is covered and matches legacy",
  ignore,
  fn: () => {
    for (const src of SHARED) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      if ((rows.get("covered") ?? 0) !== 1 || (rows.get("matched") ?? 0) !== 1) {
        throw new Error(`want one covered, matched function, got ${JSON.stringify([...rows])}\n${src}`);
      }
    }
  },
});

// An operand written while a valued `if`'s value waits on the stack would land above it: the
// lowering names that rather than writing its arguments out of order.
Deno.test({
  name: "ir shadow: an operand above a valued if's value is a named miss, not a byte mismatch",
  ignore,
  fn: () => {
    const src = `function pair(a: i32, b: boolean): i32 { return if b { a } else { 0 - a } }
function k(a: i32, c: boolean, d: boolean): i32 {
  const r = pair(a, c && d)
  return r
}
print(k(2, true, false))
`;
    const { rows } = run(src, true);
    const want = "mismatch unlowered: operand above a valued if's value";
    if (rows.get(want) !== 1) throw new Error(`want one "${want}" row, got ${JSON.stringify([...rows])}`);
  },
});

// An unannotated parameter's type stays open until a call instances it: the builder leaves that
// function uncovered rather than handing the verifier an open-typed variable (rule 1).
Deno.test({
  name: "ir shadow: an open-typed parameter is uncovered, never a verifier failure",
  ignore,
  fn: () => {
    const src = `function k<T>(x: T): T { return x }
function fw(f) { return f }
function main() {
  const o = fw(k)
  print(o(6))
}
main()
`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    if (!rows.has("uncovered open parameter type")) {
      throw new Error(`want an "uncovered open parameter type" row, got ${JSON.stringify([...rows])}`);
    }
  },
});

// The claim path (`irClaimFn`): mode 3 claims every I1 family, so legacy does not run for a
// covered function and the lowering's code entry ships. The output must be byte-identical.
Deno.test({
  name: "ir claim: claiming every I1 family ships the same bytes legacy does",
  ignore,
  fn: () => {
    const claimed = run(COVERED, 3);
    if (claimed.rc !== 0) throw new Error(`want compileSrc rc 0, got ${claimed.rc}`);
    const n = claimed.rows.get("claimed") ?? 0;
    // sq, wide, pos, sum, pick and bump are each claimable.
    if (n < 6) throw new Error(`want at least 6 claimed, got ${JSON.stringify([...claimed.rows])}`);
    const fell = [...claimed.rows.keys()].filter((k) => k.startsWith("claim fell back"));
    if (fell.length > 0) throw new Error(`want no claim to fall back, got ${fell.join(", ")}`);
    const plain = run(COVERED, false);
    if (plain.out.length !== claimed.out.length || plain.out.some((b, i) => b !== claimed.out[i])) {
      throw new Error(`want byte-identical output claimed and not (${plain.out.length} vs ${claimed.out.length} bytes)`);
    }
  },
});

// The verifier's own cases (`compiler/ir_selftest.vl`): hand-built IR breaking each of rules
// 1-7 is refused under that rule, as are a fall-through and a mismatched global store, and the
// unbroken function holds.
Deno.test({
  name: "ir shadow: each hand-built case fails the rule it breaks, and the control holds",
  ignore,
  fn: () => {
    const exp = new WebAssembly.Instance(compiled!, {})
      .exports as unknown as Exports;
    // Any compile initialises the checker's primitives the cases are typed at.
    exp.modReset();
    exp.srcReset();
    for (const ch of "print(1)\n") exp.srcPush(ch.codePointAt(0)!);
    if (exp.compileSrc() !== 0) throw new Error("want the priming compile to pass");
    // Case k breaks rule k for 1 to 7; case 8 falls off a valued function's end (rule 5) and
    // case 9 stores an i32 into a bool global (rule 2).
    // Case 10 is a bounds check while the bounds rule is the uninstalled default (rule 8).
    const want = [0, 1, 2, 3, 4, 5, 6, 7, 5, 2, 8];
    for (let k = 0; k < want.length; k++) {
      const got = exp.irVerifySelfTest(k);
      if (got !== want[k]) throw new Error(`case ${k}: want rule ${want[k]}, got rule ${got}`);
    }
  },
});


// The blocker census (mode 4): a function's build goes on past a missed statement, so its row names
// every class it missed, sorted into one key; a covered function reads `blockers none`.
Deno.test({
  name: "ir shadow: the blocker census names every class a function missed, and moves no byte",
  ignore,
  fn: () => {
    const src = `function ok(x: i32): i32 { return x + 1 }
function two(s: string, t: string | null): i32 {
  const xs = [1, 2]
  if (t ?? s) == s { return xs[0] }
  return 0
}
print(ok(1))
print(two("a", "b"))
`;
    const census = run(src, 4);
    if (census.rc !== 0) throw new Error(`want compileSrc rc 0, got ${census.rc}`);
    const want = "blockers expression array + operand at string + parameter rep nullable";
    if ((census.rows.get(want) ?? 0) !== 1) {
      throw new Error(`want one row ${want}, got ${JSON.stringify([...census.rows])}`);
    }
    if ((census.rows.get("blockers none") ?? 0) !== 1) {
      throw new Error(`want one covered function, got ${JSON.stringify([...census.rows])}`);
    }
    const plain = run(src, false);
    if (plain.out.length !== census.out.length || plain.out.some((b, i) => b !== census.out[i])) {
      throw new Error(`want byte-identical output under the census (${plain.out.length} vs ${census.out.length} bytes)`);
    }
  },
});
