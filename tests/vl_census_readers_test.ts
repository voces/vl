// The census readers under `scripts/silent-sweep/census/` (`delta`, `coverage`, `siblings`,
// `rescue`, `families`, `mkset`), held to the output of the Python they replaced.
//
// They were `.py` files until T3 of the architecture refactor. Each port was graded by
// running both over two real census blocks (28,224 cells, gradings synthesised over their
// coordinates, one block with 18 cells dropped from the after-grading) and mkset over the
// 79-cell `d243-moved` set: stdout and exit code were byte-identical. Three behaviours
// changed on purpose: a `%.Nf` tie rounds to even as Python's did (`pyFixed`), so that one
// agrees rather than differs; mkset prints a refusal on stdout where the Python raised it to
// stderr, because VL has no stderr sink; and mkset's manifest `block` is the set's file name,
// where the Python wrote `d243-moved` for every set.
//
// `fixtures/census-readers/input.json` is 100 cells from those blocks, a six-cell grid and
// three sets; each `<case>.txt` is the Python's output on it, recorded before it was deleted.
//
// @test-timing native

import { builtScript } from "./support/builtScript.ts";
import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-census-readers] skipped — missing vl binary or seed wasm.");
}

const FIX = `${ROOT}/tests/fixtures/census-readers`;
const dec = new TextDecoder();

type Block = { manifest: unknown; sources: Record<string, string> };
type Input = { dirs: Record<string, Block>; files: Record<string, unknown> };

const CASES: { name: string; tool: string; args: string[]; code: number }[] = [
  {
    name: "delta-a",
    tool: "delta",
    args: ["a", "a.before.json", "a.after.json"],
    code: 0,
  },
  {
    name: "delta-b",
    tool: "delta",
    args: ["b", "b.before.json", "b.after.json", "--limit", "2"],
    code: 0,
  },
  { name: "coverage", tool: "coverage", args: ["a", "b"], code: 0 },
  {
    name: "siblings",
    tool: "siblings",
    args: ["a", "a.after.json", "b", "b.after.json"],
    code: 0,
  },
  {
    name: "rescue",
    tool: "rescue",
    args: ["a", "a.before.json", "b", "b.before.json"],
    code: 0,
  },
  {
    name: "rescue-none",
    tool: "rescue",
    args: ["b", "b.dark.json"],
    code: 0,
  },
  {
    name: "families",
    tool: "families",
    args: ["a", "a.before.json", "b", "b.before.json"],
    code: 0,
  },
  { name: "mkset", tool: "mkset", args: ["out", "set.json", "grid"], code: 0 },
  {
    name: "mkset-stale",
    tool: "mkset",
    args: ["out2", "stale.json", "grid"],
    code: 1,
  },
  {
    name: "mkset-absent",
    tool: "mkset",
    args: ["out3", "absent.json", "grid"],
    code: 1,
  },
];

// The fixture's blocks, gradings and sets written out as files under `dir`.
const materialise = async (dir: string) => {
  const input: Input = JSON.parse(
    await Deno.readTextFile(`${FIX}/input.json`),
  );
  for (const [d, b] of Object.entries(input.dirs)) {
    await Deno.mkdir(`${dir}/${d}`);
    await Deno.writeTextFile(
      `${dir}/${d}/manifest.json`,
      JSON.stringify(b.manifest),
    );
    for (const [n, s] of Object.entries(b.sources)) {
      await Deno.writeTextFile(`${dir}/${d}/${n}.vl`, s);
    }
  }
  for (const [f, v] of Object.entries(input.files)) {
    await Deno.writeTextFile(`${dir}/${f}`, JSON.stringify(v));
  }
};

Deno.test({
  name: "census readers: every tool prints what its Python printed",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_census_readers_" });
    try {
      await materialise(dir);
      const bad: string[] = [];
      for (const c of CASES) {
        const { code, stdout } = await new Deno.Command(VL, {
          args: [
            "run",
            await builtScript(`${ROOT}/scripts/silent-sweep/census/${c.tool}.vl`, {
              compiler: null,
            }),
            "--",
            ...c.args,
          ],
          cwd: dir,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1" }),
        }).output();
        const out = dec.decode(stdout);
        const want = await Deno.readTextFile(`${FIX}/${c.name}.txt`);
        if (code !== c.code || out !== want) {
          bad.push(
            `[${c.name}] want exit ${c.code}:\n${want}got exit ${code}:\n${out}`,
          );
        }
      }
      if (bad.length > 0) throw new Error(bad.join("\n\n"));
      const manifest = await Deno.readTextFile(`${dir}/out/manifest.json`);
      const wantManifest = await Deno.readTextFile(
        `${FIX}/mkset-manifest.json`,
      );
      if (manifest !== wantManifest) {
        bad.push(
          `[mkset manifest] want:\n${wantManifest}\ngot:\n${manifest}`,
        );
      }
      const input: Input = JSON.parse(
        await Deno.readTextFile(`${FIX}/input.json`),
      );
      const set = input.files["set.json"] as { cells: Record<string, unknown> };
      for (const n of Object.keys(set.cells)) {
        const got = await Deno.readTextFile(`${dir}/out/${n}.vl`);
        if (got !== input.dirs.grid.sources[n]) {
          bad.push(`[mkset copy] ${n}.vl differs from the grid's`);
        }
      }
      if (bad.length > 0) throw new Error(bad.join("\n\n"));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
