// The SENTENCE a module global read or written before its initializer ran prints before it
// aborts (D2652, D2654).
//
// The corpus `@trap` directive sees only the abort, and before the guard a non-null reference
// global already aborted (an anonymous `null reference`), so its fixture reads the same either
// way. This file pins WHAT each one says: the global, where it is declared, and the function
// that read it. The witnesses are the corpus files themselves, run rather than retyped.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the built binary plus the seed;
// absent either, every case registers as ignored.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[global-read-before-init-message] skipped — missing vl binary or seed wasm.",
  );
}

const runCase = async (
  name: string,
): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["run", `${ROOT}/tests/cases/${name}`, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    cwd: ROOT,
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
    clearEnv: true,
  }).output();
  return { code, out: new TextDecoder().decode(stdout) };
};

// Each file's whole stdout: the guard fires before the first `print` completes, so nothing
// the program would have printed from the zero default reaches the output.
const CASES: [string, string][] = [
  [
    "globals/read-before-init-scalar-traps.vl",
    "`n` read before its initializer ran (line 7), via rn\n",
  ],
  [
    "globals/read-before-init-string-traps.vl",
    "`ls` read before its initializer ran (line 7), via rs\n",
  ],
  [
    "globals/read-before-init-nullable-traps.vl",
    "`g` read before its initializer ran (line 7), via r\n",
  ],
  [
    "globals/read-before-init-via-closure-traps.vl",
    "`g` read before its initializer ran (line 7), via a closure\n",
  ],
  [
    "globals/read-before-init-in-loop-traps.vl",
    "`g` read before its initializer ran (line 8), via r1\n",
  ],
  [
    "globals/read-before-init-from-initializer-traps.vl",
    "`g` read before its initializer ran (line 7), via r\n",
  ],
  // A write the initializer would overwrite says so too (D2654).
  [
    "globals/write-before-init-traps.vl",
    "`n` written before its initializer ran (line 7), via setN\n",
  ],
  [
    "globals/write-before-init-via-closure-traps.vl",
    "`s` written before its initializer ran (line 8), via a closure\n",
  ],
  // A folded `let` has no start-time store, so only its writes are guarded.
  [
    "globals/write-before-folded-let-traps.vl",
    "`g` written before its initializer ran (line 7), via setG\n",
  ],
  // D30's recursion witness: it must still compile, and running it now writes early.
  [
    "maps/inferred-map-return-recursion-write-before-init.vl",
    "`gc` written before its initializer ran (line 15), via fc\n",
  ],
];

for (const [name, want] of CASES) {
  Deno.test({
    name: `a global read before its initializer names itself: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      const { code, out } = await runCase(name);
      if (code === 0) {
        throw new Error(
          `${name} exited 0 — the early read was not refused.\n` +
            `  stdout: ${JSON.stringify(out)}`,
        );
      }
      if (out !== want) {
        throw new Error(
          `${name} trapped without its exact message.\n` +
            `  want stdout: ${JSON.stringify(want)}\n` +
            `  got:         ${JSON.stringify(out)}`,
        );
      }
    },
  });
}
