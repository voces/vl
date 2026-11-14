// `scripts/silent-sweep/corpuscmp.vl`, held to its verdicts over a three-module tree.
//
// The tool was `corpuscmp.py` until T3 of the architecture refactor. The port was graded by
// running both, output for output, before the Python was deleted: stdout and exit code were
// byte-identical over the whole corpus (5,253 modules, 4,153 identical, 1,100 not buildable by
// the base), and over a 45-module tree against three candidates chosen to move every column —
// an older seed (2 LOST), a seed whose emitter adds a custom section to every module with an
// odd function count (19 DIFFER), and a truncated seed (every buildable module LOST). There
// was no disagreement to name; the one behaviour that changed is not in its output: the tree
// it walks is the working directory, where the Python read its own checkout.
//
// This suite rebuilds the tool's tree in a temp dir (the script, `scripts/lib`, the binary and
// the seed) with one module that builds, one that does not and one in `std/`, then grades the
// seed against itself (all identical) and against a truncated copy (each buildable one LOST).
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-corpuscmp] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();

const write = async (path: string, text: string) => {
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, text);
};

Deno.test({
  name:
    "corpuscmp: identical, LOST and not-buildable verdicts over a fixed tree",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_corpuscmp_" });
    try {
      await write(
        `${dir}/scripts/silent-sweep/corpuscmp.vl`,
        await Deno.readTextFile(`${ROOT}/scripts/silent-sweep/corpuscmp.vl`),
      );
      for (const e of Deno.readDirSync(`${ROOT}/scripts/lib`)) {
        if (e.isFile && e.name.endsWith(".vl")) {
          await write(
            `${dir}/scripts/lib/${e.name}`,
            await Deno.readTextFile(`${ROOT}/scripts/lib/${e.name}`),
          );
        }
      }
      await Deno.mkdir(`${dir}/scripts/vl-host/target/release`, {
        recursive: true,
      });
      await Deno.symlink(VL, `${dir}/scripts/vl-host/target/release/vl`);
      await Deno.mkdir(`${dir}/build`);
      await Deno.symlink(COMPILER, `${dir}/build/vl-compiler.wasm`);
      await write(`${dir}/tests/cases/a/ok.vl`, "print(1 + 2)\n");
      await write(
        `${dir}/tests/cases/bad.vl`,
        'const x: i32 = "no"\nprint(x)\n',
      );
      await write(`${dir}/std/tiny.vl`, "export function one(): i32 { 1 }\n");
      const seed = await Deno.readFile(COMPILER);
      const broken = `${dir}/broken.wasm`;
      await Deno.writeFile(broken, seed.slice(0, 1000));

      const cases = [
        {
          cand: COMPILER,
          code: 0,
          out:
            "corpus cmp: 3 modules · 2 identical · 0 DIFFER · 0 LOST · 1 not buildable by the base\n",
        },
        {
          cand: broken,
          code: 1,
          out: "LOST    std/tiny.vl\nLOST    tests/cases/a/ok.vl\n" +
            "corpus cmp: 3 modules · 0 identical · 0 DIFFER · 2 LOST · 1 not buildable by the base\n",
        },
      ];
      for (const c of cases) {
        const { code, stdout } = await new Deno.Command(VL, {
          args: [
            "run",
            "scripts/silent-sweep/corpuscmp.vl",
            "--",
            COMPILER,
            c.cand,
          ],
          cwd: dir,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1", JOBS: "2" }),
        }).output();
        const out = dec.decode(stdout);
        if (code !== c.code || out !== c.out) {
          throw new Error(
            `[${
              c.cand === COMPILER ? "same seed" : "broken seed"
            }] want exit ${c.code}:\n${c.out}got exit ${code}:\n${out}`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
