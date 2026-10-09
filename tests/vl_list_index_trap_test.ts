// WHERE a list index out of range traps, and what was printed before it.
//
// A list read or write tests `i u< len` and branches to an out-of-line read at -1 when it
// fails, so the trap is the engine's own `out of bounds array access` (SP-056). The corpus
// `@trap` directive sees only that the case aborts; this file pins the stdout before the
// abort, which is what moves if the test ever fires early or late, and the host's trap line
// and note. Each expected stdout was the output of the compiler before the change, line for line.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the built binary plus the seed;
// absent either, every case registers as ignored.
//
// @test-timing native

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[list-index-trap] skipped — missing vl binary or seed wasm.");
}

const runCase = async (
  name: string,
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", `${ROOT}/tests/cases/lists/${name}`, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    cwd: ROOT,
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
    clearEnv: true,
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

// [case, its stdout before the trap]
const CASES: [string, string[]][] = [
  ["index-guard-trap-first-iteration.vl", ["start"]],
  ["index-guard-trap-last-iteration.vl", ["b", "c"]],
  ["index-guard-trap-middle-iteration.vl", ["2.5", "3.5", "4.5"]],
  ["index-guard-trap-mutated-in-loop.vl", ["1", "2"]],
  ["index-guard-trap-negative.vl", ["5"]],
  ["index-guard-trap-nested.vl", ["1", "2", "3", "4", "5"]],
  ["index-guard-trap-partial-writes.vl", ["3", "9", "9", "9"]],
  ["index-guard-trap-reps.vl", ["2", "3", "0.5", "9"]],
  ["index-guard-trap-slack.vl", ["3", "1", "2", "3"]],
  ["index-guard-trap-u8.vl", ["1", "2"]],
  ["index-guard-trap-wraparound.vl", ["0", "7", "1", "8", "0"]],
];

for (const [name, want] of CASES) {
  Deno.test({
    name: `a list index out of range traps in place: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      const { code, out, err } = await runCase(name);
      const got = out.split("\n").filter((l) => l.length > 0);
      if (code === 0) {
        throw new Error(
          `${name} exited 0 — the index did not trap.\n  stdout: ${
            JSON.stringify(got)
          }`,
        );
      }
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(
          `${name}: the stdout before the trap moved.\n` +
            `  want: ${JSON.stringify(want)}\n  got:  ${JSON.stringify(got)}`,
        );
      }
      for (
        const line of [
          "wasm trap: out of bounds array access",
          "an index outside the bounds",
        ]
      ) {
        if (!err.includes(line)) {
          throw new Error(
            `${name}: the trap is not the engine's bounds trap.\n` +
              `  want stderr to contain: ${JSON.stringify(line)}\n  got: ${
                JSON.stringify(err)
              }`,
          );
        }
      }
    },
  });
}
