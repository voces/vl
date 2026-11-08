// THE BOX-DESTINATION SHADOW (`compiler/box_dst_shadow.vl`, architecture-target-2026-10.md,
// step 5's record line).
//
// The checker records the union each node is delivered into (`boxDstTyAt`, per instance). The
// shadow compares it with the union each `emitUnionBoxArg` / `emitUnionCoerce` call site names,
// and counts each delivery by class. A delivery the table boxes at its record counts as `table`,
// ungraded (the sweep grades those positions); the box's own lowering inside it is still graded.
//
// TWO HALVES, each needed for the other to mean anything:
//
//   classes — witnesses whose deliveries land in each class, with exact counts. A delivery a
//             site boxes inside its own lowering counts as `nested <class>`. `brk` reaches
//             the record through the loop's exits; its minted `__trap__()` tail never returns.
//   fires   — `boxDstDropSet(1)` reads no record, so every graded agreement becomes a missing
//             row; `boxDstDropSet(2)` reads a type no site names, so every one disagrees.
//             Without these a shadow that stopped reading the record would pass.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_box_dst_shadow_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[box-dst-shadow] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

// Mirrors `boxDstDropSet` in compiler/box_dst_shadow.vl.
const DROP_NONE = 0;
const DROP_READ = 1;
const DROP_AS_OTHER = 2;

/** Compile `src` on a fresh instance with the shadow armed; the rows by class, summed. */
const shadow = (src: string, drop: number, nums = false) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.boxDstShadowArm(1);
  exp.boxDstDropSet(drop);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  const rows = new Map<string, number>();
  for (let i = 0; i < exp.boxDstShadowRowCount(); i++) {
    const b = new Uint8Array(exp.boxDstShadowRowLen(i));
    for (let j = 0; j < b.length; j++) b[j] = exp.boxDstShadowRowAt(i, j);
    const k = new TextDecoder().decode(b);
    // The numeric widenings are graded by their own case below, not in the union tallies.
    if (k.startsWith("num ") !== nums) continue;
    rows.set(k, (rows.get(k) ?? 0) + exp.boxDstShadowRowN(i));
  }
  return { rc, rows };
};

const show = (rows: Map<string, number>) =>
  [...rows].map(([k, n]) => `${k}=${n}`).sort().join("; ");

const expectRows = (name: string, src: string, drop: number, want: string) => {
  const { rc, rows } = shadow(src, drop);
  if (rc !== 0) throw new Error(`${name}: want compileSrc rc 0, got ${rc}`);
  const got = show(rows);
  if (got !== want) {
    throw new Error(`${name} (drop ${drop}):\n  want: ${want}\n  got:  ${got}`);
  }
};

// An argument boxed at a declared union parameter.
const ARG = `function show(x: i32 | string) {
  if x is i32 { print(x + 1) } else { print(x) }
}
show(3)
show("s")
`;

// A record literal adopted into an alias's arm: the record is the alias, not the arm.
const ARM = `type Shape = {r: i32} | {s: i32}
function area(sh: Shape): i32 {
  if sh is {r: i32} { return sh.r }
  return 0
}
const a: Shape = { r: 2 }
print(area(a))
`;

// A list literal's inferred union element.
const ELEM = `const xs = [1, "two"]
for x in xs { print(x) }
`;

// A map read spelled `m.get(k)`, which a rewrite mints as `m[k]` after check, beside the direct
// spelling: the minted read takes the record of the call it was made from.
const MAPGET = `const m: Map<string, i32> = Map()
m.set("k", 3)
const a: i32 | null = m.get("k")
const b: i32 | null = m["k"]
if a != null { print(a) }
if b != null { print(b) }
`;

// A `??` whose sides join apart: the read on its left is boxed into the join, which no
// delivery names when the `??` is an argument of `print`.
const COAL = `const l: (i32 | null)[] = [null, 4]
const big: i64 = 5000000000
print(l[0] ?? big)
const v: i32 | i64 = l[1] ?? big
print(v)
`;

// A call through a set of functions whose results differ: each member's call is boxed into the
// call's joined result.
const SETCALL = `function twice(s) { return s + s }
function lenOf(s) { return s.length }
for g in [twice, lenOf] { print(g("abc")) }
`;

