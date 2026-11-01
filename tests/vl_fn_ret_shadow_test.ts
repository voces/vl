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

/** Compile `src` on a fresh instance with the shadow armed; the rows by class, summed. */
const shadow = (src: string, drop: number, named: boolean) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.fnRetShadowArm(named ? 2 : 1);
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
) => {
  const { rc, rows } = shadow(src, drop, named);
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
// is the closure's recorded result, and the emitter makes it void.
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
    expectRows("stub", STUB, DROP_NONE, true, "agree | id=1; agree | keep=1");
    expectRows(
      "tail write",
      TAIL_WRITE,
      DROP_NONE,
      true,
      "agree | line=1; agree | nn=1; emit-time: tail assignment lowered void | __lambda_0=1",
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
      "no result recorded=2",
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
