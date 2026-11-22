// THE IR ORDER CHECK (`$VL_IR_SHADOW=6`, `irPreBuild` in `compiler/ir_build.vl`).
//
// Mode 6 builds and lowers each function where a claim builds it, before legacy emits it, and
// compares that with the shadow's build after legacy. Two halves:
//
//   order free — a program's rows do not depend on the program one compiler instance compiled
//                before it: a per-compile table left over from an earlier program (the
//                address fold's, once) would answer the early build for the wrong nodes.
//   writes no byte — an order-checked compile's output equals an unarmed one's.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_ir_prepost_test.ts

import { COMPILER, exists, ROOT } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[ir-prepost] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

const fresh = () =>
  new WebAssembly.Instance(compiled!, {}).exports as unknown as Exports;

/** Compiles `src` on instance `exp` under shadow mode `mode`; its rows and its output. */
const compile = (exp: Exports, src: string, mode: number) => {
  exp.irShadowArm(mode);
  exp.irShadowCorrupt(0);
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

const read = (name: string) =>
  Deno.readTextFileSync(`${ROOT}/tests/cases/intrinsics/${name}.vl`);

const rowText = (rows: Map<string, number>) =>
  [...rows].map(([k, n]) => `${n}\t${k}`).sort().join("\n");

// Each pair: a program whose address folds fill the table, then one whose rows it once masked.
const PAIRS: [string, string][] = [
  ["memarg-const-fold-single-use", "memarg-const-fold-traps"],
  ["memarg-const-fold-partial-unroll-range", "memarg-const-fold-shadowed"],
  ["memarg-const-fold-traps", "memarg-const-fold-two-uses"],
];

for (const [first, second] of PAIRS) {
  Deno.test({
    name: `ir order check: ${second} after ${first} keeps its own rows`,
    ignore,
    fn() {
      const alone = compile(fresh(), read(second), 6);
      const exp = fresh();
      const before = compile(exp, read(first), 6);
      if (before.rc !== 0) {
        throw new Error(`${first}: want rc 0, got ${before.rc}`);
      }
      const after = compile(exp, read(second), 6);
      if (alone.rc !== 0 || after.rc !== 0) {
        throw new Error(
          `${second}: want rc 0, got ${alone.rc} alone, ${after.rc} after`,
        );
      }
      const want = rowText(alone.rows);
      const got = rowText(after.rows);
      if (want !== got) {
        throw new Error(
          `${second} after ${first}: rows differ\nwant (alone):\n${want}\ngot:\n${got}`,
        );
      }
    },
  });
}

Deno.test({
  name: "ir order check: an order-checked compile writes the unarmed bytes",
  ignore,
  fn() {
    for (const [, name] of PAIRS) {
      const src = read(name);
      const plain = compile(fresh(), src, 0);
      const checked = compile(fresh(), src, 6);
      if (plain.rc !== 0 || checked.rc !== 0) {
        throw new Error(
          `${name}: want rc 0, got ${plain.rc} unarmed, ${checked.rc} under mode 6`,
        );
      }
      if (plain.out.join(",") !== checked.out.join(",")) {
        throw new Error(
          `${name}: want the unarmed ${plain.out.length} bytes, got ${checked.out.length} that differ`,
        );
      }
    }
  },
});
