// THE PIN GUARD (`pinGuardArm`, compiler/check_types.vl; L2 S3.2 in
// docs/internals/refactor-notes/2026-11-16-l2-s3-plan.md).
//
// Armed, the guard counts each hole write (`holeSolve`, `holeLink`) the call solver
// (`ifaceSolveAt`) makes inside a delivery question (`assignableExpr`). The census
// (`scripts/pin-guard-census.ts`) runs it over the corpus. This suite keeps the guard from going
// blind:
//
//   fires    — the control (`pinGuardArm(1, 1)`) counts every write, so a program that pins an
//              empty list must show rows.
//   disarmed — no rows at all.
//   clean    — the programs whose solve writes holes outside a delivery question write none
//              inside one.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_pin_guard_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[pin-guard] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

// An empty list pinned by its first push: a hole write outside any solve.
const PINS = `const xs = []
xs.push(1)
print(xs.length)
`;

// The solve of `empty(ef)` builds the empty list at the callback's parameter type.
const SOLVE_WRITES = `function ef(a: i32, b: f64[]) { return a + b.length }
function es(a: i32, b: string[]) { return a * 2 + b.length }
function empty(h) { return h(3, []) }
print(empty(ef) + empty(es))
`;

/** Compile `src` on a fresh instance with the guard set; the rows it counted. */
const rows = (src: string, arm: number, all: number) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.pinGuardArm(arm, all);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  exp.compileSrc();
  const out = new Map<string, number>();
  for (let i = 0; i < exp.pinGuardRowCount(); i++) {
    const b = new Uint8Array(exp.pinGuardRowLen(i));
    for (let j = 0; j < b.length; j++) b[j] = exp.pinGuardRowAt(i, j);
    out.set(new TextDecoder().decode(b), exp.pinGuardRowN(i));
  }
  return out;
};

Deno.test({
  name: "pin guard: the control counts a pin made outside a solve",
  ignore,
  fn() {
    const got = rows(PINS, 1, 1);
    const outside = [...got.keys()].filter((k) => k.includes(" | outside | "));
    if (outside.length === 0) {
      throw new Error(
        `want a row for a write outside a solve, got: ${
          JSON.stringify([...got])
        }`,
      );
    }
  },
});

Deno.test({
  name: "pin guard: disarmed, no rows",
  ignore,
  fn() {
    const got = rows(SOLVE_WRITES, 0, 0);
    if (got.size !== 0) {
      throw new Error(
        `want no rows disarmed, got: ${JSON.stringify([...got])}`,
      );
    }
  },
});

Deno.test({
  name: "pin guard: a solve's own writes fall outside its delivery questions",
  ignore,
  fn() {
    const control = rows(SOLVE_WRITES, 1, 1);
    const inSolve = [...control.keys()].filter((k) =>
      k.includes(" | solve | ")
    );
    if (inSolve.length === 0) {
      throw new Error(
        `want the control to see a write inside the solve, got: ${
          JSON.stringify([...control])
        }`,
      );
    }
    const guarded = rows(SOLVE_WRITES, 1, 0);
    if (guarded.size !== 0) {
      throw new Error(
        `want no write inside a solve's delivery question, got: ${
          JSON.stringify([...guarded])
        }`,
      );
    }
  },
});
