// THE EMITTED-FUNCTION RESULT SHADOW (`compiler/fn_ret_shadow.vl`, architecture target §4, the
// emitter pass rows that re-derive).
//
// `fnRecordedRetTy` answers each emitted function's result from the elaboration or the checker.
// Nothing reads it to decide anything yet; the shadow counts each emitted function by how that
// answer meets the emitter's own voidness (`fRetVoid`, from `computeVoidFns`), so the pass can be
// replaced by the column only where they agree.
//
// TWO HALVES, each needed for the other to mean anything:
//
//   classes: witnesses whose functions land in each class the shadow reports, with exact counts.
//   fires:   `fnRetShadowDropSet(1)` answers nothing, so every function becomes "no result
//            recorded"; `fnRetShadowDropSet(2)` answers `void`, so every valued function becomes
//            a disagreement. Without these, a shadow that stopped reading the column would pass.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_fn_ret_shadow_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[fn-ret-shadow] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

// Mirrors `fnRetShadowDropSet` in compiler/fn_ret_shadow.vl.
const DROP_NONE = 0;
const DROP_NOTHING = 1;
const DROP_AS_VOID = 2;

/** Compile `src` on a fresh instance with one shadow armed; the rows by class, summed. */
const shadow = (src: string, drop: number, named: boolean, kind = false) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  if (kind) exp.fnKindShadowArm(named ? 2 : 1);
  else exp.fnRetShadowArm(named ? 2 : 1);
  exp.fnRetShadowDropSet(drop);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  const rows = new Map<string, number>();
  for (let i = 0; i < exp.fnRetShadowRowCount(); i++) {
    const b = new Uint8Array(exp.fnRetShadowRowLen(i));
    for (let j = 0; j < b.length; j++) b[j] = exp.fnRetShadowRowAt(i, j);
    const k = new TextDecoder().decode(b);
    rows.set(k, (rows.get(k) ?? 0) + exp.fnRetShadowRowN(i));
  }
  return { rc, rows };
};

const show = (rows: Map<string, number>) =>
  [...rows].map(([k, n]) => `${k}=${n}`).sort().join("; ");

const expectRows = (
  name: string,
  src: string,
  drop: number,
  named: boolean,
  want: string,
  kind = false,
) => {
  const { rc, rows } = shadow(src, drop, named, kind);
  if (rc !== 0) throw new Error(`${name}: want compileSrc rc 0, got ${rc}`);
  const got = show(rows);
  if (got !== want) {
    throw new Error(`${name} (drop ${drop}):\n  want: ${want}\n  got:  ${got}`);
  }
};

// A void and a valued top-level function, both answered by the checker.
const PLAIN = `function f(x: i32) { print(x) }
function g(x: i32) { x + 1 }
f(g(2))
`;

// Two instances of one function, and a lambda inside another generic's instance: an instance
// answers from its elaboration slot, a function nested in one from its own type there, and the
// pruned template from its stub.
const GENERIC = `function id<T>(x: T): T { x }
function ap<T>(x: T): T {
  const k = (y: T) => y
  k(x)
}
print(id(3))
print(id("s"))
print(ap(4))
`;

// An uncalled closure whose tail writes `null` into a captured nullable: the assignment's value
// is the closure's recorded result, which the emitter lowers from the column.
const TAIL_WRITE = `function nn(v: i32): i32 | null {
  if v < 0 { return null }
  return v
}
function line(k: i32) {
  let x = nn(k)
  const _clr = () => {
    x = null
  }
  x = 0
  return x + 1
}
print(line(3))
`;

// A hole-parameter function whose instance's result is its returned call through the
// parameter, which the elaboration records at the instance (`elabRetOfValues`).
const HOLE = `function lap(g, x) { return g(x) }
const f = (n) => 0 - n
print(lap(f, 4))
`;

