// `scripts/ladder-census.vl` and `scripts/rep-classifier-census.vl`, the two discovery
// censuses over `compiler/*.vl`, held to the output of the Python they replaced.
//
// Both ports were graded against the `.py` on the real `compiler/` in every mode (each
// section, `--min`, `--top`, `--find`, `--reads`, `--why`, `--deep`, `--json`,
// `--all-compiler`): stdout and exit code were byte-identical. The one change is that a
// `--why` miss prints on stdout, because VL has no stderr sink.
//
// `fixtures/ladder-census/compiler/` is a made-up compiler tree that has a ladder of each
// ending, a split walk, a predicate ladder, `match` ladders and a rep classifier of each
// result class. Each `out/<case>.txt` is the Python's output on it, recorded before it was
// deleted. The scripts read `compiler/` against the working directory.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-ladder-census] skipped — missing vl binary or seed wasm.");
}

const FIX = `${ROOT}/tests/fixtures/ladder-census`;
const dec = new TextDecoder();

const LC = "ladder-census";
const RC = "rep-classifier-census";
const CASES: { name: string; tool: string; args: string[]; code: number }[] = [
  { name: "lc-default", tool: LC, args: [], code: 0 },
  { name: "lc-sets", tool: LC, args: ["--sets"], code: 0 },
  { name: "lc-split", tool: LC, args: ["--split"], code: 0 },
  { name: "lc-pred", tool: LC, args: ["--pred"], code: 0 },
  { name: "lc-list", tool: LC, args: ["--list"], code: 0 },
  { name: "lc-top1", tool: LC, args: ["--top", "1"], code: 0 },
  { name: "lc-min3list", tool: LC, args: ["--min", "3", "--list"], code: 0 },
  { name: "lc-find", tool: LC, args: ["--find", "walk"], code: 0 },
  { name: "rc-default", tool: RC, args: [], code: 0 },
  { name: "rc-summary", tool: RC, args: ["--summary"], code: 0 },
  { name: "rc-deep", tool: RC, args: ["--deep"], code: 0 },
  { name: "rc-readsTable", tool: RC, args: ["--reads", "table"], code: 0 },
  { name: "rc-why", tool: RC, args: ["--why", "vtKindOfType"], code: 0 },
  { name: "rc-whyNone", tool: RC, args: ["--why", "noSuchFn"], code: 1 },
  { name: "rc-json", tool: RC, args: ["--json"], code: 0 },
  { name: "rc-min1", tool: RC, args: ["--min", "1", "--summary"], code: 0 },
  { name: "rc-all", tool: RC, args: ["--all-compiler"], code: 0 },
  {
    name: "rc-allwhy",
    tool: RC,
    args: ["--all-compiler", "--why", "nodeArrayElemName"],
    code: 0,
  },
];

Deno.test({
  name: "ladder-census and rep-classifier-census: every mode prints what its Python printed",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_ladder_census_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      for await (const e of Deno.readDir(`${FIX}/compiler`)) {
        await Deno.copyFile(`${FIX}/compiler/${e.name}`, `${dir}/compiler/${e.name}`);
      }
      // Each tool is built once and its module run per case: the cases grade the tool, and a
      // `vl run` of the source would compile it again for every one.
      for (const tool of [LC, RC]) {
        const b = await new Deno.Command(VL, {
          args: ["build", `${ROOT}/scripts/${tool}.vl`, "-o", `${dir}/${tool}.wasm`],
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1" }),
        }).output();
        if (b.code !== 0) throw new Error(`vl build ${tool}.vl failed:\n${dec.decode(b.stderr)}`);
      }
      const runs = CASES.map(async (c) => {
        const { code, stdout } = await new Deno.Command(VL, {
          args: ["run", `${dir}/${c.tool}.wasm`, "--", ...c.args],
          cwd: dir,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1" }),
        }).output();
        const out = dec.decode(stdout);
        const want = await Deno.readTextFile(`${FIX}/out/${c.name}.txt`);
        return code !== c.code || out !== want
          ? `[${c.name}] want exit ${c.code}:\n${want}got exit ${code}:\n${out}`
          : "";
      });
      const bad = (await Promise.all(runs)).filter((s) => s !== "");
      if (bad.length > 0) throw new Error(bad.join("\n\n"));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
