// A function or start body the IR does not claim fails the build: there is no other lowering, so
// `$VL_IR_REQUIRE_CLAIM=1` changes nothing. The decline is driven by `$VL_TEST_CLAIM_REFUSAL=1`
// (every claim refuses before its body lowers), so the test does not depend on an open coverage
// gap; the control is the same program with every claim taken. No assertion library, per CLAUDE.md.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-ir-require-claim] skipped: missing vl binary or seed wasm.",
  );
}

const SRC =
  `function add(a: i32, b: i32): i32 { return a + b }\nprint(add(1, 2))\n`;

type Res = { code: number; out: string; err: string };

const run = async (env: Record<string, string>): Promise<Res> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_ir_require_claim_" });
  try {
    const p = `${dir}/t.vl`;
    await Deno.writeTextFile(p, SRC);
    const { code, stdout, stderr } = await new Deno.Command(VL, {
      args: ["run", p, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
      env: nativeEnv({
        NO_COLOR: "1",
        VL_NO_CACHE: "1",
        VL_IR_STRICT: "",
        VL_IR_REQUIRE_CLAIM: "",
        VL_TEST_CLAIM_REFUSAL: "",
        ...env,
      }),
    }).output();
    return {
      code,
      out: new TextDecoder().decode(stdout),
      err: new TextDecoder().decode(stderr),
    };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name: "ir-require-claim: a declined unit fails, with or without the switch",
  ignore: !ENABLED,
  fn: async () => {
    const declined = { VL_TEST_CLAIM_REFUSAL: "1" };
    for (const sw of ["", "1"]) {
      const r = await run({ ...declined, VL_IR_REQUIRE_CLAIM: sw });
      if (r.code === 0) {
        throw new Error(
          `VL_IR_REQUIRE_CLAIM="${sw}": want a declined unit refused, got rc 0: ${r.out}`,
        );
      }
      // A claim that met a refusal fails with that refusal, verbatim.
      if (!r.err.includes("test claim refusal before the body")) {
        throw new Error(
          `VL_IR_REQUIRE_CLAIM="${sw}": want the claim's own refusal, got: ${r.err}`,
        );
      }
    }
  },
});

Deno.test({
  name: "ir-require-claim: a program the IR claims whole runs under the switch",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run({ VL_IR_REQUIRE_CLAIM: "1" });
    if (r.code !== 0 || r.out.trim() !== "3") {
      throw new Error(
        `want rc 0 printing 3, got rc ${r.code}: ${r.out}${r.err}`,
      );
    }
  },
});