// A hole-parameter function's instance no demand keyed: its template's closed result answers.
const HOLE_TEMPLATE = `function twice(n: i32) { return n * 2 }
function f(x) { return twice(x) }
print(f(21))
`;

// A lambda in each instance of a generic whose cell is written through it: the elaboration records
// no type for the clone, so its template's result answers, closed under each instance's binding.
const KEYED_NESTED = `function inner<U>(u: U) { print("I"); print(u) }
function other<V>(v: V) { print("O"); print(v) }
function a<T>(x: T) {
  let k = inner
  const toO = () => {
    k = other
  }
  toO()
  k(x)
}
a(1)
a(true)
`;

// D14791: the tail is an \`else\`-less \`if\` writing a \`T\`-function cell. Closed under the binding,
// the template's result is a function type, which the emitter now lowers from the column.
const IF_ARM_WRITE = `function inner<U>(u: U) { print(u) }
function other<V>(v: V) { print("O") }
function c<T>(x: T) {
  let k: (t: T) => void = inner
  const toO = () => {
    if x == x { k = other }
  }
  toO()
  k(x)
}
c(1)
`;

// A lambda delivered into a nullable function field records the field's type, `(() => i64) | null`:
// its result is the function member's.
const NULLABLE_FIELD = `type R = { f: (() => i64) | null }
function go() {
  const t0: () => R = () => ({ f: () => (13131313131) })
  const t1 = t0().f
  if t1 != null { print(t1()) }
}
go()
`;

// A generic nothing instantiates is pruned to an empty stub, void as minted (`monoStubSlots`).
const STUB = `function id<T>(x: T): T { x }
function keep(x: i32) { x + 1 }
print(keep(1))
`;

// An annotated lambda: its annotation seeds the emitter's voidness, so a missing recorded
// result there is no gap `computeVoidFns` has to fill.
const ANNOT = `const f = (x: i32): i32 => x + 1
print(f(2))
`;

// A function whose body an earlier index write checked on demand, through the `"[]="` that calls
// it: pass 2's skipped re-check keeps the function type that check recorded.
const ON_DEMAND = `type IV = { base: i32 }
function fl(n: i32) {
  const out: i32[] = [0]
  out[0] = n
}
function setI(v: i32) { print(v) }
function "[]="(self: IV, i: i32, v: i32) { setI(v) }
function "[]"(self: IV, i: i32): i32 { i }
fl(1)
setI(3)
`;

Deno.test({
  name: "fn-ret shadow: classes",
  ignore,
  fn() {
    expectRows("plain", PLAIN, DROP_NONE, true, "agree | f=1; agree | g=1");
    expectRows(
      "generic",
      GENERIC,
      DROP_NONE,
      true,
      "agree | __lambda_0=1; agree | __lambda_1=1; agree | ap=1; agree | id$1=1; agree | id=1",
    );
    expectRows(
      "hole instance",
      HOLE,
      DROP_NONE,
      true,
      "agree | __lambda_0=1; agree | lap=1",
    );
    expectRows(
      "on demand",
      ON_DEMAND,
      DROP_NONE,
      true,
      "agree | []=@IV=1; agree | []@IV=1; agree | fl=1; agree | setI=1",
    );
    expectRows(
      "hole template",
      HOLE_TEMPLATE,
      DROP_NONE,
      true,
      "agree | f=1; agree | twice=1",
    );
    expectRows(
      "keyed nested",
      KEYED_NESTED,
      DROP_NONE,
      true,
      "agree | __lambda_0=1; agree | __lambda_1=1; agree | __lambda_2=1; agree | a$1=1; agree | a=1; agree | inner$1=1; agree | inner=1; agree | other$1=1; agree | other=1",
    );
    expectRows(
      "if-arm write",
      IF_ARM_WRITE,
      DROP_NONE,
      true,
      "agree | __lambda_0=1; agree | __lambda_1=1; agree | c=1; agree | inner=1; agree | other=1",
    );
    expectRows(
      "nullable field",
      NULLABLE_FIELD,
      DROP_NONE,
      true,
      "agree | __lambda_0=1; agree | __lambda_1=1; agree | go=1",
    );
    expectRows("stub", STUB, DROP_NONE, true, "agree | id=1; agree | keep=1");
    expectRows(
      "tail write",
      TAIL_WRITE,
      DROP_NONE,
      true,
      "agree | __lambda_0=1; agree | line=1; agree | nn=1",
    );
  },
});

