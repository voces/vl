// EVERY FILE THAT EXECUTES EMITTED WASM IS CLASSIFIED (ROADMAP row 28).
//
// The row asked whether the corpus runner is redundant, and quoted a hand-count that had
// already gone stale: it said four standalone suites when there were five. `vl_std_process`
// arrived and nothing noticed, because nothing was counting.
//
// So the population is DERIVED by `scripts/wasm-runner-census.vl` and this holds it to a
// committed classification. A new file that imports `runWasm` or `casesWasmOracle`, or
// instantiates wasm itself, fails here until somebody says what it grades and by which
// compile path — which is the question the row turned out to hinge on, since two suites run
// corpus cells through the NATIVE `vl build` while the oracle compiles in-process.
//
// It runs no emitted wasm of its own: the census reads the tests directory and its own table.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed
// wasm, like the other native `vl_*` suites, because the census is a VL program.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-wasm-runner-census] skipped — missing vl binary or seed wasm.");
}

const census = async (args: string[] = []): Promise<{ code: number; out: string }> => {
  const p = new Deno.Command(VL, {
    args: ["run", `${ROOT}/scripts/wasm-runner-census.vl`, "--", ...args],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  });
  const r = await p.output();
  const dec = new TextDecoder();
  return { code: r.code, out: dec.decode(r.stdout) + dec.decode(r.stderr) };
};

Deno.test({
  name: "every wasm-executing test file is classified in the census",
  ignore: !ENABLED,
  fn: async () => {
    const { code, out } = await census();
    if (code !== 0) {
      throw new Error(
        "the wasm-runner census has an unclassified or stale entry — add or remove its row in\n" +
          "scripts/wasm-runner-census.vl's CLASSIFIED table, saying what the suite grades and\n" +
          "which compile path it uses:\n\n" + out,
      );
    }
    // Pin the derivation itself, so a census that stopped seeing files cannot pass empty.
    const m = out.match(/^files executing wasm: (\d+)$/m);
    if (!m || Number(m[1]) === 0) {
      throw new Error(`want a non-zero "files executing wasm: N" line, got:\n${out}`);
    }
  },
});

Deno.test({
  name: "the census's cell walk matches the oracle's own — one case per module directory",
  ignore: !ENABLED,
  fn: async () => {
    // The number this row has to hold fixed is the graded-cell SET, and a `.vl` glob is not
    // it: `casesWasmOracle`'s walk yields ONE case for a directory holding `entry.vl`. If the
    // two walks drift, a collapse could drop a module's cells and the count would still look
    // right.
    const { code, out } = await census(["--cells"]);
    if (code !== 0) throw new Error(`census --cells exited ${code}:\n${out}`);
    const lines = out.trim().split(/\r?\n/);
    const header = lines[0];
    const m = header.match(/^corpus cells graded by the oracle shards: (\d+)$/);
    if (!m) throw new Error(`census --cells header changed: ${header}`);
    const claimed = Number(m[1]);
    const listed = lines.length - 1;
    if (claimed !== listed) {
      throw new Error(`census --cells says ${claimed} but listed ${listed}`);
    }
    // Every module directory must appear as ONE trailing-slash entry, never as its files.
    const modules = lines.slice(1).filter((l) => l.endsWith("/"));
    if (modules.length === 0) {
      throw new Error("want at least one module-directory cell (a trailing-slash entry), got none");
    }
    for (const d of modules) {
      if (lines.includes(`${d}entry.vl`)) {
        throw new Error(`${d} is listed both as a module and as its own entry.vl`);
      }
    }
  },
});