// A loop's `break` values, delivered to a union binding through the loop's exits.
const BRK = `function pick(n: i32): i32 | string {
  let i = 0
  const v: i32 | string = while true {
    i = i + 1
    if i == n { break i }
    if i > 5 { break "none" }
  }
  return v
}
print(pick(3))
print(pick(9))
`;

// A bare `as`'s miss, the enclosing function's `null`: minted by the cast's check and delivered to
// the function's result, at a numeric operand, a type parameter pinned at a number and at none,
// and a hole parameter's call parked until its pin.
const AS = `function widen(d: f64): i32 | null { return d as i32 }
function pin<T>(u: T): i32 | null { u as i32 }
function add(a, b) { return a + b }
function viaHole(g): i32 | null {
  const v = g(1.5, 2.5) as i32
  return v
}
print(widen(2.0) ?? -1)
print(widen(2.5) ?? -1)
print(pin(3.0) ?? -1)
print(pin("s") ?? -1)
print(viaHole(add) ?? -1)
`;

// A record literal's omitted nullable field, in a tagged union's arm and in an empty `{}`: the
// `null` it holds is minted where the literal's check completes it and delivered to the field.
const OMIT = `type U = { kind: "a", q: i32 | null } | { kind: "b" }
type N = { n: i32 | null, x: f64 | null }
function show(u: U) {
  if u.kind == "a" { print(u.q == null) } else { print(0) }
}
function showN(m: N) { print(m.n ?? 7) }
const a: U = { kind: "a" }
show(a)
show({ kind: "a", q: 3 })
showN({})
`;

// A written capture's narrowed read, through its cell: `v[0]` is the name read respelled, and
// takes the read's record.
const CAP = `function show(u: boolean | i32) {
  if u is boolean { print(u) } else { print(u + 1) }
}
function run() {
  let v: boolean | string = "a"
  const k = () => { v = false }
  k()
  if v is boolean { show(v) }
}
run()
`;

// A `?.` read over a record that is a declared union's arm, printed, handed on and bound, and a
// guarded `m?.get(k)`: the parts the rewrite puts in each read's place are minted by its check.
const OPT = `type C = { r: i32 }
type S = { s: i32 }
type U = C | S
function show(v: i32 | null) { print(v ?? -1) }
function bound(p: C | null) {
  const r = p?.r
  print(r ?? 100)
}
const b: C | null = { r: 7 }
print(b?.r)
show(b?.r)
bound(b)
const m: {[string]: i32} | null = Map()
show(m?.get("k"))
`;

// An optional call `p?.f()` delivered as it is, into a `??` and into a binding: the call is its
// guard's non-null arm and takes the call's own join.
const OPTCALL = `type P = { n: i32 }
function twice(self: P) { self.n * 2 }
const p: P | null = { n: 21 }
print(p?.twice() ?? 0)
const r = p?.twice()
print(r ?? -1)
`;

// A function's tail `if` ending in a field write yields the write's value or `null`, and a
// loop's value is a labelled block's: each read the rewrite yields in their place takes the
// value's record.
const TAIL = `type C = { n: i32 }
function bump(c: C, go: boolean) {
  if go { c.n = c.n + 1 }
}
const inFor = (n: i32) => for i in 0 until 3 { if i == n { break (@B { i * 10 }) } }
const c: C = { n: 1 }
print(bump(c, true) ?? -1)
print(bump(c, false) ?? -1)
print(inFor(2) ?? -5)
`;

// A list literal with a spread infers a union element: each element beside the spread is
// delivered to it.
const SPREAD = `function run(xs: (boolean | null)[], ys: i32[]) {
  const u = [...xs, 5]
  print(u.length)
  const v = [...ys, "s"]
  print(v.length)
}
run([true, null], [1])
`;

// A value whose own join is a union, delivered where nothing boxes it: a generic's tail value
// `if` at an instance whose arms join apart, and a loop's exits under a `??` that unwraps it.
const OWNJOIN = `function lit<A, B>(k: i32, a: A, b: B) {
  if k == 0 { return a }
  if k == 1 { b } else { 5 }
}
const z: i64 = 9
print(lit(0, z, z))
function t(n: i32) {
  const r = (for k in [1, 2] { if k == n { break k } }) ?? 99
  print(r)
}
t(1)
`;

