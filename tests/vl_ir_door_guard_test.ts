// THE IR DOOR'S CONTEXT GUARD (`legacyContextLiveWhy`, ir-design-2026-11.md §10.2.1).
//
// The door at `emitArr` lowers a list literal as an IR fragment inside a legacy body. The guard
// names the legacy context such a fragment would read. TWO HALVES:
//
//   drops — a context the fragment cannot read leaves no `context live` row, and the probe's
//           fragment matches legacy byte for byte under it.
//   fires — a context it can read still misses, by name, until it becomes a door parameter.
//
//   push  — the push receiver's strict cast is dropped at the door because the shared tails a
//           fragment calls read the flag live; a whole-function push whose receiver unboxes a
//           list arm misses instead (`recvReadsListPayload`), since its receiver is read earlier.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the seed halves self-ignore.
//
// Run with:  deno test -A tests/vl_ir_door_guard_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[ir-door-guard] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

/** The armed shadow's rows for `src`, under control `corrupt`. */
const rows = (src: string, corrupt = 0) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.irShadowArm(1);
  exp.irShadowCorrupt(corrupt);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
  const out = new Map<string, number>();
  for (let i = 0; i < exp.irShadowRowCount(); i++) {
    const b: number[] = [];
    for (let j = 0; j < exp.irShadowRowLen(i); j++) b.push(exp.irShadowRowAt(i, j));
    out.set(String.fromCodePoint(...b), exp.irShadowRowN(i));
  }
  return out;
};

const show = (r: Map<string, number>) => JSON.stringify([...r].filter(([k]) => k.startsWith("node-in")));

// A held coercion on an ancestor: the literal fills a list the delivery converts after.
const HELD_ANCESTOR = `const rows: i32[][] = __array_new__(2, [0, 0])
print(rows[1][0])
`;

// An open list-build region around a literal that holds none of its counted pushes.
const BUILD_REGION = `function build(): i32 {
  const ys: i32[] = []
  ys.push(1)
  const zs = [7, 8]
  ys.push(zs[0])
  return ys.length
}
print(build())
`;

// A literal in a loop over a string that reads \`s.length\`. A body holding a literal is never
// hoisted (\`hoistSafeExpr\`), so no loop-hoist frame is open at the door.
const LOOP = `function walk(s: string): i32 {
  let t = 0
  let i = 0
  while i < s.length {
    const pair = [s[i], s.length]
    t = t + pair[0] + pair[1]
    i = i + 1
  }
  return t
}
print(walk("ab"))
`;

// A push receiver read through a list literal: legacy casts its payload strictly here.
const PUSH_CAST = `[[]][0].push(2.5)
print(1)
`;

Deno.test({
  name: "ir door guard: a context the fragment cannot read leaves no row, and the fragment matches",
  ignore,
  fn: () => {
    for (const [what, src] of [["held ancestor", HELD_ANCESTOR], ["build region", BUILD_REGION], ["loop", LOOP], ["push cast", PUSH_CAST]]) {
      const r = rows(src);
      const live = [...r.keys()].filter((k) => k.startsWith("node-in context live"));
      if (live.length > 0) throw new Error(`${what}: want no live context, got ${show(r)}`);
      if ((r.get("node-in array: matched") ?? 0) < 1) {
        throw new Error(`${what}: want the literal matched, got ${show(r)}`);
      }
      const differ = [...r.keys()].filter((k) => k.startsWith("node-in array: differ"));
      if (differ.length > 0) throw new Error(`${what}: want no differ, got ${show(r)}`);
    }
  },
});

Deno.test({
  name: "ir door guard: a staged receiver inside the fragment still misses",
  ignore,
  fn: () => {
    const staged = rows(`function f(): i32 { return 3 }
function at(i: i32): i32 { return [f(), 2, 5].get(i) ?? -1 }
print(at(1))
`);
    if ((staged.get("node-in context live: staged list get") ?? 0) < 1) {
      throw new Error(`want the staged receiver named, got ${show(staged)}`);
    }
  },
});

Deno.test({
  name: "ir door guard: a held coercion on the root misses; the same mark on an ancestor does not",
  ignore,
  fn: () => {
    const r = rows(`function f(): i32[] { return [1, 2] }\nprint(f().length)\n`, 6);
    if ((r.get("node-in held root: coerceHeld on the root") ?? 0) < 1) {
      throw new Error(`want the root-held fragment to miss, got ${show(r)}`);
    }
    if ((r.get("node-in held ancestor: ") ?? 0) < 1) {
      throw new Error(`want the ancestor-held fragment clean, got ${show(r)}`);
    }
  },
});

