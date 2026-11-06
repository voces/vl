// THE RETURN-REACH QUERY ANSWERS EVERY TIME (`elabValueReturnsFrom`, compiler/emit_elab.vl).
//
// The query walks the forward climb with a return sink on. An outermost climb is memoised, so a
// query answered from the memo walks nothing and its sink stays empty: asked a second time for the
// same value, it answered false. This asks for one generic's value three times, against two
// functions that both return it and then the first again; every answer must be true.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_elab_rets_reach_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[elab-rets-reach] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

/** Check `src` on a fresh instance and return the probe's answer bits. */
const probe = (src: string) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  exp.checkSrc();
  return exp.elabRetsReachProbe();
};

const BOTH_RETURN_G = `function g<T>(x: T): T { x }
function f1() { return g }
function f2() { return g }
print(f1()(1))
print(f2()("s"))
`;

const ONLY_F1 = `function g<T>(x: T): T { x }
function h<T>(x: T): T { x }
function f1() { return g }
function f2() { return h }
print(f1()(1))
print(f2()("s"))
`;

Deno.test({
  name: "elab-rets-reach: a repeated query for one value still walks",
  ignore,
  fn() {
    const got = probe(BOTH_RETURN_G);
    if (got !== 7) {
      throw new Error(`want 7 (g reaches f1, f2, then f1 again), got ${got}`);
    }
  },
});

Deno.test({
  name: "elab-rets-reach: control, a function that returns another value is not reached",
  ignore,
  fn() {
    const got = probe(ONLY_F1);
    if (got !== 5) {
      throw new Error(`want 5 (g reaches f1 twice, not f2), got ${got}`);
    }
  },
});
