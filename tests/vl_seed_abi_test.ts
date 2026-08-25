// THE HOST↔SEED ABI STAMP — phase 1: the seed exports it.
//
// `compiler/driver.vl`'s `hostAbi()` is the generation number a `vl` binary will
// check before it trusts a seed. This file pins the half that ships first: the
// export exists, is callable, and answers the number the tree says it should.
//
// WHY THE STAMP EXISTS. #1848 changed a string's element unit from a UTF-32 code
// point to a UTF-8 byte. It added, removed and re-typed NOTHING, so every export
// the host probes for is still present with the same signature and the ABI
// negotiation reports "compatible" — the host then reads `4 * count` bytes where
// the seed wrote `count`. The overshoot lands in the host's own leftover UTF-32
// image of the last file it staged, which decodes perfectly, so a stale
// `vl test` printed readable chunks of `std/test.vl` and EXITED 0. A working
// feature was graded as broken on that output before the binary was suspected.
//
// WHY THIS LANDS BEFORE THE CHECK THAT USES IT. `refresh-compiler.sh` bootstraps
// by compiling the current source with the RELEASE seed (`fetch-seed.sh`), and CI
// does exactly that. A host that errored on a seed with no stamp would therefore
// fail on the very PR that introduced the stamp, because the released seed cannot
// carry it yet. So the export ships first and the rolling seed republishes with
// it; the host-side check is a separate change once `seed-latest` answers.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native`
// auto-discovers, and a seed-backed test matching no glob runs nowhere.
import { assertEquals } from "jsr:@std/assert";

const SEED = "build/vl-compiler.wasm";

// The generation this tree speaks. Bump here, in `compiler/driver.vl`'s
// `hostAbi()`, and in the host's `HOST_ABI`, all in the SAME commit that changes
// the contract — the string element unit, the bulk Load/Store packing, or the
// `CMD_*` table.
const EXPECTED_ABI = 2;

const seedPresent = await Deno.stat(SEED).then(() => true).catch(() => false);

Deno.test({
  name: "seed exports hostAbi() and it matches the tree's generation",
  ignore: !seedPresent,
  fn: async () => {
    const bytes = await Deno.readFile(SEED);
    const module = await WebAssembly.compile(bytes);

    const exported = WebAssembly.Module.exports(module)
      .filter((e) => e.name === "hostAbi");
    assertEquals(
      exported.length,
      1,
      "the seed must export `hostAbi` — without it a host cannot tell a " +
        "contract-compatible seed from one that will silently mis-decode " +
        "every string it hands back",
    );
    assertEquals(exported[0].kind, "function");

    const inst = await WebAssembly.instantiate(module, {});
    const hostAbi = inst.exports.hostAbi as () => number;
    assertEquals(
      hostAbi(),
      EXPECTED_ABI,
      "`hostAbi()` disagrees with this test's EXPECTED_ABI. If you changed the " +
        "host<->seed contract on purpose, bump BOTH here and in the host's " +
        "HOST_ABI in the same commit; if you did not, the seed is stale — " +
        "run scripts/refresh-compiler.sh.",
    );
  },
});
