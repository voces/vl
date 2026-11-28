// The IR analyses against hand-computed answers: under `$VL_IR_GRAPH=1` each claimed function
// banks one `du` shadow row per parameter and local (`compiler/ir_graph_rows.vl`), its writes as
// `line:kind^parent` and its reads as `line@loop`; `$VL_IR_SHADOW` prints them. Every expected row below was
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
const CG_FIXTURE = `${ROOT}/tests/ir-analyses/callgraph.vl`;
const EFF_FIXTURE = `${ROOT}/tests/ir-analyses/effect.vl`;

// `count  row`: how many variables bank that row, then the row.
const WANT_DU = [
  // `xs` is read by the `for` (line 4); `s` and `n` are written by their `let` and inside the
  // loop (`^4`, the `for` holds the assignment), and read inside it (`@4`) and after it.
  "1 du loopSum param def 0:param use 4",
  "1 du loopSum local def 2:assign,5:assign^4 use 5@4,8",
  "1 du loopSum local def 3:assign,6:assign^4 use 6@4,8",
  "1 du loopSum local def 4:loopVar use 5@4",
  // `c` and `b` are both read on line 12, so they bank one row twice.
  "2 du pick param def 0:param use 12",
  "1 du pick param def 0:param use 11",
  "1 du pick local def 11:assign,12:assign^12 use 13",
  // The `while`'s condition is read inside its loop.
  "1 du count param def 0:param use 17@17",
  "1 du count local def 16:assign,18:assign^17,19:assign^17 use 17@17,18@17,19@17,21",
  // The `if`'s out variable: each arm assigns it, and `y`'s initialiser reads it.
  "2 du outOf param def 0:param use 24",
  "1 du outOf local def 24:assign use 25",
  "1 du outOf local def 24:assign^24,24:assign^24 use 24",
  // The range loop's body is lowered as five copies (the partial loop's four, then the tail),
  // and its bound's local is read by the loop's own lowering, not through an operand.
  "1 du rangeSum param def 0:param use 29",
  "1 du rangeSum local def 28:assign,29:assign^29,29:assign^29,29:assign^29,29:assign^29,29:assign^29 use 29@29,29@29,29@29,29@29,29@29,30",
  "1 du rangeSum local def 29:assign,29:loopVar use 29@29,29@29,29@29,29@29,29@29",
  "1 du rangeSum local def 29:assign use ",
  // Each call of `inc` passes `m` as a capture and writes it back after.
  "1 du bump local def 33:assign,37:writeBack,38:writeBack use 37,38,39",
  "1 du __lambda_0 param def 0:param,35:assign use 35",
];

// The call graph of `callgraph.vl`, banked at the seal: each site as `cg <caller> <kind> <callee>
// <line>`, each function's callers count and whether it escapes (its node count is checked to be
// positive, not pinned), the components callees first, and completeness.
const WANT_CG = [
  "1 callers leaf 2 local",
  "1 cg mid direct leaf 2",
  "1 callers mid 1 local",
  "1 cg top direct mid 3",
  "1 cg top direct leaf 3",
  "1 callers top 1 local",
  "1 cg isEven direct isOdd 6",
  "1 callers isEven 2 local",
  "1 cg isOdd direct isEven 10",
  "1 callers isOdd 1 local",
  // `twice` calls its parameter twice; the call site is specialised to `twice$cb0`, which calls
  // `sq` directly, so `twice` itself has no caller.
  "2 cg twice indirect ? 12",
  "1 callers twice 0 local",
  // `sq` is called twice by `twice$cb0` and made into a closure by the top level: it escapes.
  "1 callers sq 3 escapes",
  "2 cg twice$cb0 direct sq 12",
  "1 callers twice$cb0 1 local",
  "1 cg @start direct top 14",
  "1 cg @start direct isEven 15",
  "1 cg @start closure sq 16",
  "1 cg @start direct twice$cb0 16",
  "1 scc 0 leaf",
  "1 scc 1 mid",
  "1 scc 2 top",
  "1 scc 3 isEven,isOdd",
  "1 scc 4 twice",
  "1 scc 5 sq",
  "1 scc 6 twice$cb0",
  "1 cg complete true",
];

