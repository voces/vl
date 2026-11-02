// THE BOX-DESTINATION SHADOW (`compiler/box_dst_shadow.vl`, architecture-target-2026-10.md,
// step 5's record line).
//
// The checker records the union each node is delivered into (`boxDstTyAt`, per instance). Nothing
// reads it to decide anything yet; the shadow compares it with the union each `emitUnionBoxArg` /
// `emitUnionCoerce` call site names, and counts each delivery by class.
//
// TWO HALVES, each needed for the other to mean anything:
//
//   classes — witnesses whose deliveries land in each class, with exact counts. `brk` is a
//             producer gap (a `break` value gets no record) and flips the day it is closed.
//   fires   — `boxDstDropSet(1)` reads no record, so every agreement becomes a missing row;
//             `boxDstDropSet(2)` reads a type no site names, so every agreement disagrees.
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
const shadow = (src: string, drop: number) => {
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

// A loop's `break` values, delivered to a union binding: no record yet.
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

Deno.test({
  name: "box-dst shadow: an argument at a union parameter agrees",
  ignore,
  fn: () => expectRows("arg", ARG, DROP_NONE, "agree=2"),
});

Deno.test({
  name: "box-dst shadow: a literal adopted into an arm records the alias, not the arm",
  ignore,
  fn: () =>
    expectRows("arm", ARM, DROP_NONE, "agree=2; value already a box=1"),
});

Deno.test({
  name: "box-dst shadow: an inferred union element agrees",
  ignore,
  fn: () => expectRows("elem", ELEM, DROP_NONE, "agree=4"),
});

Deno.test({
  name: "box-dst shadow: a break value has no record (producer gap)",
  ignore,
  fn: () =>
    expectRows("brk", BRK, DROP_NONE, "no record=3; value already a box=2"),
});

Deno.test({
  name: "box-dst shadow: reading no record turns every agreement into a missing row",
  ignore,
  fn: () => expectRows("arg", ARG, DROP_READ, "no record=2"),
});

Deno.test({
  name: "box-dst shadow: reading another type turns every agreement into a disagreement",
  ignore,
  fn: () => expectRows("arg", ARG, DROP_AS_OTHER, "disagree=2"),
});
