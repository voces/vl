// THE FUNCTION-VALUE FLOW TABLE IN SHADOW MODE (`compiler/fn_flow_shadow.vl`,
// fn-value-flow-design.md §(f) step 1).
//
// Armed, the table is built from the checked tree before `monomorphize` and graded against
// every function value the monomorphizer decided; its verdicts are `flow | …` rows in the
// per-call shadow's bank. Nothing reads those rows to decide anything (the table itself pins a
// hole lambda that shares a class with a peer, armed or not), so the emitted module must be the
// same armed and disarmed.
//
//   classes  — witnesses whose function values land in each verdict, with exact counts: an
//              agreement, a multi-pin class against mono's own refusal, an undecided
//              return, and a disagreement that was silent wrong code.
//   identity — armed and disarmed compiles emit the same bytes and the same diagnostics.
//   off      — disarmed, the table records no row, and a program with no generic does no work
//              (the monomorphizer builds it, armed or not, whenever a generic exists).
//
// The cost bound is the `fn-flow` pair in tests/vl_scaling_shape_test.ts.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_fn_flow_shadow_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[fn-flow-shadow] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore ? undefined : new WebAssembly.Module(Deno.readFileSync(COMPILER));

// Mirrors `ffMode` in compiler/fn_flow_shadow.vl.
const OFF = 0;
const ARMED = 1;
const NAMED = 2;

const text = (n: number, at: (j: number) => number) => {
  const b = new Uint8Array(n);
  for (let j = 0; j < n; j++) b[j] = at(j);
  return new TextDecoder().decode(b);
};

/** Compile `src` on a fresh instance at `mode`: rc, the emitted bytes or diagnostics, the flow rows. */
const compile = (src: string, mode: number) => {
  const exp = new WebAssembly.Instance(compiled!, {}).exports as unknown as Exports;
  exp.fnFlowShadowArm(mode);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  let out = "";
  if (rc === 0) {
    out = text(exp.rbyteLen(), (i) => exp.rbyteAt(i));
  } else {
    for (let i = 0; i < exp.diagCount(); i++) out += text(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j)) + "\n";
  }
  exp.fnFlowShadowFinish();
  const rows = new Map<string, number>();
  for (let i = 0; i < exp.callBindShadowRowCount(); i++) {
    const k = text(exp.callBindShadowRowLen(i), (j) => exp.callBindShadowRowAt(i, j));
    if (k.startsWith("flow | ")) rows.set(k.slice(7), (rows.get(k.slice(7)) ?? 0) + exp.callBindShadowRowN(i));
  }
  return { rc, out, rows, work: exp.fnFlowShadowWork() };
};

const show = (rows: Map<string, number>) => [...rows].map(([k, n]) => `${k}=${n}`).sort().join("; ");

// A generic higher-order call with a concrete function argument: mono and the table agree.
const AGREE = `function ap<T>(f: (x: T) => T, x: T): T { f(x) }
function inc(x: i32): i32 { x + 1 }
print(ap(inc, 2))
`;

// One binding written with a generic and called at two signatures: the binding reads as its set,
// whose calls run each member at its own instance (`compiler/check_fn_tag.vl`). The table does
// not model a tagged set, so it grades the binding as one instance for its two pins, as it does
// any written binding of generics the tag rule takes.
const MULTI = `function id<T>(x: T): T { x }
let k = id
k = id
print(k(1))
print(k("s"))
`;

// An un-annotated parameter called as a method: mono pins the record at the elaboration's type,
// which the table's binding holds, and the closure's result flows back through a function value
// (D3925). The instance carries its template's checked `void` result, so only the template is
// undecided.
const H05 = `export function click(b) {
  b.onClick()
}
click({ onClick: () => print("A") })
print("end")
`;

// A returned closure whose written result names a type parameter: the clone is annotated at
// the value's type or null, so its written result agrees with the checked one (D3935).
const M01B = `function a<T>(x: T): (t: T) => ((u: T) => T) | null { (t: T) => (u: T) => u }
function pr<T>(x: T) {
  const f = a(x)(x)
  if f != null { print(f(x)) }
}
pr(2.5)
`;

const CASES: [string, string, number, string][] = [
  ["AGREE", AGREE, 0, "agree | argument | inc=1; agree | direct call | ap=1"],
  [
    "MULTI",
    MULTI,
    0,
    "disagree: one instance for a class of several pins | binding | id=1; " +
    "disagree: one instance for a class of several pins | write | id=1; " +
    "multi-pin: table only | binding | k=1",
  ],
  [
    "H05",
    H05,
    0,
    "agree | direct call | click=1; " +
    "undecided: return through a function value | return | click=1",
  ],
  [
    "M01B",
    M01B,
    0,
    "agree | direct call | a=1; agree | direct call | pr=1; agree | return | __lambda_2=2; " +
    "agree | return | __lambda_3=2; " +
    "unpinned: binding left open | direct call | a=1; " +
    "unpinned: mono decided alone | return | __lambda_0=1; " +
    "unpinned: mono decided alone | return | __lambda_1=1",
  ],
];

Deno.test({
  name: "fn-flow shadow: each witness lands in its verdict",
  ignore,
  fn() {
    for (const [name, src, rc, want] of CASES) {
      const got = compile(src, NAMED);
      if (got.rc !== rc) throw new Error(`${name}: want compileSrc rc ${rc}, got ${got.rc}`);
      if (show(got.rows) !== want) {
        throw new Error(`${name}:\n  want: ${want}\n  got:  ${show(got.rows)}`);
      }
    }
  },
});

Deno.test({
  name: "fn-flow shadow: an unnamed row carries the verdict and the position only",
  ignore,
  fn() {
    const want = "agree | argument=1; agree | direct call=1";
    const got = show(compile(AGREE, ARMED).rows);
    if (got !== want) throw new Error(`want: ${want}\n  got:  ${got}`);
  },
});

Deno.test({
  name: "fn-flow shadow: armed and disarmed compiles emit the same module",
  ignore,
  fn() {
    for (const [name, src] of CASES) {
      const off = compile(src, OFF);
      const on = compile(src, NAMED);
      if (off.rc !== on.rc || off.out !== on.out) {
        throw new Error(`${name}: arming the shadow changed the compile (rc ${off.rc} -> ${on.rc})`);
      }
    }
  },
});

Deno.test({
  name: "fn-flow shadow: disarmed, it records no row, and does no work without a generic",
  ignore,
  fn() {
    for (const [name, src] of CASES) {
      const off = compile(src, OFF);
      if (off.rows.size !== 0) {
        throw new Error(`${name}: want no rows disarmed, got ${show(off.rows)}`);
      }
    }
    const plain = compile(`const inc = (x: i32): i32 => x + 1\nprint(inc(2))\n`, OFF);
    if (plain.rows.size !== 0 || plain.work !== 0) {
      throw new Error(`generic-free: want no rows and work 0, got ${show(plain.rows)} work ${plain.work}`);
    }
    const generic = compile(AGREE, OFF);
    if (generic.work === 0) {
      throw new Error("AGREE: want the table built disarmed (work > 0), got work 0");
    }
  },
});