Deno.test({
  name: "fn-ret shadow: fires",
  ignore,
  fn() {
    expectRows(
      "plain, nothing",
      PLAIN,
      DROP_NOTHING,
      false,
      // The valued function is pinned from its column before the shadow drops it.
      "no result recorded, annotated=1; no result recorded=1",
    );
    expectRows(
      "annotated, nothing",
      ANNOT,
      DROP_NOTHING,
      false,
      "no result recorded, annotated=1",
    );
    expectRows(
      "plain, all void",
      PLAIN,
      DROP_AS_VOID,
      false,
      "agree=1; recorded void, emitter value=1",
    );
    expectRows(
      "generic, all void",
      GENERIC,
      DROP_AS_VOID,
      false,
      "agree=1; recorded void, emitter value=4",
    );
  },
});

// The result-kind shadow: a valued function's recorded result against its lowered signature's
// result token. A closure writing a value `if` into a captured `i64` records `i32` (an
// assignment yields its right side) and lowers it at `i32` too (D14796).
const HEX_LAMBDA = `function g(c: boolean) {
  let x: i64 = 0
  const set = () => {
    x = if c { 0xfffffffe } else { 1 }
  }
  set()
  print(x)
}
g(true)
`;

Deno.test({
  name: "fn-ret shadow: kind classes",
  ignore,
  fn() {
    expectRows("kind plain", PLAIN, DROP_NONE, true, "kind agree | g=1", true);
    expectRows(
      "kind hex lambda",
      HEX_LAMBDA,
      DROP_NONE,
      true,
      "kind agree | __lambda_0=1",
      true,
    );
  },
});

// A generic returned past an un-annotated function into a `string`-returning slot is built
// returning `string`, beside its exact instance: each records the result it is built at (D14795).
const WIDENED_DELIVERY = `type K = "x" | "y"
function same<T>(k: T): T { k }
function d1() { return same }
const v1: (k: K) => string = d1()
print(v1("x") + "!")
const u1: (k: K) => K = same
print(u1("y"))
`;

Deno.test({
  name: "fn-ret shadow: kind widened delivery",
  ignore,
  fn() {
    expectRows(
      "kind widened delivery",
      WIDENED_DELIVERY,
      DROP_NONE,
      true,
      "kind agree | __lambda_0=1; kind agree | d1=1; kind agree | same$1=1; kind agree | same=1",
      true,
    );
  },
});

// The row shadow: a recorded result whose slot the lowering keys elsewhere is graded by the row
// each returned value was stamped built at. A fresh record a kept delivery builds wider is
// recorded at that row (`recKeptFnDstOf`) and agrees outright; a list of an instance's function
// value agrees by its stamp; an identity instance's value, stamped at its binding, is built at
// the delivery's.
const ROW_STAMP = `const i: { f: i32 } = { f: 4 }
type I = { f: i32 | null }
function mk() { { f: 7 } }
const b: I = mk()
print(b.f ?? 0)
print(i.f)
`;

const ROW_LIST = `function id<T>(x: T): T { x }
function d() { return [id] }
const v: ((x: i32) => i32)[] = d()
print(v[0](2))
const u: ((x: i32) => i32)[] = d()
print(u[0](3) + 2)
function ds() { return [id] }
const w: ((x: string) => string)[] = ds()
const g = w[0]
print(g("s"))
function di() { return [id, id] }
function main() {
  const xs: ((x: i32) => i32)[] = di()
  for f in xs { print(f(3)) }
}
main()
`;