// An annotated function's tail value `if` whose number arms join apart is boxed whole into the
// declared result.
const ANNTAIL = `function pick(k: i32): i32 | f64 {
  if k == 0 { 3 } else { 2.5 }
}
print(pick(1))
`;

// A field write into a binding stored at a container's wider build (D14810): the value is boxed
// at the field of the record it is stored as, not of its checked type.
const STOREWRITE = `type J = { f: i32 | null }
function mk() { { f: 4 } }
function back(r) { return r }
const wideJ: J = mk()
const xs = [mk()]
const b = back(xs[0])
b.f = 9
print(xs[0].f)
print(wideJ.f ?? 0)
`;

// A field write into a parameter whose every call hands it a value built at a wider record: an
// annotated one instanced at the build, and a hole one.
const PARAMWRITE = `type J = { f: i32 | null }
function mk() { { f: 4 } }
function w(a: { f: i32 }) {
  a.f = 9
  a.f
}
function h(a) {
  a.f = 7
  a.f
}
const d: J = mk()
print(w(mk()))
print(h(mk()))
print(d.f ?? 0)
`;

// A literal stored into a map before the store that decides the map's wider build: it is built at
// that build, so its field is boxed at the build's field.
const STORELIT = `type J = { f: i32 | null }
function mk() { { f: 4 } }
const wideJ: J = mk()
const m = Map()
m.set("b", { f: 5 })
m.set("a", mk())
const x = m.get("b")
if x != null { print(x.f + 1) }
print(wideJ.f ?? 0)
`;

Deno.test({
  name: "box-dst shadow: an argument at a union parameter agrees",
  ignore,
  fn: () => expectRows("arg", ARG, DROP_NONE, "nested agree=2; table=2"),
});

Deno.test({
  name:
    "box-dst shadow: a literal adopted into an arm records the alias, not the arm",
  ignore,
  fn: () =>
    expectRows(
      "arm",
      ARM,
      DROP_NONE,
      "nested agree=2; nested value already a box=1; table=3",
    ),
});

Deno.test({
  name: "box-dst shadow: an inferred union element agrees",
  ignore,
  fn: () => expectRows("elem", ELEM, DROP_NONE, "nested agree=4; table=4"),
});

Deno.test({
  name: "box-dst shadow: a ?? operand takes the join's union",
  ignore,
  fn: () =>
    expectRows(
      "coal",
      COAL,
      DROP_NONE,
      "nested agree=6; nested table=2; nested value already a box=1; table=5",
    ),
});

Deno.test({
  name: "box-dst shadow: a set member's call takes the call's joined union",
  ignore,
  fn: () =>
    expectRows("setcall", SETCALL, DROP_NONE, "nested agree=2; table=2"),
});

Deno.test({
  name: "box-dst shadow: a break value takes its loop's union",
  ignore,
  fn: () =>
    expectRows(
      "brk",
      BRK,
      DROP_NONE,
      "floor: never returns=1; nested agree=2; nested value already a box=2; nested value never returns=1; table=4",
    ),
});

Deno.test({
  name: "box-dst shadow: a minted map read takes its call's record",
  ignore,
  fn: () => expectRows("mapget", MAPGET, DROP_NONE, "nested agree=2; table=2"),
});

Deno.test({
  name: "box-dst shadow: a bare `as`'s miss null takes the function's result",
  ignore,
  fn: () =>
    expectRows(
      "as",
      AS,
      DROP_NONE,
      "floor: already a box=5; nested agree=8; nested table=3; nested value already a box=5; table=5",
    ),
});

Deno.test({
  name: "box-dst shadow: an omitted nullable field's null takes the field's type",
  ignore,
  fn: () =>
    expectRows(
      "omit",
      OMIT,
      DROP_NONE,
      "nested agree=6; nested table=3; nested value already a box=1; table=4",
    ),
});

Deno.test({
  name: "box-dst shadow: a captured binding's cell read takes the read's record",
  ignore,
  fn: () => expectRows("cap", CAP, DROP_NONE, "nested agree=3; table=3"),
});

Deno.test({
  name: "box-dst shadow: a `?.` read's guard arms take the read's join or delivery",
  ignore,
  fn: () =>
    expectRows(
      "opt",
      OPT,
      DROP_NONE,
      "floor: already a box=1; nested agree=8; nested table=6; nested value already a box=3; table=4",
    ),
});

