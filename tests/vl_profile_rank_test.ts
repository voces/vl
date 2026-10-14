// `scripts/profile-rank.vl`, held to fixed output over a hand-built profile.
//
// The tool was `scripts/profile-rank.py` until T3 of the architecture refactor. The port was
// graded by running both, output for output, before the Python was deleted: stdout and exit
// code were byte-identical on six real `VL_PROFILE_GUEST` profiles (a `check` and an alloc
// `build` of `std/json.vl`, a `check` of `std/fmt.vl` on a seed without names, and a sample and
// an alloc profile of `vl check compiler/entry.vl` — 644 and 739 ranked rows with every row
// printed, ties included), and on the fixture below in both modes. Where they could not agree,
// pinned here as the port's own behaviour:
//
//   1. THE ROUNDING TIE. Both round the same double to two places; `std:fmt`'s `toFixed` breaks
//      an exact tie away from zero, the Python's `%.2f` broke it to even. The `--alloc` case
//      below is built to land on two ties: `h` is 1 byte of 800 (exactly 0.125%), printed
//      `0.13` where the Python printed `0.12`, and `f`'s INCL is exactly 62.625%, printed
//      `62.63` where the Python printed `62.62`. `g`'s 37.375% is a tie both round up.
//   2. THE STREAM AND CODE OF A LOUD FAILURE. VL has no stderr sink, so the usage line and every
//      error go to stdout. The usage line replaces the Python's docstring; a missing file, a
//      non-JSON or non-profile file, and a non-integer `top` exit 2 with one line where the
//      Python raised a traceback and exited 1.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-profile-rank] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();

// Names live in the SHARED table (the thread's own is empty, which counts as absent); node 2
// is `f` called from `f`, so INCL must count `f` once per sample; one sample has no stack.
const FIXTURE = {
  meta: {},
  shared: { stringArray: ["root", "f", "g", "h"] },
  threads: [{
    stringArray: [],
    funcTable: { name: [0, 1, 2, 3] },
    frameTable: { func: [0, 1, 2, 3] },
    stackTable: { frame: [0, 1, 1, 2, 3], prefix: [null, 0, 1, 0, 2] },
    samples: {
      stack: [1, 3, null, 2, 4, 3, 1, 0],
      threadCPUDelta: [400, 199, 5, 100, 1, 100, 0, 0],
    },
  }],
};

const run = async (
  argv: string[],
): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: [
      "run",
      "scripts/profile-rank.vl",
      "--compiler",
      COMPILER,
      "--",
      ...argv,
    ],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, out: dec.decode(stdout) };
};

const lines = (...ls: string[]): string => ls.join("\n") + "\n";

Deno.test({
  name:
    "profile-rank: SELF and INCL over a fixed profile, by samples and by --alloc",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_profile_rank_" });
    try {
      const prof = `${dir}/p.json`;
      await Deno.writeTextFile(prof, JSON.stringify(FIXTURE));
      const notJson = `${dir}/bad.json`;
      await Deno.writeTextFile(notJson, "{");
      const cases: { argv: string[]; code: number; out: string }[] = [
        {
          argv: [prof],
          code: 0,
          out: lines(
            "7 samples",
            "  self%   incl%  function",
            "  42.86   57.14  f",
            "  28.57   28.57  g",
            "  14.29   14.29  h",
            "  14.29  100.00  root",
          ),
        },
        {
          argv: [prof, "2"],
          code: 0,
          out: lines(
            "7 samples",
            "  self%   incl%  function",
            "  42.86   57.14  f",
            "  28.57   28.57  g",
          ),
        },
        {
          argv: [prof, "--alloc"],
          code: 0,
          out: lines(
            "0.8 MB allocated",
            "  self%   incl%  function",
            "  62.50   62.63  f",
            "  37.38   37.38  g",
            "   0.13    0.13  h",
            "   0.00  100.00  root",
          ),
        },
        {
          argv: [],
          code: 2,
          out: lines(
            "usage: vl run scripts/profile-rank.vl -- <profile.json> [top] [--alloc]",
          ),
        },
        {
          argv: [prof, "xx"],
          code: 2,
          out: lines("profile-rank: top is not an integer: xx"),
        },
        { argv: [notJson], code: 2, out: "" },
      ];
      for (const c of cases) {
        const { code, out } = await run(c.argv);
        const name = c.argv.map((a) => a.replace(dir, "<dir>")).join(" ");
        if (code !== c.code) {
          throw new Error(
            `[${name}] want exit ${c.code}, got ${code}:\n${out}`,
          );
        }
        const ok = c.out === ""
          ? out.startsWith(`profile-rank: ${notJson} is not JSON`)
          : out === c.out;
        if (!ok) {
          throw new Error(
            `[${name}] want:\n${c.out || "a not-JSON line"}\ngot:\n${out}`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