Deno.test({
  name: "ir door guard: a list-arm narrowing in a push receiver is not the IR's yet",
  ignore,
  fn: () => {
    const r = rows(`function f(u: i32[] | string): i32 {
  if u is i32[] {
    u.push(1)
    return u.length
  }
  return 0
}
print(f([3]))
print(f("s"))
`);
    if ((r.get("uncovered is rung") ?? 0) < 1) {
      throw new Error(`want the list-arm narrowing uncovered at \`is rung\`, got ${JSON.stringify([...r])}`);
    }
  },
});

// A whole-function push reads its receiver before the push, where legacy's strict cast is not
// set, so a receiver that unboxes a list arm misses (`recvReadsListPayload`).
Deno.test({
  name: "ir: a push whose receiver unboxes a list arm is legacy's",
  ignore,
  fn: () => {
    const r = rows(`function f(u: i32[] | string): i32 {
  (u as! i32[]).push(1)
  return 0
}
const xs: i32[] = [3]
print(f(xs))
`);
    if ((r.get("uncovered push receiver payload cast") ?? 0) < 1) {
      throw new Error(`want the push receiver's payload cast to miss, got ${JSON.stringify([...r])}`);
    }
    // An element narrowed to a list arm: today the `is` rung misses first; once it lands, the
    // element's own atom unbox (`idxNarrowAtomKind`) must still make the push legacy's.
    const el = rows(`function g(xs: (i32[] | string)[]): i32 {
  if xs[0] is i32[] {
    xs[0].push(1)
  }
  return 0
}
print(g([[3], "s"]))
`);
    const why = ["uncovered is rung", "uncovered push receiver payload cast"].filter((k) => el.has(k));
    if (why.length < 1 || el.has("matched")) {
      throw new Error(`want the narrowed element's push left to legacy, got ${JSON.stringify([...el])}`);
    }
  },
});

// A const cell's constant initializer hosts a fragment: a literal there matches legacy's bytes.
Deno.test({
  name: "ir door: a list literal in a const cell's initializer is hosted and matches",
  ignore,
  fn: () => {
    const r = rows(`const T: i32[] = [1, 2, 3]
function f(): i32 { return T[1] }
print(f())
`);
    if ((r.get("node-in array: matched") ?? 0) < 1 || r.has("node-in array: miss fragment outside a body")) {
      throw new Error(`want the initializer's literal hosted and matched, got ${show(r)}`);
    }
  },
});

// A local the fragment never declared takes its rep from the type; legacy's cell here is the
// literal set's atom (D14757). The fragment must miss, not write the atom into a string list.
Deno.test({
  name: "ir door: a local whose legacy cell is not its type's rep misses",
  ignore,
  fn: () => {
    const r = rows(`const A = "x"
const B = "y"
function main(c: boolean) {
  const M = if c { A } else { B }
  const xs = [M, "z"]
  print(xs[0])
}
main(true)
`);
    if ((r.get("node-in array: miss atom cell local rep") ?? 0) < 1) {
      throw new Error(`want the atom cell's read to miss, got ${show(r)}`);
    }
    const differ = [...r.keys()].filter((k) => k.startsWith("node-in array: differ"));
    if (differ.length > 0) throw new Error(`want no differ, got ${show(r)}`);
  },
});

// A `for` walk's literal iterable reads the module list legacy hoists; the fragment's read is
// the same global, so the plain, parenthesized, nested and string spellings all match.
Deno.test({
  name: "ir door: a for walk's literal iterable reads the hoisted list and matches",
  ignore,
  fn: () => {
    const r = rows(`function plain(): i32 {
  let t = 0
  for x in [1, 2, 3] { t = t + x }
  return t
}
function paren(): i32 {
  let t = 0
  for x in ([4, 5]) { t = t + x }
  return t
}
function nested(): i32 {
  let t = 0
  for xs in [[1, 2], [3]] { t = t + xs.length }
  return t
}
function strs(): i32 {
  let t = 0
  for s in ["a", "bb"] { t = t + s.length }
  return t
}
print(plain() + paren() + nested() + strs())
`);
    const off = [...r.keys()].filter((k) => k.startsWith("node-in") && !k.endsWith(": matched"));
    if ((r.get("node-in array: matched") ?? 0) < 4 || off.length > 0) {
      throw new Error(`want every for-walk literal matched, got ${show(r)}`);
    }
  },
});

