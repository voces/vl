// `$VL_PROFILE_GUEST_SIGINT=1`: SIGINT stops a profiled compile at its next sample with a trap, so a
// hung build ends with the guest's backtrace and its profile written. The compile here is the
// compiler's own source, long enough to be interrupted mid-run.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed.

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const ENABLED = Deno.build.os !== "windows" &&
  Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1" && exists(VL) &&
  exists(COMPILER);

Deno.test({
  name:
    "profile sigint: a SIGINT stops the profiled guest with a trap and writes the profile",
  ignore: !ENABLED,
  async fn() {
    const dir = await Deno.makeTempDir();
    try {
      const out = `${dir}/p.json`;
      const child = new Deno.Command(VL, {
        args: [
          "check",
          "--codegen",
          "--compiler",
          COMPILER,
          "compiler/entry.vl",
        ],
        env: {
          ...nativeEnv(),
          VL_PROFILE_GUEST: out,
          VL_PROFILE_GUEST_SIGINT: "1",
        },
        cwd: ROOT,
        stdout: "null",
        stderr: "piped",
      }).spawn();
      await new Promise((r) => setTimeout(r, 3000));
      child.kill("SIGINT");
      const r = await child.output();
      const err = new TextDecoder().decode(r.stderr);
      if (r.success || !err.includes("stopped by SIGINT")) {
        throw new Error(
          `want a failed run naming the SIGINT stop\ngot rc ${r.code}:\n${
            err.slice(-2000)
          }`,
        );
      }
      if (!exists(out)) {
        throw new Error(
          `want the profile written at ${out}\ngot none:\n${err.slice(-2000)}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
