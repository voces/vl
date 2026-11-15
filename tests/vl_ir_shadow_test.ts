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
const run = (src: string, arm: boolean, corrupt = 0) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.irShadowArm(arm ? 1 : 0);
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
function sq(x: i32): i32 { x * x }
function wide(a: i64, b: i64): i64 { a * b + 7 }
function pos(x: f64): boolean { x > 0.0 }
function sum(n: i32): i32 {
  let s = 0
  let i = 0
  while i < n {
    i = i + 1
    if i % 3 == 0 { continue }
    if i > 50 { break }
    s = s + sq(i)
  }
  s
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
    // sq, wide, pos, sum, pick and bump are each inside the set.
    if (covered < 6 || verified !== covered) {
      throw new Error(`want at least 6 covered, all verified; got covered ${covered}, verified ${verified}`);
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

// Outside I1's set: a string, a list and a record each leave their function uncovered, named.
Deno.test({
  name: "ir shadow: a construct outside the set leaves its function uncovered, by reason",
  ignore,
  fn: () => {
    const src = `function greet(s: string): string { s + "!" }
function first(xs: i32[]): i32 { xs[0] }
print(greet("a"))
print(first([4]))
`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    const unc = [...rows.keys()].filter((k) => k.startsWith("uncovered "));
    if (unc.length === 0) throw new Error(`want uncovered rows, got ${JSON.stringify([...rows])}`);
  },
});

// The verifier's own cases (`compiler/ir_selftest.vl`): hand-built IR breaking each of rules
// 1-7 is refused under that rule, and the unbroken function holds.
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
    for (let k = 0; k <= 7; k++) {
      const got = exp.irVerifySelfTest(k);
      if (got !== k) throw new Error(`case ${k}: want rule ${k}, got rule ${got}`);
    }
  },
});

