// THE IR DOOR'S CONTEXT GUARD (`legacyContextLiveWhy`, ir-design-2026-11.md §10.2.1).
//
// The door at `emitArr` lowers a list literal as an IR fragment inside a legacy body. The guard
// names the legacy context such a fragment would read. TWO HALVES:
//
//   drops — a context the fragment cannot read leaves no `context live` row, and the probe's
//           fragment matches legacy byte for byte under it.
//   fires — a context it can read still misses, by name, until it becomes a door parameter.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
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

Deno.test({
  name: "ir door guard: a context the fragment cannot read leaves no row, and the fragment matches",
  ignore,
  fn: () => {
    for (const [what, src] of [["held ancestor", HELD_ANCESTOR], ["build region", BUILD_REGION], ["loop", LOOP]]) {
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
  name: "ir door guard: a staged receiver inside the fragment, and the push receiver cast, still miss",
  ignore,
  fn: () => {
    const staged = rows(`function f(): i32 { return 3 }
function at(i: i32): i32 { return [f(), 2, 5].get(i) ?? -1 }
print(at(1))
`);
    if ((staged.get("node-in context live: staged list get") ?? 0) < 1) {
      throw new Error(`want the staged receiver named, got ${show(staged)}`);
    }
    const cast = rows(`[[]][0].push(2.5)\nprint(1)\n`);
    if ((cast.get("node-in context live: push receiver cast") ?? 0) < 1) {
      throw new Error(`want the push receiver cast named, got ${show(cast)}`);
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