Deno.test({
  name: "box-dst shadow: an optional call's guarded call takes the call's join",
  ignore,
  fn: () =>
    expectRows(
      "optcall",
      OPTCALL,
      DROP_NONE,
      "nested agree=4; nested table=4; nested value already a box=2; table=2",
    ),
});

Deno.test({
  name: "box-dst shadow: a spilled tail's read takes the value's record",
  ignore,
  fn: () =>
    expectRows(
      "tail",
      TAIL,
      DROP_NONE,
      "floor: already a box=3; nested agree=4; nested floor: never returns=1; nested table=1; nested value already a box=4; nested value never returns=1; table=4",
    ),
});

Deno.test({
  name: "box-dst shadow: an element beside a spread takes the list's element union",
  ignore,
  fn: () =>
    expectRows("spread", SPREAD, DROP_NONE, "nested agree=2; table=2"),
});

Deno.test({
  name: "box-dst shadow: a tail `if` and a loop's exits take their own join",
  ignore,
  fn: () =>
    expectRows("ownjoin", OWNJOIN, DROP_NONE, "nested agree=8; table=8"),
});

Deno.test({
  name: "box-dst shadow: an annotated tail `if` takes the declared result",
  ignore,
  fn: () =>
    expectRows("anntail", ANNTAIL, DROP_NONE, "nested agree=1; table=1"),
});

Deno.test({
  name: "box-dst shadow: a field write takes the receiver's storage",
  ignore,
  fn: () =>
    expectRows("storewrite", STOREWRITE, DROP_NONE, "nested agree=2; table=2"),
});

Deno.test({
  name: "box-dst shadow: a parameter's field write takes its calls' storage",
  ignore,
  fn: () =>
    expectRows("paramwrite", PARAMWRITE, DROP_NONE, "nested agree=3; table=3"),
});

Deno.test({
  name: "box-dst shadow: a stored literal's field takes the container's build",
  ignore,
  fn: () =>
    expectRows("storelit", STORELIT, DROP_NONE, "nested agree=2; table=2"),
});

Deno.test({
  name:
    "box-dst shadow: reading no record turns every agreement into a missing row",
  ignore,
  fn: () =>
    expectRows("arg", ARG, DROP_READ, "nested no record=2; table=2"),
});

Deno.test({
  name:
    "box-dst shadow: reading another type turns every agreement into a disagreement",
  ignore,
  fn: () =>
    expectRows("arg", ARG, DROP_AS_OTHER, "nested disagree=2; table=2"),
});

// A generic `a ?? 5` at a list pin is the join `i32[] | i32` (D10600): the instance boxes its
// left operand into that, though the instance's own result is `i32[]`.
const COALPIN = `function tail<T>(a: T) { a ?? 5 }
const u = [1, 2]
const v1 = tail(u)
if v1 is i32[] { print(v1.length) } else { print(v1) }
`;

Deno.test({
  name: "box-dst shadow: a generic `??` at an instance takes its pin's join",
  ignore,
  fn: () =>
    expectRows(
      "coalpin",
      COALPIN,
      DROP_NONE,
      "nested agree=1; nested value already a box=1; table=2",
    ),
});

// A map read narrowed by an `is` test, coalesced with a default its values hold: the read is one
// fused lookup built at the map's value union, so the default is boxed there.
const MAPREAD = `function pickS(n: i32): string | i32 | null {
  if n > 0 { return "s" }
  return null
}
function run(n: i32) {
  const m: { [string]: string | i32 | null } = Map()
  m["k"] = pickS(n)
  if !(m["k"] is i32) { print(m["k"] ?? "N") }
}
run(1)
run(0)
`;

Deno.test({
  name: "box-dst shadow: a fused map read's default takes the map's value union",
  ignore,
  fn: () =>
    expectRows(
      "mapread",
      MAPREAD,
      DROP_NONE,
      "nested agree=3; nested value already a box=1; table=4",
    ),
});

