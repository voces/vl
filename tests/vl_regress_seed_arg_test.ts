// A MISSING SEED IS A USAGE ERROR, NEVER A GRADE.
//
// `regress.vl` takes the seed POSITIONALLY, so `regress.vl -- --verify-fresh` once bound the
// seed to the string `--verify-fresh` (in the Python it was ported from). Every one of the
// 7,565 corpus cells was then graded against a path that cannot instantiate, and the tool
// printed `4655 classes runs -> NOT-RUNS` — a catastrophic-looking answer produced by a
// correct instrument given the wrong input, and the single most alarming line this repo's
// ladder can emit. It was relayed to a coordinator as a possible mass regression.
//
// The fix is to refuse: the first argument must name an existing file, and anything else
// exits 2 with a message that names the argument. This is the guard's control — the exact
// invocation that produced the false alarm, asserted to refuse rather than to grade.
//
// No assertion library, per CLAUDE.md.

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const SCRIPT = "scripts/silent-sweep/distilled/regress.vl";
const ENABLED = exists(VL) && exists(COMPILER);

async function run(args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", SCRIPT, "--compiler", COMPILER, "--", ...args],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const d = new TextDecoder();
  return { code, out: d.decode(stdout) + d.decode(stderr) };
}

Deno.test({
  name: "regress.vl: a flag in the seed slot refuses instead of grading",
  ignore: !ENABLED,
  fn: async () => {
    const { code, out } = await run(["--verify-fresh"]);
    if (code !== 2) {
      throw new Error(
        `want exit 2 for a missing seed, got ${code}. Output:\n${
          out.slice(0, 600)
        }`,
      );
    }
    if (
      !out.includes("--verify-fresh") || !out.toLowerCase().includes("seed")
    ) {
      throw new Error(
        `the refusal must name the offending argument and the word "seed"; got:\n` +
          out.slice(0, 400),
      );
    }
    // The failure this guards against is a GRADE, so assert no grade was produced.
    if (/NOT-RUNS|classes|cells graded/i.test(out)) {
      throw new Error(
        `a missing seed must not grade anything; got:\n${out.slice(0, 600)}`,
      );
    }
  },
});

Deno.test({
  name: "regress.vl: a seed path that does not exist refuses too",
  ignore: !ENABLED,
  fn: async () => {
    const { code, out } = await run([
      "build/no-such-seed.wasm",
      "--verify-fresh",
    ]);
    if (code !== 2) {
      throw new Error(
        `want exit 2 for a non-existent seed path, got ${code}. Output:\n${
          out.slice(0, 600)
        }`,
      );
    }
    if (!out.includes("no-such-seed.wasm")) {
      throw new Error(
        `the refusal must name the path it was given; got:\n` +
          out.slice(0, 400),
      );
    }
  },
});
