// Deterministic smoke run of the rep-layer fuzzer (`scripts/fuzz.ts`) — a fixed seed so it's part of
// the gate. The fuzzer's value is finding rep bugs the i32-only self-compile fixpoint can't (floats,
// i64, unions, closures, nullables, lists). Here we run a small fixed-seed batch and assert zero
// findings; `deno task fuzz` runs a large random batch for exploration. Skipped if the seed isn't built.
import { calibrate, fuzz, seedExists } from "../scripts/fuzz.ts";

Deno.test({
  name: "fuzz smoke — rep layer, fixed seed (0 findings expected)",
  ignore: !seedExists,
  fn: async () => {
    const calErr = await calibrate();
    if (calErr !== null) throw new Error(calErr);
    const { findings, reports } = await fuzz({ seed: 7, iters: 400 });
    if (findings !== 0) {
      throw new Error(
        `fuzzer found ${findings} rep-layer divergence(s):\n\n${
          reports.join("\n\n")
        }`,
      );
    }
  },
});