// A record literal with a null field inside a list literal is re-typed to its destination, and
// its fields' box destinations are recorded beside that re-type (D14978). The last three spellings
// already agreed through another producer.
const NULL_HOLE_LIST_LITS: [string, string, string][] = [
  ["an inferred function's local list", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
type GL = { g: Circle[] }
function mk() {
  const lv1 = [{ r: null }]
  return lv1
}
const xs: Circle[] = mk()
print(xs[0].r ?? 5)
`, "nested agree=1; table=1"],
  ["an annotated binding", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
const xs: Circle[] = [{ r: null }]
print(xs[0].r ?? 5)
`, "nested agree=1; table=1"],
  ["a function-local binding", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
function mk(): i32 {
  const lv1: Circle[] = [{ r: null }]
  return lv1[0].r ?? 5
}
print(mk())
`, "nested agree=1; table=1"],
  ["a declared list return", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
function mk(): Circle[] {
  return [{ r: null }]
}
print(mk()[0].r ?? 5)
`, "nested agree=1; table=1"],
  ["a list re-delivered from a binding", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
const lv1: Circle[] = [{ r: null }]
const xs: Circle[] = lv1
print(xs[0].r ?? 5)
`, "nested agree=1; table=1"],
  ["a map value", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
type GL = { g: Circle[] }
const m: Map<string, Circle[]> = Map()
m.set("a", [{ r: null }])
print((m.get("a") ?? [])[0].r ?? 5)
`, "nested agree=1; table=1"],
  ["a nested list", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
type GL = { g: Circle[] }
const xs: Circle[][] = [[{ r: null }]]
print(xs[0][0].r ?? 5)
`, "nested agree=1; table=1"],
  ["an assigned let", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
type GL = { g: Circle[] }
let xs: Circle[] = []
xs = [{ r: null }]
print(xs[0].r ?? 5)
`, "nested agree=1; table=1"],
  ["an argument", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
type GL = { g: Circle[] }
function f(xs: Circle[]): i32 { xs[0].r ?? 5 }
print(f([{ r: null }]))
`, "nested agree=1; table=1"],
  ["a union-element list", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
type GL = { g: Circle[] }
const xs: Shape[] = [{ r: null }]
const c = xs[0]
if c is Circle { print(c.r ?? 5) }
`, "nested agree=2; nested table=1; nested value already a box=1; table=2"],
  ["a record field", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
type GL = { g: Circle[] }
const q: GL = { g: [{ r: null }] }
print(q.g[0].r ?? 5)
`, "nested agree=1; table=1"],
  ["a bare record binding", `type Shape = Circle | Sq
type Sq = { s: i32 }
type Circle = { r: i32 | null }
function mk(): Circle {
  const c: Circle = { r: null }
  return c
}
print(mk().r ?? 5)
`, "nested agree=1; table=1"],
];

for (const [what, src, want] of NULL_HOLE_LIST_LITS) {
  Deno.test({
    name: `box-dst shadow: a null-field record in a list literal at ${what}`,
    ignore,
    fn: () => expectRows("nullholelist", src, DROP_NONE, want),
  });
}

// A numeric widening at an argument and the identity pair at the return: the table serves both at the checker's pair, and both controls
// turn it into the site's own floor.
const NUM_SRC = `function w(x: i64): i64 { x }
const a: i32 = 3
print(w(a))
`;
for (
  const [drop, want] of [
    [DROP_NONE, "num table=2"],
    [DROP_READ, "num floor: no record=2"],
    [DROP_AS_OTHER, "num floor: dst differs=2"],
  ] as const
) {
  Deno.test({
    name: `box-dst shadow: an i32 argument widened to i64 (drop ${drop})`,
    ignore,
    fn: () => {
      const { rows } = shadow(NUM_SRC, drop, true);
      const got = show(rows);
      if (got !== want) {
        throw new Error(`num (drop ${drop}):\n  want: ${want}\n  got:  ${got}`);
      }
    },
  });
}

// An `f64` element of a list literal delivered at an `i32 | f64` row: a later stamp at the union
// must not hide the element's one-kind pair, so the table still serves it.
const NUM_HIDDEN = `function g() {
  const c: (i32 | f64)[][] = [[1, 2.5]]
  c[0]
}
print(g().length)
`;
Deno.test({
  name: "box-dst shadow: a one-kind numeric pair a later union stamp would hide",
  ignore,
  fn: () => {
    const { rc, rows } = shadow(NUM_HIDDEN, DROP_NONE, true);
    if (rc !== 0) throw new Error(`num hidden: want compileSrc rc 0, got ${rc}`);
    const got = show(rows);
    const want = "num table=1";
    if (got !== want) {
      throw new Error(`num hidden:\n  want: ${want}\n  got:  ${got}`);
    }
  },
});
