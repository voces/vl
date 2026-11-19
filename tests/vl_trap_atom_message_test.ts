// What `__trap__(<atom>)` prints before it aborts: the member's text (D17024). The corpus `@trap`
// directive sees only the abort, so tests/cases/traps/trap-atom-message.vl pins THAT it traps and
// this file pins WHAT it says.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the built binary plus the seed;
// absent either, the case registers as ignored.
//
// @test-timing native

import { COMPILER, exists, ROOT, seedEnv, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[trap-atom-message] skipped — missing vl binary or seed wasm.");
}

Deno.test({
  name: "__trap__ of a literal-union atom prints its member text",
  ignore: !ENABLED,
  fn: async () => {
    const { code, stdout } = await new Deno.Command(VL, {
      args: [
        "run",
        `${ROOT}/tests/cases/traps/trap-atom-message.vl`,
        "--compiler",
        COMPILER,
      ],
      stdout: "piped",
      stderr: "piped",
      cwd: ROOT,
      env: {
        RUST_BACKTRACE: "0",
        NO_COLOR: "1",
        VL_STD: `${ROOT}/std`,
        ...seedEnv(),
      },
      clearEnv: true,
    }).output();
    const out = new TextDecoder().decode(stdout);
    if (code === 0) {
      throw new Error(`want a trap, got exit 0; stdout ${JSON.stringify(out)}`);
    }
    if (out !== "full\n") {
      throw new Error(`want stdout "full\\n", got ${JSON.stringify(out)}`);
    }
  },
});
