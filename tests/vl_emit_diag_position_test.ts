// NATIVE `vl check --codegen` — an EMIT-side refusal must carry a POSITION, and in a module
// graph that position's file must be the DEFINING module's (D1519, reported by the glean
// session as VL-024 / VL-026).
//
// The check path already had both properties (tests/vl_check_module_diag_test.ts is its
// guard); the emit path had neither in two places. A refusal raised by a program-wide COLLECT
// pass printed `at <file>` with no line at all, because `emitFail` anchors at
// `emitCurStmtIx`/`emitCurFnIx` and neither is armed before the first body is lowered. And
// `driver.vl`'s `diagModule` had no arm for the emit diagnostic at all — `diagLine`/`diagCol`
// resolved it through `emitErrTokIx` and got the defining module's own line, while this one
// fell through to module 0, so a refusal at `lib.vl:15` printed as `main.vl:15`.
//
// THE WITNESS MUST STILL REFUSE. `emitFail` records and keeps emitting, so a probe built on a
// program that COMPILES reports nothing at all — a green run over a fixed witness is the
// instrument saying nothing, not the property holding. Both cases therefore assert the
// refusal fired FIRST and name the replacement work if it stops.
//
// GATING: `SELFHOST_NATIVE_ALIGN=1` plus the built binary and seed, as vl_check_dir_test.ts.
//
// @test-timing native

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-emit-diag-position] skipped — missing vl binary or seed wasm.",
  );
}

const checkCodegen = async (
  target: string,
  cwd: string,
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", "--codegen", target, "--compiler", COMPILER],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
};

// The `[ERROR]` block alone. A HINT or WARNING block carries its own `at file:line:col`, and
// matching anywhere in the output reads one of THOSE — which graded a positionless emit
// refusal as positioned while this test was being written.
const errorBlock = (out: string): string => {
  const lines = out.split("\n");
  const start = lines.findIndex((l) => l.startsWith("[ERROR]"));
  if (start < 0) return "";
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("[")) end += 1;
  return lines.slice(start, end).join("\n");
};

// A BODY-phase refusal at a top-level statement: reading a map that holds functions of two
// result types by index has no value box (D15139), and the refusal is anchored at the read on
// line 6. The collect phase has no positioned refusal a check-clean program reaches: the last one
// ran (D15098), and D15150's refusal is raised there with no position at all (D15154). When D15154
// is fixed, D15150's witness is the collect-phase case again.
const BODY_WITNESS = `function inc0(a) { return a + 1 }
function half(a) { return a / 2.0 }
const m = Map()
m.set("a", inc0)
m.set("b", half)
const g = m["b"]
if g != null { print(g(3)) }
`;

Deno.test({
  name: "vl-emit-diag-position: a top-level emit refusal carries file:line:col",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_emit_pos_" });
    try {
      await Deno.writeTextFile(`${dir}/body.vl`, BODY_WITNESS);
      const r = await checkCodegen("body.vl", dir);
      if (!r.out.includes("emit error")) {
        throw new Error(
          "the top-level witness no longer reaches an emit refusal, so this guard is " +
            "measuring nothing — replace BODY_WITNESS with another program whose refusal " +
            `carries a position.\n${r.out}`,
        );
      }
      const blk = errorBlock(r.out);
      if (!/at \S*body\.vl:\d+:\d+/.test(blk)) {
        throw new Error(
          `expected the emit refusal to carry body.vl:<line>:<col>, got:\n${blk}`,
        );
      }
      // The anchor is the refused read on line 6, not the last statement in the file.
      if (!/at \S*body\.vl:6:\d+/.test(blk)) {
        throw new Error(
          `expected the anchor on line 6 (the refused read), got:\n${blk}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "vl-emit-diag-position: a refusal inside an imported module names THAT file",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_emit_mod_" });
    try {
      // `lib.vl` carries the same refusal, on its own line 6. `main.vl` is two lines, so a
      // merged-module line would land past the end of the file it names — the shape the
      // reporter bisected the wrong file for.
      await Deno.writeTextFile(
        `${dir}/lib.vl`,
        BODY_WITNESS + "export function one(): i32 { 1 }\n",
      );
      await Deno.writeTextFile(
        `${dir}/main.vl`,
        'import { one } from "./lib"\nprint(one())\n',
      );
      const r = await checkCodegen("main.vl", dir);
      if (!r.out.includes("emit error")) {
        throw new Error(
          "the imported witness no longer reaches an emit refusal, so this guard is " +
            `measuring nothing — replace it with another cross-module refusal.\n${r.out}`,
        );
      }
      const blk = errorBlock(r.out);
      if (!/at \S*lib\.vl:\d+:\d+/.test(blk)) {
        throw new Error(
          `expected the emit refusal attributed to lib.vl with a line:col, got:\n${blk}`,
        );
      }
      if (/at \S*main\.vl:/.test(blk)) {
        throw new Error(
          `the emit refusal is still labelled against the ENTRY file:\n${blk}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