const ROW_DELIVERY = `type J = { r: i32 | null }
function idn<T>(v: T): T { v }
const u: J | string = idn({ r: 4 })
const k = { r: 5 }
print(k.r)
if u is J { print(u.r ?? 0) }
`;

// D14902: an un-annotated function whose value is a call's, rebound, is built where that call is,
// not at the narrow record its callers are stamped at; a generic taking its call reads it there.
const ROW_CALL_BUILT = `type II = { f: i32 }
type J = { f: i32 | null }
function mk() { { f: 4 } }
function id<T>(x: T): T { x }
function r2() {
  const k = id(mk())
  const k2 = k
  return k2
}
function g<T>(a: T): T { a }
const d: J = mk()
print(g(r2()).f)
print(d.f ?? 0)
`;

// D14902: a literal handed straight back, by a hole function that only rebinds its parameter and
// by a generic identity, is built at the wider record the call lands on; the result reads there.
const ROW_HAND_BACK = `type A = { d: i32 | null }
type II = { d: i32 }
function g(v) {
  const w = v
  return w
}
function h<T>(v: T): T { return v }
const c: A = g({ d: 5 })
print(c.d ?? 0)
const e: A = h({ d: 6 })
print(e.d ?? 0)
`;

Deno.test({
  name: "fn-ret shadow: row classes",
  ignore,
  fn() {
    expectRows(
      "row stamp",
      ROW_STAMP,
      DROP_NONE,
      true,
      "kind agree | mk=1",
      true,
    );
    expectRows(
      "row list",
      ROW_LIST,
      DROP_NONE,
      true,
      "kind agree | ds=1; kind agree | id$1=1; kind agree | id=1; row agree | d=1; row agree | di=1",
      true,
    );
    expectRows(
      "row delivery",
      ROW_DELIVERY,
      DROP_NONE,
      true,
      "kind agree | idn=1",
      true,
    );
    expectRows(
      "row hand-back",
      ROW_HAND_BACK,
      DROP_NONE,
      true,
      "kind agree | g=1; kind agree | h=1",
      true,
    );
    expectRows(
      "row call-built",
      ROW_CALL_BUILT,
      DROP_NONE,
      true,
      "kind agree | g=1; kind agree | id=1; kind agree | mk=1; kind agree | r2=1",
      true,
    );
  },
});

// A `u8[]` map's callback records `(e: u8) => u8`, a storage type its value widens from: it
// crosses as the `i32` its lowered signature carries.
const U8_MAP = `const xs: u8[] = [1, 200, 7]
const m = xs.map((e) => e)
print(m[1])
`;

// An intersection of records folds to a one-member union around the merged record (D14794),
// whose rep and token are that record's.
const INTERSECTION = `type AB = { a: i32 } & { b: i32 }
function mkAB(): AB { return { a: 1, b: 2 } }
function sumAB(v: AB): i32 { return v.a + v.b }
print(sumAB(mkAB()))
`;

Deno.test({
  name: "fn-ret shadow: kind u8 and intersection",
  ignore,
  fn() {
    expectRows(
      "kind intersection",
      INTERSECTION,
      DROP_NONE,
      true,
      "kind agree | mkAB=1; kind agree | sumAB=1",
      true,
    );
    expectRows(
      "kind u8 map",
      U8_MAP,
      DROP_NONE,
      true,
      "kind agree | __lambda_0=1",
      true,
    );
  },
});

Deno.test({
  name: "fn-ret shadow: kind fires",
  ignore,
  fn() {
    expectRows(
      "kind, nothing",
      PLAIN,
      DROP_NOTHING,
      false,
      "kind: no result recorded=1",
      true,
    );
    expectRows(
      "kind, all void",
      PLAIN,
      DROP_AS_VOID,
      false,
      "kind: recorded void or never=1",
      true,
    );
  },
});
