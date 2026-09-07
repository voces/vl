// EVERY FILE THAT EXECUTES EMITTED WASM IS CLASSIFIED (ROADMAP row 28).
//
// The row asked whether the corpus runner is redundant, and quoted a hand-count that had
// already gone stale: it said four standalone suites when there were five. `vl_std_process`
// arrived and nothing noticed, because nothing was counting.
//
// So the population is DERIVED by `scripts/wasm-runner-census.py` and this holds it to a
// committed classification. A new file that imports `runWasm` or `casesWasmOracle`, or
// instantiates wasm itself, fails here until somebody says what it grades and by which
// compile path — which is the question the row turned out to hinge on, since two suites run
// corpus cells through the NATIVE `vl build` while the oracle compiles in-process.
//
// It runs no wasm of its own: it reads the tests directory and the census's own table, so it
// costs milliseconds and cannot self-ignore for want of a seed.
//
// @test-timing instrument

import { ROOT, pythonBin } from "./support/tree.ts";

const census = async (args: string[] = []): Promise<{ code: number; out: string }> => {
  const p = new Deno.Command(pythonBin(), {
    args: [`${ROOT}/scripts/wasm-runner-census.py`, ...args],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  const r = await p.output();
  const dec = new TextDecoder();
  return { code: r.code, out: dec.decode(r.stdout) + dec.decode(r.stderr) };
};

Deno.test("every wasm-executing test file is classified in the census", async () => {
  const { code, out } = await census();
  if (code !== 0) {
    throw new Error(
      "the wasm-runner census has an unclassified or stale entry — add or remove its row in\n" +
        "scripts/wasm-runner-census.py's CLASSIFIED table, saying what the suite grades and\n" +
        "which compile path it uses:\n\n" + out,
    );
  }
});

Deno.test("the census's cell walk matches the oracle's own — one case per module directory", async () => {
  // The number this row has to hold fixed is the graded-cell SET, and a `.vl` glob is not it:
  // `casesWasmOracle`'s walk yields ONE case for a directory holding `entry.vl`. If the two
  // walks drift, a collapse could drop a module's cells and the count would still look right.
  const { out } = await census(["--cells"]);
  const lines = out.trim().split("\n");
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
  for (const d of modules) {
    if (lines.includes(`${d}entry.vl`)) {
      throw new Error(`${d} is listed both as a module and as its own entry.vl`);
    }
  }
});
