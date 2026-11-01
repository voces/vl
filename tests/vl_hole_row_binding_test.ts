// THE CALL'S BINDING ON A HOLE-PIN ROW (`compiler/check_elab_cap.vl`, inc3 slice (ii) cell C).
//
// A hole-pin row holds the pins of one epoch, and records the binding they were substituted from.
// Nothing reads that binding yet. The probe counts the rows the elaboration made no instance of
// whose binding holds a closed type for a name the row leaves out:
//
//   fires   — `run(x, h)` hands `h` on; its set's row binds `?run.1` alone, `?run.0` is in the binding.
//   control — `run(x: i32, h)`: the same row is the whole binding, and makes its instance.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_hole_row_binding_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[hole-row-binding] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

/** Check `src` on a fresh instance; how many rows the probe counted. */
const short = (src: string) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  exp.checkSrc();
  return exp.elabHoleRowShortCount();
};

const program = (runParams: string) =>
  `function add(a, b) { return a + b }
function same(g, s) { print(g(s, s)) }
function twoCalls(g, s) {
  print(g(1, 2))
  print(g(s, 1.5))
}
function once(k, h) {
  for f in [twoCalls] { f(h, k) }
}
once(0.5, add)
function each(k, h) {
  for f in [same] { f(h, k) }
}
function run(${runParams}) {
  each(0.5, h)
  print(x)
}
run(7, add)
`;

Deno.test({
  name: "hole-row binding: a row short of a name its call binds is counted",
  ignore,
  fn() {
    const got = short(program("x, h"));
    if (got < 1) throw new Error(`want at least 1 short row, got: ${got}`);
  },
});

Deno.test({
  name: "hole-row binding: a row that is the whole binding is not counted",
  ignore,
  fn() {
    const got = short(program("x: i32, h"));
    if (got != 0) throw new Error(`want 0 short rows, got: ${got}`);
  },
});
