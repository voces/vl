// THE INSTANCES' CALL FACTS (`compiler/check_mint.vl`, D14430).
//
// While an un-annotated function's body is typed at one tuple of its hole parameters, a call of
// a parameter bound to a function set records one fact for that instance. Nothing reads the
// facts yet, so the only thing to grade is that they are produced, and only where they should be:
//
//   fires   — `apU(r)` mapped over a list of one un-annotated function records a fact.
//   control — the same body over a closed annotated callback records none.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_mint_facts_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[mint-facts] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

/** Check `src` on a fresh instance; how many call facts stand after it. */
const facts = (src: string) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  exp.checkSrc();
  return exp.mintFactCount();
};

const THROUGH_SET = `function inc2(a) { return a + 2 }
function apU(r) { return r(5) }
const v2 = [inc2]
print(v2.map(apU)[0])
`;

const THROUGH_CLOSED = `const inc2 = (a: i32): i32 => a + 2
function apU(r) { return r(5) }
const v2 = [inc2]
print(v2.map(apU)[0])
`;

Deno.test({
  name: "mint facts: a call through a set in an instance body is recorded",
  ignore,
  fn() {
    const got = facts(THROUGH_SET);
    if (got < 1) throw new Error(`want at least 1 fact, got: ${got}`);
  },
});

Deno.test({
  name: "mint facts: a call through a closed callback records none",
  ignore,
  fn() {
    const got = facts(THROUGH_CLOSED);
    if (got !== 0) throw new Error(`want 0 facts, got: ${got}`);
  },
});
