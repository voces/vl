// THE IR SHADOW'S LIST READS (`compiler/ir_build_ref.vl`, ir-design-2026-11.md §5.3, I2's
// list half).
//
// A list of unpacked primitives read on legacy's plain guarded path builds `SBoundsCheck` then
// `RListGet`, which lower to legacy's own guard and `array.get`. TWO HALVES:
//
//   covered — the functions below build, verify and match legacy's bytes, and arming moves no
//             byte of the output.
//   fires   — `irRefCorrupt(5)` drops every bounds check: the verifier must fail naming
//             rule 8 and nothing else. Without it a rule 8 that checked nothing would pass.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[ir-list] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

/** Compiles `src` on a fresh instance; the shadow's rows when `arm` is set, and the output. */
const run = (src: string, arm: boolean, corrupt = 0) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.irShadowArm(arm ? 1 : 0);
  exp.irShadowCorrupt(0);
  exp.irRefCorrupt(corrupt);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.compileSrc();
  const rows = new Map<string, number>();
  for (let i = 0; i < exp.irShadowRowCount(); i++) {
    const b: number[] = [];
    for (let j = 0; j < exp.irShadowRowLen(i); j++) {
      b.push(exp.irShadowRowAt(i, j));
    }
    rows.set(String.fromCodePoint(...b), exp.irShadowRowN(i));
  }
  const out: number[] = [];
  for (let i = 0; i < exp.rbyteLen(); i++) out.push(exp.rbyteAt(i));
  return { rc, rows, out };
};

const failures = (rows: Map<string, number>) =>
  [...rows.keys()].filter((k) => k.startsWith("fail "));

// Element reads of an i32 and an f64 list, a parameter's and a call result's, and a `str`
// held and passed.
const LISTS = `function first(xs: i32[]): i32 { return xs[0] }
function at(xs: f64[], i: i32): f64 { return xs[i] }
function mk(): i32[] { return [3, 4, 5] }
function third(): i32 { return mk()[2] }
function pass(s: string): string { return s }
print(first([7, 8]))
print(at([1.5, 2.5], 1))
print(third())
print(pass("v"))
`;

Deno.test({
  name:
    "ir list: plain element reads build, verify and match legacy, and arming moves no byte",
  ignore,
  fn: () => {
    const armed = run(LISTS, true);
    if (armed.rc !== 0) {
      throw new Error(`want compileSrc rc 0, got ${armed.rc}`);
    }
    const fails = failures(armed.rows);
    if (fails.length > 0) {
      throw new Error(`want no verifier failure, got:\n${fails.join("\n")}`);
    }
    const covered = armed.rows.get("covered") ?? 0;
    const matched = armed.rows.get("matched") ?? 0;
    console.log(`[ir-list] rows ${JSON.stringify([...armed.rows])}`);
    // first, at, third and pass are each inside the set.
    if (covered < 4) throw new Error(`want at least 4 covered, got ${covered}`);
    if (matched !== covered) {
      throw new Error(
        `want every covered function to match legacy's bytes, got ${matched} of ${covered}`,
      );
    }
    const plain = run(LISTS, false);
    if (
      plain.out.length !== armed.out.length ||
      plain.out.some((b, i) => b !== armed.out[i])
    ) {
      throw new Error(
        `want byte-identical output armed and unarmed (${plain.out.length} vs ${armed.out.length} bytes)`,
      );
    }
  },
});

Deno.test({
  name: "ir list: the failing control 5 makes the verifier name rule 8",
  ignore,
  fn: () => {
    const { rc, rows } = run(LISTS, true, 5);
    if (rc !== 0) throw new Error(`want compileSrc rc 0, got ${rc}`);
    const fails = failures(rows);
    const named = fails.filter((k) => k.startsWith("fail rule 8 "));
    if (named.length === 0) {
      throw new Error(
        `want a rule 8 failure, got: ${
          JSON.stringify([...rows.keys()].map((k) => k.split("\n")[0]))
        }`,
      );
    }
    if (named.length !== fails.length) {
      throw new Error(
        `want only rule 8, got: ${
          fails.map((k) => k.split("\n")[0]).join("; ")
        }`,
      );
    }
  },
});
