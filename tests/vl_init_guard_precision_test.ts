// WHICH globals take the read-before-init guard (D2652), not what it says.
//
// The corpus `@run` directive cannot see a guard that never fires: a program whose global is
// guarded needlessly prints the same output, and pays a progress-cell load per read. This
// file builds each witness with `--names` and asks whether the module carries the
// `__init_fail__` helper, which the emitter adds only when some global is guarded. The
// `unguarded` witnesses are reads `initGuardScan` once over-approximated by name; the
// `guarded` ones are their controls, which must keep the guard (each also traps in the corpus).
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the built binary plus the seed;
// absent either, every case registers as ignored.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, seedEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[init-guard-precision] skipped — missing vl binary or seed wasm.");
}

const hasGuard = async (name: string): Promise<boolean> => {
  const out = await Deno.makeTempFile({ suffix: ".wasm" });
  try {
    const { code, stderr } = await new Deno.Command(VL, {
      args: ["build", `${ROOT}/tests/cases/${name}`, "--names", "-o", out, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
      cwd: ROOT,
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std`, ...seedEnv() },
      clearEnv: true,
    }).output();
    if (code !== 0) {
      throw new Error(`${name}: build failed (${code}): ${new TextDecoder().decode(stderr)}`);
    }
    const bytes = new TextDecoder("latin1").decode(await Deno.readFile(out));
    return bytes.includes("__init_fail__");
  } finally {
    await Deno.remove(out);
  }
};

const CASES: [string, boolean][] = [
  // A field read named like a free function is not a call of it.
  ["globals/guard-member-name-not-a-call.vl", false],
  // A module lambda's body runs when its binding is called, not where it is created.
  ["globals/guard-module-lambda-called-after-init.vl", false],
  // The statement assigning a no-initializer `let` does not read it.
  ["globals/guard-assign-target-not-a-read.vl", false],
  // Controls: a dot-syntax call, and a module lambda escaping before the declaration.
  ["globals/read-before-init-via-method-traps.vl", true],
  ["globals/read-before-init-via-module-lambda-traps.vl", true],
  ["globals/read-before-init-via-closure-traps.vl", true],
  ["globals/write-before-init-via-closure-traps.vl", true],
];

for (const [name, want] of CASES) {
  Deno.test({
    name: `init guard: ${name} ${want ? "guarded" : "unguarded"}`,
    ignore: !ENABLED,
    fn: async () => {
      const got = await hasGuard(name);
      if (got !== want) {
        throw new Error(`${name}: want guard=${want}, got guard=${got}`);
      }
    },
  });
}
