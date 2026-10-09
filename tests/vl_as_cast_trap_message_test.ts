// The REASON a failed `as!` prints before it aborts, and the host's note after it.
//
// Every `as!` site calls one `__as_fail__` helper with its place and domain, which prints
// `as! <T> at <line>:<col>: not exact` (SP-056). The corpus `@trap` directive sees only the
// abort, so the corpus cases pin THAT each cast traps and this file pins WHAT it says. An
// integral float operand out of i32's or i64's range traps at the conversion itself, so the
// host's note names the range there; every other site traps at `unreachable`.
//
// The witnesses are the corpus files themselves, run rather than retyped.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the built binary plus the seed;
// absent either, every case registers as ignored.
//
// @test-timing native

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[as-cast-trap-message] skipped — missing vl binary or seed wasm.",
  );
}

// `vl run` over a corpus case, with std pinned to THIS tree (an agent worktree's host binary
// would otherwise resolve `std:` from the checkout it lives in).
const runCase = async (
  name: string,
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "run",
      `${ROOT}/tests/cases/numerics/${name}`,
      "--compiler",
      COMPILER,
    ],
    stdout: "piped",
    stderr: "piped",
    cwd: ROOT,
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
    clearEnv: true,
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

// [case, the reason on stdout, a phrase of the host's note on stderr]
const CASES: [string, string, string][] = [
  [
    "as-cast-trap-fraction.vl",
    "as! i32 at 17:16: not exact",
    "compiler-emitted trap",
  ],
  [
    "as-cast-u8-trap-range.vl",
    "as! u8 at 14:15: not exact",
    "compiler-emitted trap",
  ],
  [
    "as-cast-integral-operand-trap-range.vl",
    "as! i32 at 8:10: not exact",
    "outside",
  ],
  [
    "as-cast-integral-operand-trap-nan.vl",
    "as! i32 at 8:10: not exact",
    "NaN or",
  ],
  [
    "as-cast-integral-operand-trap-u8.vl",
    "as! u8 at 7:30: not exact",
    "compiler-emitted trap",
  ],
  [
    "as-cast-integral-operand-trap-shadowed.vl",
    "as! i32 at 7:24: not exact",
    "compiler-emitted trap",
  ],
];

for (const [name, want, note] of CASES) {
  Deno.test({
    name: `as! names its failure: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      const { code, out, err } = await runCase(name);
      if (code === 0) {
        throw new Error(
          `${name} exited 0 — the cast did not trap.\n  stdout: ${
            JSON.stringify(out)
          }`,
        );
      }
      if (!out.includes(want)) {
        throw new Error(
          `${name} trapped without its reason.\n` +
            `  want stdout to contain: ${JSON.stringify(want)}\n` +
            `  got:                    ${JSON.stringify(out)}`,
        );
      }
      if (!err.includes(note)) {
        throw new Error(
          `${name}: the host's note changed.\n` +
            `  want stderr to contain: ${JSON.stringify(note)}\n` +
            `  got:                    ${JSON.stringify(err)}`,
        );
      }
    },
  });
}
