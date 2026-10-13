// NATIVE `vl check --json`: the literal-default note ("`T` on line N has no annotation, so its
// literal defaulted to …") stays on the call whose argument it explains. A global's
// initializer is checked once early with its diagnostics discarded; its queued note has to be
// discarded with them, or an EARLIER refusal of the same message inherits it. EXACT message
// comparison, which `tests/cases/numerics/error-literal-default-note-stays-on-its-own-call.vl`
// cannot do: an `@error` directive matches by substring, and the bare sentence is a prefix of
// the noted one.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-literal-note-scope] skipped — missing vl binary or seed wasm.",
  );
}

type Diag = { severity: string; message: string };

const BARE = "argument 1: expected f32, got f64";
const noted = (line: number) =>
  BARE +
  ` — \`T\` on line ${line} has no annotation, so its literal defaulted to \`f64[]\`; ` +
  "annotate it: `const T: f32[] = …`";

// Every ERROR message the checker reports for `src`, in order.
const errorsOf = async (dir: string, src: string): Promise<string[]> => {
  const file = `${dir}/x.vl`;
  await Deno.writeTextFile(file, src);
  const { stdout } = await new Deno.Command(VL, {
    args: ["check", file, "--json", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const out = new TextDecoder().decode(stdout).trim();
  const parsed = JSON.parse(out) as Diag[];
  return parsed.filter((d) => d.severity === "error").map((d) => d.message);
};

const eq = (got: string[], want: string[], what: string) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

Deno.test({
  name:
    "literal-default note: an earlier refusal of the same message does not inherit it",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_lit_note_scope_" });
    try {
      // `g`'s argument is a call returning f64, which no literal explains.
      eq(
        await errorsOf(
          dir,
          "function one32(a: f32): f32 { a }\nfunction src(): f64 { 3.0 }\n" +
            "function g(): f32 { one32(src()) }\nconst T = [1.0, 0.0]\n" +
            "const z = one32(T[0])\nprint(g())\nprint(z)\n",
        ),
        [BARE, noted(4)],
        "the earlier call",
      );
      // Control: alone, the global's own call keeps its note.
      eq(
        await errorsOf(
          dir,
          "function one32(a: f32): f32 { a }\nconst T = [1.0, 0.0]\n" +
            "const z = one32(T[0])\nprint(z)\n",
        ),
        [noted(2)],
        "the global's own call",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