// A value `if` element lowers through the fragment's body walk, as a function body's does.
Deno.test({
  name: "ir door: a list literal holding a value if matches",
  ignore,
  fn: () => {
    const r = rows(`function element(x: f32): f32 {
  const a = [if x > 0.0 { x } else { 0.75 }]
  return a[0]
}
print(element(-1.0))
`);
    if ((r.get("node-in array: matched") ?? 0) < 1 || r.has("node-in array: miss an `if` outside a body walk")) {
      throw new Error(`want the value-if literal matched, got ${show(r)}`);
    }
  },
});

// A start body with a proven string accumulator still hosts a fragment: the rows the fragment
// would read are the start's own while legacy writes it.
Deno.test({
  name: "ir door: a start-body literal beside a string accumulator matches",
  ignore,
  fn: () => {
    const r = rows(`let t = ""
let k = 0
while k < 3 {
  t = t + "x"
  k = k + 1
}
const ys = [k, 2]
print(t)
print(ys[0])
`);
    const off = [...r.keys()].filter((k) => k.startsWith("node-in") && !k.endsWith(": matched"));
    if ((r.get("node-in array: matched") ?? 0) < 1 || off.length > 0) {
      throw new Error(`want the start literal matched, got ${show(r)}`);
    }
  },
});

// A list literal builds at legacy's build type, which reads a type parameter at the instance:
// `gt<f32>`'s `[1.5]` at `T[]` is an f32 list, where the literal's own stamp says f64.
Deno.test({
  name: "ir door: a generic instance's list literal builds at the instance's list",
  ignore,
  fn: () => {
    const r = rows(`function gt<T>(xs: T[] | null) { return xs ?? [1.5] }
print(gt<f32>(null)[0])
`);
    const off = [...r.keys()].filter((k) => k.startsWith("node-in") && !k.endsWith(": matched"));
    if ((r.get("node-in array: matched") ?? 0) < 1 || off.length > 0) {
      throw new Error(`want the instance's literal matched, got ${show(r)}`);
    }
  },
});

// A sub-word list's elements are plain i32s its backing truncates, as a `u8` list's are.
Deno.test({
  name: "ir door: a sub-word list literal's i32 elements verify and match",
  ignore,
  fn: () => {
    const r = rows(`const c: i8[] = [-6, 7]
const d: u16[] = [65000, 7]
print(c[0] + d[0])
`);
    const off = [...r.keys()].filter((k) => k.startsWith("node-in") && !k.endsWith(": matched"));
    if ((r.get("node-in array: matched") ?? 0) < 2 || off.length > 0) {
      throw new Error(`want both sub-word literals matched, got ${show(r)}`);
    }
  },
});

// A fragment inside a walk it did not build reads the loop variable's legacy slot, held to
// legacy's cell: a string's code unit, a packed byte, a map's key and value, an index, a variable
// a closure captures, and an outer walk's variable. Each literal matches or misses by name.
Deno.test({
  name: "ir door: a list literal reading a loop variable matches or names its miss",
  ignore,
  fn: () => {
    const r = rows(`function w1(s: string): i32 {
  let t = 0
  for ch in s { const ys = [ch, 1]; t = t + ys[0] }
  return t
}
function w2(bs: u8[]): i32 {
  let t = 0
  for b in bs { const ys = [b, 1]; t = t + ys[0] }
  return t
}
function w3(m: {[string]: i32}): i32 {
  let t = 0
  for k, v in m { const ks = [k, "z"]; const vs = [v, 1]; t = t + vs[0] + ks.length }
  return t
}
function w4(xs: i32[]): i32 {
  let t = 0
  for i, x in xs { const ys = [i, x]; t = t + ys[0] + ys[1] }
  return t
}
function w5(xs: i32[]): i32 {
  let t = 0
  for x in xs { const g = () => x + 1; const ys = [x, g()]; t = t + ys[0] + ys[1] }
  return t
}
function w6(xs: i32[], zs: i32[]): i32 {
  let t = 0
  for x in xs { for z in zs { const ys = [x, z]; t = t + ys[0] * ys[1] } }
  return t
}
const bs: u8[] = [200, 7]
const m: {[string]: i32} = Map()
m["a"] = 3
print(w1("ab") + w2(bs) + w3(m) + w4([5, 6]) + w5([5, 6]) + w6([2, 3], [4, 5]))
`);
    const bad = [...r.keys()].filter((k) => k.startsWith("node-in") && (k.includes("read of") || k.includes("differ")));
    if (bad.length > 0 || (r.get("node-in array: matched") ?? 0) < 7) {
      throw new Error(`want every loop-variable literal matched or a named miss, got ${show(r)}`);
    }
  },
});
