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
    // Unarmed, the shipped claim records only its `claimed` rows (a function's, the start's);
    // nothing else, and no fallback.
    const other = [...plain.rows.keys()].filter((k) => k !== "claimed" && k !== "claimed start");
    if (other.length !== 0) throw new Error(`want only claimed rows unarmed, got ${other.join(", ")}`);
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

// The element-read rows' control: a list read banks a row of its own (kind 6), and dropping the
// lowering's must turn the match into a span mismatch.
Deno.test({
  name: "ir shadow: the dual emit's control 5 reports a list read's missing row",
  ignore,
  fn: () => {
    const src = `function at(xs: i32[], i: i32): i32 { return xs[i] + 1 }\nprint(at([1, 2, 3], 1))\n`;
    const ok = run(src, true);
    if ((ok.rows.get("matched") ?? 0) !== 1) throw new Error(`want the read matched, got ${JSON.stringify([...ok.rows])}`);
    const { rows } = run(src, true, 5);
    const got = [...rows].filter(([k]) => k.startsWith("mismatch spans")).reduce((n, [, c]) => n + c, 0);
    if (got !== 1 || (rows.get("matched") ?? 0) !== 0) {
      throw new Error(`want one "mismatch spans", got ${JSON.stringify([...rows])}`);
    }
  },
});

