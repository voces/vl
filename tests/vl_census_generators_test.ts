// The census generators under `scripts/silent-sweep/census/` (`gencensus`, `mkmatrix`,
// `sabcensus`), held to the trees the Python they replaced wrote.
//
// Each port was graded by generating with both tools into scratch directories: every block
// A–E of gencensus, and the whole output of the other two, matched byte for byte, with the
// same stdout and exit code. Block B is the slice kept here because it is cheap and draws its
// fill rows from the seeded pairwise covering, the part that must reproduce Python's
// `random.Random`. Usage errors print on stdout where the Python raised a traceback.
//
// `fixtures/census-generators/expected.json` holds, per run, the Python's stdout, its file
// count and a tree hash: sha256 over the lines `<sha256 of file>  <name>\n`, names sorted.
//
// @test-timing native

import { createHash } from "node:crypto";
import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-census-generators] skipped — missing vl binary or seed wasm.");
}

const FIX = `${ROOT}/tests/fixtures/census-generators/expected.json`;
const dec = new TextDecoder();

type Case = {
  tool: string;
  args: string[];
  files: number;
  tree: string;
  stdout: string;
};

// `node:crypto` hashes synchronously: block B's 28,591 files through `crypto.subtle`, one
// awaited digest each, cost more than generating them.
const sha256 = (data: Uint8Array | string): string =>
  createHash("sha256").update(data).digest("hex");

const treeHash = (dir: string): { files: number; tree: string } => {
  const names: string[] = [];
  for (const e of Deno.readDirSync(dir)) names.push(e.name);
  names.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  let lines = "";
  for (const n of names) lines += `${sha256(Deno.readFileSync(`${dir}/${n}`))}  ${n}\n`;
  return { files: names.length, tree: sha256(lines) };
};

Deno.test({
  name: "census generators: every tool writes the tree its Python wrote",
  ignore: !ENABLED,
  fn: async () => {
    const cases: Record<string, Case> = JSON.parse(
      await Deno.readTextFile(FIX),
    );
    const dir = await Deno.makeTempDir({ prefix: "vl_census_generators_" });
    try {
      const bad: string[] = [];
      for (const [name, c] of Object.entries(cases)) {
        const out = `${dir}/${name}`;
        const { code, stdout } = await new Deno.Command(VL, {
          args: [
            "run",
            `${ROOT}/scripts/silent-sweep/census/${c.tool}.vl`,
            "--",
            out,
            ...c.args,
          ],
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1" }),
        }).output();
        const got = dec.decode(stdout);
        if (code !== 0 || got !== c.stdout) {
          bad.push(
            `[${name}] want exit 0:\n${c.stdout}got exit ${code}:\n${got}`,
          );
          continue;
        }
        const t = treeHash(out);
        if (t.files !== c.files || t.tree !== c.tree) {
          bad.push(
            `[${name}] want ${c.files} files, tree ${c.tree}; got ${t.files} files, tree ${t.tree}`,
          );
        }
      }
      if (bad.length > 0) throw new Error(bad.join("\n\n"));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
