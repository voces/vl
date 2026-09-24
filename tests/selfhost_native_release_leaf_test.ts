// `-O` INLINES LEAF HELPERS (plumb PL-027; DECISIONS.md, "`-O` inlines leaf helpers").
//
// Binaryen's `-O` inlines a multi-caller function only at size 2 or less, so a helper like
// `rg(i) = __load_i64__(CTX + i * 8)` stayed a call at every use — thousands per plumb unit,
// and 13.6% of its V8 profile — while `-O3` inlined it. The host now raises the size for `-O`
// alone. What is pinned here is that SHAPE: no call to any of the fixture's three helpers
// survives `-O` (or `-O3`), and the program's output is unchanged. A timing cannot be gated.
//
// The CONTROL runs a bare binaryen `-O` and must find the calls kept: otherwise a fixture
// binaryen would inline anyway passes whether or not the host passes the size.
//
// @test-timing opt
import {
  ENABLED,
  logsOf,
  ROOT,
  rustList,
  vl,
  WASM_DIS,
  WASM_OPT,
} from "./support/nativeRelease.ts";

const SRC = `${ROOT}/tests/fixtures/opt-leaf/leaf-helpers.vl`;
const HELPERS = ["st8", "rg", "sr"];

// The helpers still called in a `--names` disassembly. A `--names` function is `$<name>@<line>`.
const helperCalls = (wat: string): string[] =>
  [...wat.matchAll(/\((?:return_)?call \$([A-Za-z0-9_]+)[@$\s)]/g)]
    .map((m) => m[1])
    .filter((n) => HELPERS.includes(n));

const run = async (bin: string, args: string[]) => {
  const p = await new Deno.Command(bin, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code: p.code, out: dec.decode(p.stdout), err: dec.decode(p.stderr) };
};

Deno.test({
  name:
    "native-release: -O inlines a five-to-seven-instruction leaf helper at every call site",
  ignore: !ENABLED,
  fn: async () => {
    const want = logsOf(Deno.readTextFileSync(SRC));
    const tmp = await Deno.makeTempDir();
    try {
      for (const rung of ["-O", "-O3"]) {
        const out = `${tmp}/m${rung}.wasm`;
        const b = await vl(["build", SRC, rung, "--names", "--wat", "-o", out]);
        if (b.code !== 0) {
          throw new Error(`${rung}: vl build failed: ${b.err.trim()}`);
        }
        const left = helperCalls(Deno.readTextFileSync(`${tmp}/m${rung}.wat`));
        if (left.length !== 0) {
          throw new Error(
            `${rung}: leaf helpers are still called\n` +
              `  want: no call to ${
                HELPERS.join(", ")
              }\n  got:  ${left.length} (${left.join(", ")})`,
          );
        }
        const r = await vl(["run", out]);
        const got = r.out.replace(/\n$/, "").split("\n");
        if (r.code !== 0 || JSON.stringify(got) !== JSON.stringify(want)) {
          throw new Error(
            `${rung}: want ${JSON.stringify(want)}, got ${
              JSON.stringify(got)
            } rc=${r.code}`,
          );
        }
      }

      // CONTROL: binaryen's own `-O`, without the host's size, keeps every helper a call.
      const mainRs = Deno.readTextFileSync(
        `${ROOT}/scripts/vl-host/src/main.rs`,
      );
      const features = rustList(mainRs, "BINARYEN_FEATURES");
      if (
        !rustList(mainRs, "OPT_PASSES").includes(
          "--always-inline-max-function-size",
        )
      ) {
        throw new Error(
          "OPT_PASSES no longer raises --always-inline-max-function-size",
        );
      }
      const plain = `${tmp}/plain.wasm`;
      const b = await vl(["build", SRC, "--names", "-o", plain]);
      if (b.code !== 0) {
        throw new Error(`plain vl build failed: ${b.err.trim()}`);
      }
      const opt = await run(WASM_OPT, [
        plain,
        "-g",
        "-O",
        ...features,
        "-o",
        `${tmp}/c.wasm`,
      ]);
      if (opt.code !== 0) {
        throw new Error(`control wasm-opt failed: ${opt.err.trim()}`);
      }
      const dis = await run(WASM_DIS, [`${tmp}/c.wasm`, ...features]);
      const kept = new Set(helperCalls(dis.out));
      const missing = HELPERS.filter((h) => !kept.has(h));
      if (missing.length !== 0) {
        throw new Error(
          `CONTROL — a bare -O already inlines ${
            missing.join(", ")
          }, so this fixture no longer\n` +
            "  exercises the host's inline size; give the helper a shape binaryen keeps as a call",
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