// The effect class of each line of `effect.vl` holding a right-hand side, one function per class:
// arithmetic is pure, a division may trap, a push traps and writes, a recursive call calls.
const WANT_EFF = [
  "1 eff addUp 2 pure",
  "1 eff addUp 3 pure",
  "1 eff divide 6 trap",
  "1 eff grow 10 trap,write",
  // `.length` reads the list, which the class keeps as may-trap.
  "1 eff grow 11 trap",
  "1 eff down 14 pure",
  "1 eff down 15 call",
  "1 eff down 16 pure",
];

const run = async (
  graph: string,
  fixture = FIXTURE,
  extra: Record<string, string> = {},
): Promise<{ code: number; err: string; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", fixture, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({
      NO_COLOR: "1",
      VL_NO_CACHE: "1",
      VL_IR_SHADOW: "1",
      VL_IR_GRAPH: graph,
      VL_TEST_CLAIM_REFUSAL: "",
      ...extra,
    }),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

// The call-graph rows of a run, as `n row`, each `size <k>` checked positive and dropped.
const cgRows = (err: string): string[] =>
  err.split("\n").flatMap((l) => {
    const m = /^\[ir\] .*: (\d+)\t((?:cg|callers|scc) .*)$/.exec(l);
    if (!m) return [];
    const sz = / size (-?\d+)$/.exec(m[2]);
    if (sz && Number(sz[1]) <= 0) {
      throw new Error(`want a positive node count, got: ${m[2]}`);
    }
    return [`${m[1]} ${sz ? m[2].slice(0, sz.index) : m[2]}`];
  });

const sameRows = (what: string, got: string[], want: string[]) => {
  if (JSON.stringify([...got].sort()) === JSON.stringify([...want].sort())) {
    return;
  }
  const missing = want.filter((w) => !got.includes(w));
  const extra = got.filter((g) => !want.includes(g));
  throw new Error(
    `want the hand-computed ${what} rows\nmissing:\n  ${
      missing.join("\n  ")
    }\nextra:\n  ${extra.join("\n  ")}`,
  );
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
    if (r.out !== "9\n5\n3\n0\n6\n3\n") {
      throw new Error(`want the fixture's output 9 5 3 0 6 3, got: ${r.out}`);
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
    if (r.code !== 0 || r.out !== "9\n5\n3\n0\n6\n3\n") {
      throw new Error(`want rc 0 and 9 5 3 0 6 3, got rc ${r.code}: ${r.out}`);
    }
    const got = duRows(r.err);
    if (got.length !== 0) {
      throw new Error(
        `want no du row with $VL_IR_GRAPH unset, got:\n  ${got.join("\n  ")}`,
      );
    }
  },
});

Deno.test({
  name: "ir-analyses: call-graph rows match the hand-computed answers",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run("1", CG_FIXTURE);
    if (r.code !== 0 || r.out !== "12\ntrue\n81\n") {
      throw new Error(
        `want rc 0 and 12 true 81, got rc ${r.code}: ${r.out}${r.err}`,
      );
    }
    sameRows("call-graph", cgRows(r.err), WANT_CG);
  },
});

Deno.test({
  name: "ir-analyses: effect classes match the hand-computed answers",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run("1", EFF_FIXTURE);
    if (r.code !== 0 || r.out !== "10\n3\n4\n10\n") {
      throw new Error(
        `want rc 0 and 10 3 4 10, got rc ${r.code}: ${r.out}${r.err}`,
      );
    }
    const got = r.err.split("\n").flatMap((l) => {
      const m = /^\[ir\] .*: (\d+)\t(eff .*)$/.exec(l);
      return m ? [`${m[1]} ${m[2]}`] : [];
    });
    sameRows("effect", got, WANT_EFF);
  },
});
