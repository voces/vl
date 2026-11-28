// The IR analyses against hand-computed answers: under `$VL_IR_GRAPH=1` each claimed function
// banks one `du` shadow row per parameter and local (`compiler/ir_graph_rows.vl`), its writes as
// `line:kind` and its reads as lines; `$VL_IR_SHADOW` prints them. Every expected row below was
// read off the fixture's source by hand. No assertion library, per CLAUDE.md.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-ir-analyses] skipped: missing vl binary or seed wasm.");
}

const FIXTURE = `${ROOT}/tests/ir-analyses/defuse.vl`;

// `count  row`: how many variables bank that row, then the row.
const WANT_DU = [
  // `xs` is read by the `for`; `s` is written by its `let` and the loop's assignment.
  "1 du loopSum param def 0:param use 3",
  "1 du loopSum local def 2:assign,4:assign use 4,6",
  "1 du loopSum local def 3:loopVar use 4",
  // `c` and `b` are both read on line 10, so they bank one row twice.
  "2 du pick param def 0:param use 10",
  "1 du pick param def 0:param use 9",
  "1 du pick local def 9:assign,10:assign use 11",
  "1 du count param def 0:param use 15",
  "1 du count local def 14:assign,16:assign use 15,16,18",
  // The `if`'s out variable: each arm assigns it, and `y`'s initialiser reads it.
  "2 du outOf param def 0:param use 21",
  "1 du outOf local def 21:assign use 22",
  "1 du outOf local def 21:assign,21:assign use 21",
  // The range loop's body is lowered as five copies (the partial loop's four, then the tail),
  // and its bound's local is read by the loop's own lowering, not through an operand.
  "1 du rangeSum param def 0:param use 26",
  "1 du rangeSum local def 25:assign,27:assign,27:assign,27:assign,27:assign,27:assign use 27,27,27,27,27,29",
  "1 du rangeSum local def 26:assign,26:loopVar use 27,27,27,27,27",
  "1 du rangeSum local def 26:assign use ",
  // Each call of `inc` passes `m` as a capture and writes it back after.
  "1 du bump local def 32:assign,34:writeBack,35:writeBack use 34,35,36",
  "1 du __lambda_0 param def 0:param,33:assign use 33",
];

const run = async (
  graph: string,
): Promise<{ code: number; err: string; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", FIXTURE, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({
      NO_COLOR: "1",
      VL_NO_CACHE: "1",
      VL_IR_SHADOW: "1",
      VL_IR_GRAPH: graph,
    }),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

// The `du` rows of a run's `[ir] <path>: <n>\t<row>` lines, as `n row`.
const duRows = (err: string): string[] =>
  err.split("\n").flatMap((l) => {
    const m = /^\[ir\] .*: (\d+)\t(du .*)$/.exec(l);
    return m ? [`${m[1]} ${m[2]}`] : [];
  });

Deno.test({
  name: "ir-analyses: def-use rows match the hand-computed answers",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run("1");
    if (r.code !== 0) throw new Error(`want rc 0, got ${r.code}: ${r.err}`);
    if (r.out !== "6\n5\n3\n0\n6\n3\n") {
      throw new Error(`want the fixture's output 6 5 3 0 6 3, got: ${r.out}`);
    }
    const got = duRows(r.err);
    const want = [...WANT_DU].sort();
    const gotSorted = [...got].sort();
    if (JSON.stringify(gotSorted) !== JSON.stringify(want)) {
      const missing = want.filter((w) => !got.includes(w));
      const extra = got.filter((g) => !want.includes(g));
      throw new Error(
        `want the hand-computed rows\nmissing:\n  ${
          missing.join("\n  ")
        }\nextra:\n  ${extra.join("\n  ")}`,
      );
    }
  },
});

Deno.test({
  name: "ir-analyses: no row without the switch, and the same output",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run("");
    if (r.code !== 0 || r.out !== "6\n5\n3\n0\n6\n3\n") {
      throw new Error(`want rc 0 and 6 5 3 0 6 3, got rc ${r.code}: ${r.out}`);
    }
    const got = duRows(r.err);
    if (got.length !== 0) {
      throw new Error(
        `want no du row with $VL_IR_GRAPH unset, got:\n  ${got.join("\n  ")}`,
      );
    }
  },
});
