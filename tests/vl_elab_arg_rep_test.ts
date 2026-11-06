// A CALL ARGUMENT'S DELIVERED REP DIFFERS FROM ITS TYPE ONLY AS A BUNDLE OR A WIDER RECORD
// (`elabCallArgRep`, compiler/emit_elab.vl).
//
// The elaboration keeps an instance's type and the rep its call delivers each argument at as
// separate facts (DECISIONS.md, "An instance's type and its rep are separate facts"). The reach
// rows record the rep only where it is not the parameter's type, and it may differ in two ways
// alone: the record of one closure per signature a bundle parameter is called at, or a record the
// call builds wider than the parameter's type. `elabArgRepProbe` grades every row: wider records
// in the units, bundles in the thousands, and each slot breaking the rule a million.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_elab_arg_rep_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[elab-arg-rep] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

/** Check `src` on a fresh instance and return the probe's grade. */
const probe = (src: string) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  exp.checkSrc();
  const g = exp.elabArgRepProbe();
  return {
    bad: Math.floor(g / 1000000),
    bundles: Math.floor((g % 1000000) / 1000),
    wides: g % 1000,
    built: exp.elabArgBuiltProbe(),
    closures: Math.floor(exp.elabArgBundleKindProbe() / 1000),
    records: exp.elabArgBundleKindProbe() % 1000,
  };
};

const BUNDLE = `function lap(f) {
  f(2.5)
  f(3)
  return f
}
const r = lap((a) => a + 1)
print(r(2))
`;

const WIDENED = `type A = { d: i32 | null }
function g(v) {
  const w = v
  return w
}
const c: A = g({ d: 5 })
print(c.d ?? 0)
`;

// A call whose bind row is keyed at its rep builds its argument at the wider record (`erArgBuilt`).
const REP_KEYED = `type J = { r: i32 | null, g: i32 }
function idn<T>(v: T): T { v }
function mk() { { r: 15, g: 1 } }
const j: J = idn(mk())
print(j.g)
`;

// A record handed to a wider declared field (D2060) keeps its own record: no built rep.
const COVARIANT = `function boundShow<T: { x: i32 | string }>(t: T) {
  if t.x is i32 { print(t.x) }
}
boundShow({ x: 5 })
`;

// A lambda calling its own parameter at two signatures, handed to a parameter called at two, is one
// closure taking its bundle: `use(lap)`'s slot holds that closure, not a bundle record. The two
// records are `k(id)` and `k(dup)`, each handing a generic to `g` at its two signatures.
const CLOSURE_BUNDLE = `function id(a) { return a }
function dup(a) { return a }
function use(k) { print(k(id)); return k(dup) }
const lap = (g) => { print(g(1) + 1); return g("s") }
print(use(lap))
`;

const PLAIN = `function id<T>(x: T): T { x }
print(id(3))
print(id("s"))
`;

Deno.test({
  name: "elab-arg-rep: a bundle parameter is delivered at its closures' record",
  ignore,
  fn() {
    const got = probe(BUNDLE);
    if (got.bad !== 0 || got.bundles < 1) {
      throw new Error(`want a bundle rep and no break, got ${JSON.stringify(got)}`);
    }
  },
});

Deno.test({
  name: "elab-arg-rep: a record built wider is delivered at that record",
  ignore,
  fn() {
    const got = probe(WIDENED);
    if (got.bad !== 0 || got.wides < 1) {
      throw new Error(`want a wider rep and no break, got ${JSON.stringify(got)}`);
    }
  },
});

Deno.test({
  name: "elab-arg-rep: a plain argument is delivered at its type",
  ignore,
  fn() {
    const got = probe(PLAIN);
    if (got.bad !== 0 || got.bundles !== 0 || got.wides !== 0) {
      throw new Error(`want no rep apart from the type, got ${JSON.stringify(got)}`);
    }
  },
});

Deno.test({
  name: "elab-arg-rep: an argument a rep-keyed call builds wider records its built record",
  ignore,
  fn() {
    const got = probe(REP_KEYED);
    if (got.bad !== 0 || got.built < 1) {
      throw new Error(`want a built record, got ${JSON.stringify(got)}`);
    }
  },
});

Deno.test({
  name: "elab-arg-rep: a record handed to a wider declared field records no built record",
  ignore,
  fn() {
    const got = probe(COVARIANT);
    if (got.bad !== 0 || got.built !== 0) {
      throw new Error(`want no built record, got ${JSON.stringify(got)}`);
    }
  },
});

Deno.test({
  name: "elab-arg-rep: a lambda taking its own bundle is delivered as a closure, not a record",
  ignore,
  fn() {
    const got = probe(CLOSURE_BUNDLE);
    if (got.bad !== 0 || got.closures !== 1 || got.records !== 2) {
      throw new Error(`want a closure rep and no bundle record, got ${JSON.stringify(got)}`);
    }
  },
});
