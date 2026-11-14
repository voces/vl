// A NATIVE RUN WITH NO SEED IS RED, NOT GREEN. Every seed-backed suite self-ignores when the
// `vl` binary or `build/vl-compiler.wasm` is absent, so a `SELFHOST_NATIVE_ALIGN=1` run (the
// gate's native row, ci-native) that lost either would skip them all and pass. This test is the
// one that fails instead, naming what is missing.
//
// Without `SELFHOST_NATIVE_ALIGN=1` it is ignored, and that is deliberate: the `ci` job runs
// `deno task test` with no seed by design (ci-native builds the host before the seed exists), so a
// fresh clone's `deno task test` grades only the seedless suites. ci-native grades the rest, and
// `tests/ci_seed_coverage_test.ts` fails when a seed-backed test is wired into no ci-native step.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native` auto-discovers.
//
// @test-timing native

import { COMPILER, exists, VL } from "./support/tree.ts";

Deno.test({
  name: "a native run has the vl binary and the seed it grades",
  ignore: Deno.env.get("SELFHOST_NATIVE_ALIGN") !== "1",
  fn() {
    const missing = [VL, COMPILER].filter((p) => !exists(p));
    if (missing.length > 0) {
      throw new Error(
        `SELFHOST_NATIVE_ALIGN=1, but every seed-backed suite would skip: missing ${
          missing.join(", ")
        } (build the host with cargo, then scripts/fetch-seed.sh or scripts/refresh-compiler.sh)`,
      );
    }
  },
});
