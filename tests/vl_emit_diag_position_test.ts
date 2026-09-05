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

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-emit-diag-position] skipped — missing vl binary or seed wasm.");
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

// A COLLECT-phase refusal: `A` is a union arm whose OWN field is typed as `A`, so its layout is
// not finished being decided when the field asks for a rep, and the refusal fires while the
// declarations are being registered — before any function body arms a cursor.
//
// THE NESTED-STRUCT ARM FIELD USED TO BE THIS WITNESS and D1579 made it RUN, which is this
// test's own failure mode working: the guard said so rather than passing green over a compiling
// program. The self-referential arm is `armDeferStack`'s decline (D1518) and is the collect
// phase's remaining loud refusal.
const COLLECT_WITNESS = `type E = { msg: string }

// A SELF-REFERENTIAL ARM: \`A\`'s own field is typed as \`A\`, so the arm's layout is not
// finished being decided when the field asks for its rep (\`armDeferStack\`, D1518) and
// the refusal fires while \`collectU\` is registering this declaration.
type A = { n: i32, f: A | null }

function h(ok: boolean): A | E {
  if !ok { return { msg: "e" } }
  return { n: 1, f: null }
}
print(h(true) is A)
`;

Deno.test({
  name: "vl-emit-diag-position: a COLLECT-phase emit refusal carries file:line:col",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_emit_pos_" });
    try {
      await Deno.writeTextFile(`${dir}/collect.vl`, COLLECT_WITNESS);
      const r = await checkCodegen("collect.vl", dir);
      if (!r.out.includes("emit error")) {
        throw new Error(
          "the collect-phase witness no longer reaches an emit refusal, so this guard is " +
            "measuring nothing — replace COLLECT_WITNESS with another program that refuses " +
            `during collectU/collectS.\n${r.out}`,
        );
      }
      const blk = errorBlock(r.out);
      if (!/at \S*collect\.vl:\d+:\d+/.test(blk)) {
        throw new Error(
          `expected the emit refusal to carry collect.vl:<line>:<col>, got:\n${blk}`,
        );
      }
      // The anchor is the FIELD whose type has no rep (`f: A | null` on line 6), not the
      // declaration's own name and not the last function in the file.
      if (!/at \S*collect\.vl:6:\d+/.test(blk)) {
        throw new Error(
          `expected the anchor on line 6 (the offending field), got:\n${blk}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-emit-diag-position: a refusal inside an imported module names THAT file",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_emit_mod_" });
    try {
      // `lib.vl` carries the same collect-phase refusal, on its own line 6. `main.vl` is two
      // lines, so a merged-module line would land past the end of the file it names — the
      // shape the reporter bisected the wrong file for.
      await Deno.writeTextFile(
        `${dir}/lib.vl`,
        COLLECT_WITNESS
          .replace("type E =", "export type E =")
          .replace("function h", "export function h")
          .replace("print(h(true) is A)\n", ""),
      );
      await Deno.writeTextFile(
        `${dir}/main.vl`,
        'import { E, h } from "./lib"\nprint(h(true) is E)\n',
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