// Outside the set: a string coalesce whose default is no literal, a closure parameter and an
// `as?` conversion each leave their function uncovered, named.
Deno.test({
  name: "ir shadow: a construct outside the set leaves its function uncovered, by reason",
  ignore,
  fn: () => {
    // A conversion by `as?`, whose result is a box, is outside the set too.
    const src = `function greet(s: string | null, d: string): string { return s ?? d }
function ap(f: (x: i32) => i32): i32 { return f(4) }
function cv(x: f64): i32 | null { return x as? i32 }
print(greet("a", "!"))
print(ap((x: i32) => x + 1))
print(cv(3.0))
`;
    const { rc, rows } = run(src, true);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    if (fails.length > 0) throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    for (const why of ["expression as"]) {
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
// an atom result and its literals (C2i); string `.slice` and `.cpLen` (C2j); a list push (C2k);
// an atom `!=` against a literal and between two atoms, each `i32.eq` then `i32.eqz` (N2b-1);
// a `.pop()` statement past the list's end (N2b-2a); an atom of id 0 and a `null` into its
// `K | null`, and a call retagged into it in tail form, as legacy tail-calls it (N2b-2c-1); a
// `K | null` holding atom id 0 tested `!= null`, `null ==` and `== "a"` (N2b-2c-1b); a global
// map read with an i32 default through legacy's helper, by an i32 key, a built string key, and a
// key holding another such read (M1); a `print` of a built string, of f64 values that are `-0`,
// `NaN` and `2e+300`, and of an f32, an i64, a boolean and an i32 (P1); the four bitcasts, f64
// and f32 float intrinsics, and i32 and i64 integer intrinsics (N3); a `string | null` built from
// `null` and from a string, passed through, assigned, and coalesced with a string literal to a
// string and inside a `print` (N2b-2c-2a); a `string | null` tested `== null`, `!= null` and
// `null !=`, and printed (N2b-2c-2b); list literals of i32s, of f64s with an i32 element widened,
// of i64s, f32s, strings and booleans, and an empty one (A1); a plain walk over an i32 list and a
// string list, and one whose body holds a loop with its own `break` (F1); a string from one code
// point and from a local code-point list (S1); a box's `is` test of a record variant, plain and
// told apart by a literal field (B1); a narrowed box's field read, of an i32 and of a string
// (B2); a struct parameter's field reads, a list of records' length, and a global record's list
// field's length (B3); a narrowed box read whole at its variant, and a `string | null`
// parameter read at its string (narrowed read); a value `if` bound and one widened into an
// `f64` binding (B4a).
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
  `function note(s: string) {\n  const xs = [[s]]\n  print(xs[0][0])\n}\nfunction tw(s: string) { return note(s + "!") }\ntw("a")\n`,
  `type K = "p" | "q"\nfunction pick(c: boolean): K {\n  if c { return "p" }\n  return "q"\n}\nprint(pick(true) == "p")\n`,
  `function tl(s: string, n: i32): string { return s.slice(n, s.length) }\nprint(tl("hello", 2))\n`,
  `function cps(s: string): i32 { return s.cpLen() + 1 }\nprint(cps("ab"))\n`,
  `let gs: i32[] = []\nfunction add(x: i32): i32 {\n  gs.push(x)\n  return gs.push(x + 1)\n}\nprint(add(1))\n`,
  `let ns: string[] = ["a", "b"]\nfunction put(i: i32, s: string) { ns[i] = s + "!" }\nput(1, "z")\nprint(ns[1])\n`,
  `let fs: f64[] = [0.0, 0.0]\nfunction wid(i: i32, x: i32): f64 {\n  fs[i] = x\n  const y: f64 = x\n  return y\n}\nprint(wid(1, 3))\n`,
  `function pick(c: boolean, x: i64): i64 | null {\n  if c { return x }\n  return x + 1\n}\nprint(pick(true, 3) ?? 0)\n`,
  `function pn(c: boolean): i32 | null {\n  if c { return 3 }\n  return null\n}\nprint(pn(false) ?? 7)\n`,
  `function pf(c: boolean): f32 | null {\n  if c { return null }\n  return 1.5\n}\nprint(pf(false) ?? 0.0)\n`,
  `type K = "a" | "b"\nfunction nb(k: K): boolean { return "b" != k }\nconst ks: K[] = ["a", "b"]\nprint(nb(ks[0]))\n`,
  `type K = "a" | "b"\nfunction df(x: K, y: K): boolean { return x != y }\nconst ks: K[] = ["a", "b"]\nprint(df(ks[0], ks[1]))\n`,
  `let gs: f64[] = [1.5, 2.5]\nfunction d() { gs.pop() }\nd()\nd()\nd()\nprint(gs.length)\n`,
  `type K = "a" | "b"\nfunction pick(c: i32, k: K): K | null {\n  if c > 0 { return k }\n  return null\n}\nconst ks: K[] = ["a", "b"]\nprint(pick(1, ks[0]) == "a")\n`,
  `type K = "a" | "b"\nfunction k0(): K {\n  const xs: K[] = ["a"]\n  return xs[0]\n}\nfunction pk(c: boolean): K | null {\n  if c { return null }\n  return k0()\n}\nprint(pk(false) == "a")\n`,
  `type K = "a" | "b"\nfunction ne(x: K | null): boolean { return x != null }\nconst ks: (K | null)[] = ["a", null]\nprint(ne(ks[0]))\n`,
  `type K = "a" | "b"\nfunction nf(x: K | null): boolean { return null == x }\nconst ks: (K | null)[] = ["a", null]\nprint(nf(ks[0]))\n`,
  `type K = "a" | "b"\nfunction ea(x: K | null): boolean { return x == "a" }\nconst ks: (K | null)[] = ["a", null]\nprint(ea(ks[0]))\n`,
  `let ix: {[i32]: i32} = Map()\nfunction look(k: i32): i32 { return ix[k] ?? -1 }\nix[3] = 4\nprint(look(3) + look(5))\n`,
  `let tys: {[string]: i32} = Map()\nfunction ty(s: string): i32 { return tys[s + "!"] ?? 0 }\ntys["a!"] = 2\nprint(ty("a") + ty("b"))\n`,
  `let ix: {[i32]: i32} = Map()\nfunction hop(k: i32): i32 { return ix[(ix[k] ?? 0) + 1] ?? -1 }\nix[3] = 4\nix[5] = 9\nprint(hop(3) + hop(7))\n`,
  `function ps(s: string) { print(s + "!") }\nps("a")\n`,
  `function pf(x: f64) {\n  print(-x)\n  print(x / x)\n  print(x * 1.0e300 + 2.0e300)\n}\npf(0.0)\n`,
  `function pg(x: f32) { print(x + 1.5) }\npg(2.0)\n`,
  `function pl(x: i64) { print(x * 3) }\npl(5)\n`,
  `function pb(x: i32) { print(x > 2) }\npb(3)\n`,
  `function pv(x: i32) {\n  print(x + 1)\n  return\n}\npv(3)\n`,
  `function fb(x: i64): f64 { return f64fromBits(x) }\nprint(fb(f64bits(1.5)))\n`,
  `function bf(x: f64): i64 { return f64bits(x * 2.0) }\nprint(bf(-0.0))\n`,
  `function g32(x: f32): i32 { return f32bits(x) }\nprint(g32(1.0))\n`,
  `function h32(x: i32): f32 { return f32fromBits(x) }\nprint(h32(1065353216))\n`,
  `function sq(x: f64, y: f64): f64 { return min(sqrt(x), copysign(y, -1.0)) }\nprint(sq(9.0, 2.0))\n`,
  `function fl(x: f32): f32 { return floor(x) }\nconst h: f32 = 2.5\nprint(fl(h))\n`,
  `function cz(x: i32): i32 { return clz(x) + rotl(x, 3) }\nprint(cz(16))\n`,
  `function dz(x: i64): i64 { return divU(x, 3) }\nprint(dz(-1))\n`,
  `function nm(c: boolean, s: string): string | null {\n  if c { return null }\n  return s + "!"\n}\nprint(nm(false, "a") ?? "z")\n`,
  `function id(x: string | null): string | null { return x }\nconst xs: (string | null)[] = ["a", null]\nprint(id(xs[0]) ?? "z")\n`,
  `function lc(s: string): string | null {\n  let t: string | null = null\n  if s.length > 0 { t = s }\n  return t\n}\nprint(lc("q") ?? "z")\n`,
  `function dn(x: string | null): string { return x ?? "n" }\nconst xs: (string | null)[] = [null, "a"]\nprint(dn(xs[0]) + dn(xs[1]))\n`,
  `function pd(x: string | null) { print(x ?? "n") }\nconst xs: (string | null)[] = [null, "a"]\npd(xs[0])\npd(xs[1])\n`,
  `function isn(x: string | null): boolean { return x == null }\nconst xs: (string | null)[] = [null, "a"]\nprint(isn(xs[0]))\nprint(isn(xs[1]))\n`,
  `function has(x: string | null): boolean { return x != null }\nconst xs: (string | null)[] = [null, "a"]\nprint(has(xs[0]))\nprint(has(xs[1]))\n`,
  `function hr(x: string | null): boolean { return null != x }\nconst xs: (string | null)[] = [null, "a"]\nprint(hr(xs[1]))\n`,
  `function pn(x: string | null) { print(x) }\nconst xs: (string | null)[] = [null, "a"]\npn(xs[0])\npn(xs[1])\n`,
  `function li(x: i32): i32[] { return [x, x + 1, 3] }\nconst xs = li(4)\nprint(xs[0] + xs[1] + xs[2] + xs.length)\n`,
  `function lf(x: i32, y: f64): f64[] { return [x, y] }\nconst xs = lf(2, 0.5)\nprint(xs[0] + xs[1])\n`,
  `function ll(x: i64): i64[] { return [x, x * 2] }\nconst xs = ll(5)\nprint(xs[1])\n`,
  `function lg(x: f32): f32[] { return [x] }\nconst h: f32 = 1.5\nprint(lg(h)[0])\n`,
  `function ls(s: string): string[] { return [s, s + "!"] }\nprint(ls("a")[1])\n`,
  `function lb(x: i32): boolean[] { return [x > 1, x > 5] }\nprint(lb(3)[0])\n`,
  `function le(): i32[] { return [] }\nprint(le().length)\n`,
  `function sum(xs: i32[]): i32 {\n  let t = 0\n  for x in xs {\n    print(x)\n    t = t + x\n  }\n  return t\n}\nprint(sum([1, 2, 3]))\n`,
  `function all(xs: string[]): i32 {\n  let n = 0\n  for s in xs {\n    print(s + "!")\n    n = n + s.length\n  }\n  return n\n}\nprint(all(["ab", "c"]))\n`,
  `function inner(xs: i32[]): i32 {\n  let t = 0\n  for x in xs {\n    let k = 0\n    while k < x {\n      if k > 1 { break }\n      k = k + 1\n    }\n    print(k)\n    t = t + k\n  }\n  return t\n}\nprint(inner([1, 5]))\n`,
  `function cs(s: string): i32 {\n  let n = 0\n  for c in s {\n    print(c)\n    n = n + c\n  }\n  return n\n}\nprint(cs("h\u00e9llo"))\n`,
  `function one(c: i32): string { return fromCodePoint(c) }\nprint(one(233))\n`,
  `function many(n: i32): string {\n  const xs: i32[] = [104, 233, n]\n  return fromCodePoints(xs)\n}\nprint(many(108))\n`,
  `type P = { x: i32 }\ntype Q = { y: string }\nfunction isP(u: P | Q): boolean { return u is P }\nprint(isP({ x: 1 }))\nprint(isP({ y: "a" }))\n`,
  `type Lit = { kind: "lit", v: i32 }\ntype Add = { kind: "add", l: i32, r: i32 }\nfunction isLit(e: Lit | Add): boolean { return e is Lit }\nprint(isLit({ kind: "lit", v: 1 }))\n`,
  `type P = { x: i32 }\ntype Q = { y: string }\nfunction px(u: P | Q): i32 {\n  if u is P { return u.x }\n  return 0\n}\nprint(px({ x: 4 }))\nprint(px({ y: "a" }))\n`,
  `type P = { x: i32, s: string }\ntype Q = { y: string }\nfunction ps(u: P | Q): string {\n  if u is P { return u.s }\n  return u.y\n}\nprint(ps({ x: 4, s: "p" }))\nprint(ps({ y: "q" }))\n`,
  `type P = { x: i32, y: i32 }\nfunction sum(p: P): i32 { return p.x + p.y }\nprint(sum({ x: 1, y: 2 }))\n`,
  `type P = { x: i32 }\nfunction n(ps: P[]): i32 { return ps.length }\nprint(n([{ x: 1 }, { x: 2 }]))\n`,
  `type S = { xs: i32[], name: string }\nconst s: S = { xs: [1, 2, 3], name: "s" }\nfunction cnt(): i32 { return s.xs.length }\nprint(cnt())\n`,
  `type P = { x: i32 }\ntype Q = { y: string }\nfunction viaP(u: P | Q): i32 {\n  if u is P {\n    const p: P = u\n    return p.x\n  }\n  return 0\n}\nprint(viaP({ x: 4 }))\nprint(viaP({ y: "a" }))\n`,
  `function orEmpty(s: string | null): string {\n  if s == null { return "" }\n  return s\n}\nprint(orEmpty("a"))\nprint(orEmpty(null))\n`,
  `function f(c: boolean, x: i32): i32 {\n  const y = if c { x + 1 } else { 0 }\n  return y * 2\n}\nprint(f(true, 2))\nprint(f(false, 2))\n`,
  `function w(c: boolean, x: i32): f64 {\n  const y: f64 = if c { x } else { 2.5 }\n  return y\n}\nprint(w(true, 3))\n`,
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

// A code-point list that is no local is legacy's spill through a scratch slot: a named miss,
// never a byte mismatch.
Deno.test({
  name: "ir shadow: a spilled code-point list is a named miss",
  ignore,
  fn: () => {
    const src = `function sp(n: i32): string { return fromCodePoints([n, 33]) }\nprint(sp(111))\n`;
    const { rows } = run(src, true);
    if (rows.get("uncovered code point list spill") !== 1) {
      throw new Error(`want one "uncovered code point list spill" row, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A `[]` binding its pushes follow is legacy's list reserve, built at its final size through
// locals, and a list literal whose elements box into a union is a ref list legacy coerces: each a
// named miss, never a byte mismatch.
Deno.test({
  name: "ir shadow: a reserved list binding and a union-element list literal are named misses",
  ignore,
  fn: () => {
    const src = `function rv(x: i32): i32 {
  const a: i32[] = []
  a.push(x)
  return a.length
}
function ln(x: i32): (i32 | string)[] { return [x, "s"] }
print(rv(2) + ln(2).length)
`;
    const { rows } = run(src, true);
    for (const want of ["uncovered declaration list reserve", "uncovered array ref"]) {
      if (rows.get(want) !== 1) throw new Error(`want one "${want}" row, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A nested list literal whose elements build as themselves is a plain ref list, built along
// `emitArrRef`'s shared decision and tail, and matches legacy's bytes.
Deno.test({
  name: "ir shadow: a plain nested list literal is covered and matched",
  ignore,
  fn: () => {
    const src = `function ln(x: i32): i32[][] { return [[x], [x, x]] }
print(ln(2)[1].length)
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 1 || rows.get("covered") !== 1) {
      throw new Error(`want the one function covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A short packed list literal builds along `emitArrU8`'s shared tail and matches legacy's bytes;
// an empty one returned at its destination is the self-compile's common spelling.
Deno.test({
  name: "ir shadow: a short u8 list literal is covered and matched",
  ignore,
  fn: () => {
    const src = `function e(): u8[] { return [] }
print(e().length)
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 1 || rows.get("covered") !== 1) {
      throw new Error(`want the one function covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// A walk's own `break` and `continue` branch to the frames legacy's loop opens, and a walk whose
// body is hoist-safe reads its header once and may unroll its body: all covered and matched.
Deno.test({
  name: "ir shadow: a walk's own branch and a hoisted walk are matched",
  ignore,
  fn: () => {
    const src = `function fb(xs: i32[]): i32 {
  for x in xs {
    print(x)
    if x > 1 { break }
  }
  return 0
}
function fc(xs: i32[]): i32 {
  for x in xs {
    if x > 1 { continue }
    print(x)
  }
  return 0
}
function fh(xs: i32[]): i32 {
  let t = 0
  for x in xs { t = t + x }
  return t
}
print(fb([1, 2, 3]) + fc([1, 2]) + fh([4]))
`;
    const { rows } = run(src, true);
    if (rows.get("matched") !== 3 || rows.get("covered") !== 3) {
      throw new Error(`want the three walks covered and matched, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// An integer `abs` is legacy's staged `select`, not one instruction: a named miss, never a
// byte mismatch.
Deno.test({
  name: "ir shadow: an integer abs is a named miss",
  ignore,
  fn: () => {
    const { rows } = run(`function ab(x: i32): i32 { return abs(x) }\nprint(ab(-4))\n`, true);
    const want = "uncovered intrinsic intAbs";
    if (rows.get(want) !== 1) throw new Error(`want one "${want}" row, got ${JSON.stringify([...rows])}`);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// Legacy writes a short-circuit argument's `if` in place, above the arguments before it, whether
// they are locals, globals or temps: the builder names that rather than lowering it out of order.
Deno.test({
  name: "ir shadow: a short-circuit argument after another is a named miss, not a fallback",
  ignore,
  fn: () => {
    const src = `let g: i32[] = [1]
function pair(a: i32, b: boolean): i32 { return if b { a } else { 0 - a } }
function h(a: i32[], b: boolean): i32 { return a.length + pair(1, b) }
function k(a: i32, c: boolean, d: boolean): i32 {
  const r = pair(a, c && d)
  return r
}
function f(x: boolean, y: boolean): i32 { return h(g, x || y) }
function f2(x: boolean, y: boolean): i32 { return h([1], x && y) }
print(k(2, true, false) + f(true, false) + f2(false, true))
`;
    const { rows } = run(src, true);
    const want = "uncovered short-circuit argument after another";
    if (rows.get(want) !== 3) throw new Error(`want three "${want}" rows, got ${JSON.stringify([...rows])}`);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// Every node that writes a receiver or an earlier operand before a later one names a valued `if`
// in that later operand; one in the first operand written stays covered.
Deno.test({
  name: "ir shadow: a short-circuit operand below a node's lead is a named miss, not a fallback",
  ignore,
  fn: () => {
    const src = `let m: Map<i32, boolean> = Map()
let g: boolean[] = [true]
function st(a: boolean, b: boolean, x: i32): boolean {
  const xs: boolean[] = [false, false]
  xs[x] = a && b
  return xs[x]
}
function stIx(a: boolean, x: i32): i32 {
  const xs: i32[] = [0, 0]
  xs[if a { 0 } else { 1 }] = x
  return xs[0]
}
function bin(a: boolean, x: i32): i32 { return x + (if a { 1 } else { 2 }) }
function eq(a: boolean, b: boolean): boolean { return a == (b || a) }
function meth(a: boolean, s: string): string { return s.slice(0, if a { 1 } else { 2 }) }
function intr(a: boolean, x: f64): f64 { return max(x, if a { 1.0 } else { 2.0 }) }
function push(a: boolean, b: boolean): i32 {
  g.push(a && b)
  return g.length
}
function first(a: boolean, b: boolean, x: i32): i32 { return (if a && b { 1 } else { 2 }) + x }
m[1] = st(true, true, 0) || stIx(true, 5) > 0
print(bin(true, 1) + push(true, false) + first(true, true, 3))
print(eq(true, false))
print(meth(true, "hello"))
print(intr(true, 0.5))
`;
    const { rows } = run(src, true);
    const want: [string, number][] = [
      ["uncovered store short-circuit operand", 2],
      ["uncovered short-circuit right operand", 2],
      ["uncovered method short-circuit operand", 1],
      ["uncovered short-circuit argument after another", 1],
      ["uncovered push short-circuit operand", 1],
      ["start uncovered map store short-circuit operand", 1],
    ];
    for (const [k, n] of want) {
      if (rows.get(k) !== n) throw new Error(`want ${n} "${k}" rows, got ${JSON.stringify([...rows])}`);
    }
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    if (!(rows.get("matched")! >= 1)) throw new Error(`want \`first\` matched, got ${JSON.stringify([...rows])}`);
  },
});

// A block body's last statement is a statement: `f(-1)` runs past `put(9)` and returns `null`
// (prints 5). The IR once returned `put(9)`'s value there; it is a named miss until it writes
// the result's `null`.
Deno.test({
  name: "ir shadow: a block body that runs past its last statement is a named miss",
  ignore,
  fn: () => {
    const src = `function put(x: i32) { return x * 2 }
function f(b: i32) {
  if b >= 0 { return 0 }
  put(9)
}
print(f(-1) ?? 5)
`;
    const { rows } = run(src, true);
    const want = "uncovered block body falls off";
    if (rows.get(want) !== 1) throw new Error(`want one "${want}" row, got ${JSON.stringify([...rows])}`);
    if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
  },
});

// Only a `null` literal boxes with its value unread. A `null`-typed call has an effect that must
// run once, so a function returning one boxed stays uncovered (`return of a boxed call`, B3)
// rather than boxing unread.
Deno.test({
  name: "ir shadow: a null-typed call delivered into a box is never left unread",
  ignore,
  fn: () => {
    const src = `function mk(): null {
  print("effect")
  return null
}
function f(b: boolean): i32 | null {
  if b { return 1 }
  return mk()
}
print(f(false) ?? 5)
`;
    const { rows } = run(src, true);
    const want = "uncovered return of a boxed call";
    if (rows.get(want) !== 1) throw new Error(`want one "${want}" row, got ${JSON.stringify([...rows])}`);
    if ((rows.get("covered") ?? 0) !== 0) throw new Error(`want 0 covered, got ${JSON.stringify([...rows])}`);
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

// The shipped claim (`CLAIMED`, report-only mode 5): a covered function ships the IR's bytes, which
// match legacy's (armed, legacy always runs); a verifier failure on the claim path falls back to
// legacy and is counted, which the gate's `ir claims` row reds on.
Deno.test({
  name: "ir claim: the shipped claim emits legacy's bytes, and a broken claim falls back loudly",
  ignore,
  fn: () => {
    const shipped = run(COVERED, 5);
    if (shipped.rc !== 0) throw new Error(`want compileSrc rc 0, got ${shipped.rc}`);
    const n = shipped.rows.get("claimed") ?? 0;
    if (n < 6) throw new Error(`want at least 6 claimed, got ${JSON.stringify([...shipped.rows])}`);
    const fell = [...shipped.rows.keys()].filter((k) => k.startsWith("claim fell back"));
    if (fell.length > 0) throw new Error(`want no claim to fall back, got ${fell.join(", ")}`);
    const legacy = run(COVERED, 1);
    if (legacy.out.length !== shipped.out.length || legacy.out.some((b, i) => b !== shipped.out[i])) {
      throw new Error(`want the shipped claim byte-identical to legacy (${legacy.out.length} vs ${shipped.out.length} bytes)`);
    }
    const broken = run(COVERED, 5, 1);
    if ((broken.rows.get("claim fell back: verifier") ?? 0) < 1) {
      throw new Error(`want a verifier fallback under the control, got ${JSON.stringify([...broken.rows])}`);
    }
    if (broken.out.length !== legacy.out.length || broken.out.some((b, i) => b !== legacy.out[i])) {
      throw new Error(`want a fallen-back claim to ship legacy's bytes`);
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
    // Case 10 is a bounds check while the bounds rule is the uninstalled default (rule 8), and
    // case 11 a box whose immediate stands for a call (rule 2).
    const want = [0, 1, 2, 3, 4, 5, 6, 7, 5, 2, 8, 2];
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
    const want = "blockers coalesce string default";
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

// `emitExpr`'s generic pre-paths, each a named miss the builder takes at the node (G0): a const
// bound to a literal delivered to an atom, a function-tag leaf, a tagged call's dispatch, and a
// delivery `coerceKindAt` converts. Each program is the smallest the corpus has for its row.
const PRE_PATHS: [string, string][] = [
  [
    "atom hook",
    `type K = "a" | "b"\nconst ka = "a"\nfunction k(): K { return ka }\nprint(k())\n`,
  ],
  [
    "tag leaf",
    `function inc0(a) { return a + 1 }\nfunction dbl(a) { return a * 2 }\nfunction half(a) { return a / 2.0 }\nfunction pick(b: boolean) { if b { return [inc0] } return [dbl] }\nprint(pick(true)[0](3))\nprint(pick(false)[0](3))\n`,
  ],
  [
    "tag dispatch",
    `function inc0(a) { return a + 1 }\nfunction half(a) { return a / 2.0 }\nconst r = { fs: [inc0] }\nconst a = r.fs\nconst v: readonly ((x: i32) => i32 | f64)[] = r.fs\nprint(v[0](3))\n`,
  ],
  [
    "coercion",
    `type Box1 = {[string]: {r: string}}[]\ntype Circle = { r: string }\nfunction thru(x: {[string]: {r: string}}[]) { return x }\nconst _sp1: Box1 = []\nfunction outer() {\n  const lv1 = Map()\n  const c = [lv1]\n  function inner() {\n    const dd = thru(c)\n    const g0 = dd\n    if g0.length > 0 {\n      const g1 = (g0[0])["k0"] ?? { r: "" }\n      if (g1).r == "seven" { print(7) } else { print(0) }\n    } else { print(0) }\n  }\n  inner()\n}\nouter()\n`,
  ],
];
Deno.test({
  name:
    "ir shadow: a node emitExpr takes a generic pre-path for is a named miss",
  ignore,
  fn: () => {
    for (const [why, src] of PRE_PATHS) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`${why}: want compileSrc rc 0, got ${rc}`);
      const fails = failures(rows);
      if (fails.length > 0) {
        throw new Error(`${why}: want no failure, got:\n${fails.join("\n")}`);
      }
      if (!rows.has(`uncovered pre-path ${why}`)) {
        throw new Error(
          `${why}: want an "uncovered pre-path ${why}" row, got ${
            JSON.stringify([...rows])
          }`,
        );
      }
    }
  },
});

// The start body under the shadow (stage 1, S1a): a top-level statement, a global's plain
// initializer and a promoted global each build and match legacy's entry, counted under `start `
// rows; a start owing the string accumulator scan and a widened initializer are named misses.
const START_MATCHED = [
  `let i = 0\nwhile i < 3 { i = i + 1 }\nprint(i)\n`,
  `function sq(x: i32): i32 { return x * x }\nconst k = sq(3)\nprint(k + 1)\n`,
  `let n = 2\nn = n + 3\nprint(n)\n`,
];
Deno.test({
  name: "ir shadow: a start body inside the set is covered and matches legacy",
  ignore,
  fn: () => {
    for (const src of START_MATCHED) {
      const { rc, rows } = run(src, true);
      if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
      if ((rows.get("start covered") ?? 0) !== 1 || (rows.get("start matched") ?? 0) !== 1) {
        throw new Error(`want the start covered and matched, got ${JSON.stringify([...rows])}\n${src}`);
      }
      if (failures(rows).length > 0) throw new Error(`want no failure, got ${JSON.stringify([...rows])}`);
    }
  },
});
Deno.test({
  name: "ir shadow: a start owing the string accumulator, or widening an initializer, misses by name",
  ignore,
  fn: () => {
    const cases: [string, string][] = [
      [`let s = ""\nlet i = 0\nwhile i < 3 {\n  s = s + "x"\n  i = i + 1\n}\nprint(s)\n`, "string accumulator"],
      [`const w: f64 = 3\nprint(w)\n`, "global initializer widen"],
    ];
    for (const [src, why] of cases) {
      const { rows } = run(src, true);
      if (rows.get(`start uncovered ${why}`) !== 1) {
        throw new Error(`want one "start uncovered ${why}" row, got ${JSON.stringify([...rows])}`);
      }
    }
  },
});

// The start body's claim (`irClaimStart`, family `start`, stage 1 S1b): a start inside the set is
// claimed and ships legacy's bytes; under the verifier control the claim falls back to legacy,
// loudly. A start owing the string accumulator stays legacy's.
const START_CLAIMED = `function note(s: string, v: i32): i32 {
  print(s)
  return v
}
const a = note("a", 1)
let n = 2
while n < 5 { n = n + a }
print(n)
`;
Deno.test({
  name: "ir claim: a start body inside the set is claimed and ships legacy's bytes",
  ignore,
  fn: () => {
    const shipped = run(START_CLAIMED, 5);
    if (shipped.rc !== 0) throw new Error(`want compileSrc rc 0, got ${shipped.rc}`);
    if ((shipped.rows.get("claimed start") ?? 0) !== 1) {
      throw new Error(`want the start claimed, got ${JSON.stringify([...shipped.rows])}`);
    }
    const fell = [...shipped.rows.keys()].filter((k) => k.startsWith("claim fell back"));
    if (fell.length > 0) throw new Error(`want no claim to fall back, got ${fell.join(", ")}`);
    const legacy = run(START_CLAIMED, 1);
    if (legacy.out.length !== shipped.out.length || legacy.out.some((b, i) => b !== shipped.out[i])) {
      throw new Error(`want the claimed start byte-identical to legacy (${legacy.out.length} vs ${shipped.out.length} bytes)`);
    }
    const broken = run(START_CLAIMED, 5, 1);
    if ((broken.rows.get("claim fell back: verifier") ?? 0) < 1) {
      throw new Error(`want a verifier fallback under the control, got ${JSON.stringify([...broken.rows])}`);
    }
    if (broken.out.length !== legacy.out.length || broken.out.some((b, i) => b !== legacy.out[i])) {
      throw new Error(`want a fallen-back start claim to ship legacy's bytes`);
    }
    const acc = run(`let s = ""\nlet i = 0\nwhile i < 3 {\n  s = s + "x"\n  i = i + 1\n}\nprint(s)\n`, 5);
    if (acc.rows.has("claimed start")) {
      throw new Error(`want a start owing the string accumulator left to legacy, got ${JSON.stringify([...acc.rows])}`);
    }
  },
});
