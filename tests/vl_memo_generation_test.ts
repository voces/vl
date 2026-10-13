// A NEW MEMO MAY NOT JOIN THE TREE UNGRADED.
//
// D1655 was a classifier memo whose staleness key read the arena epoch and four collect-table
// LENGTHS, while its value read `fRetKind` — a column `computeRetInference` refines IN PLACE,
// which moves none of those. `vl check` rc 0, invalid module. #2690's fix is a generation:
// `emitPassGen` counts pass-table rows, so a memo answer may not outlive its own pass.
//
// `scripts/memo-generation-probe.vl` derives every generation stamp in `compiler/*.vl` and
// fails on one `scripts/memo-generation-rows.json` does not classify, or on a row whose guard
// was reworded out from under it. The first case is that check on the real tree. The second
// is its red control: the same tree with one unclassified stamp appended must exit 1 naming
// it, since an instrument that cannot fail proves nothing. The BEHAVIOURAL half (disable a
// memo, re-grade the capability family, `tests/cases` and the corpus) is `--run`, which
// compiles; its readings live in `docs/internals/memo-generation-census-2026-09.md`.
//
// The script was `memo-generation-probe.py` until it moved to VL: its `--list` output was
// byte-identical on the real tree and on two red trees. The one difference is the hint
// naming the rows file rather than the ROWS table.
//
// No assertion library, per CLAUDE.md: the failure throws with want and got.
// @test-timing native

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER);
if (!ENABLED) {
  console.warn("[vl-memo-generation] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();

/** `scripts/memo-generation-probe.vl --list`, run from `cwd` (a checkout root or a copy). */
const list = async (
  cwd: string,
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "run",
      `${ROOT}/scripts/memo-generation-probe.vl`,
      "--compiler",
      COMPILER,
    ],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
};

Deno.test({
  name: "every memo staleness key in compiler/*.vl is classified",
  ignore: !ENABLED,
  fn: async () => {
    const { code, out } = await list(ROOT);
    if (code !== 0) {
      throw new Error(
        `memo-generation-probe.vl --list exited ${code}, want 0.\n` +
          `A generation stamp in compiler/*.vl is not classified in ` +
          `scripts/memo-generation-rows.json, or a row's guard was reworded. Add the row ` +
          `(verdict + a disable edit unless its key already reads \`emitPassGen\`) and ` +
          `re-grade per docs/internals/memo-generation-census-2026-09.md.\n${out}`,
      );
    }
  },
});

Deno.test({
  name: "an unclassified stamp in a copy of the tree is refused by name",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_memo_generation_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      await Deno.mkdir(`${dir}/scripts`);
      for await (const e of Deno.readDir(`${ROOT}/compiler`)) {
        if (e.isFile && e.name.endsWith(".vl")) {
          await Deno.copyFile(`${ROOT}/compiler/${e.name}`, `${dir}/compiler/${e.name}`);
        }
      }
      await Deno.copyFile(
        `${ROOT}/scripts/memo-generation-rows.json`,
        `${dir}/scripts/memo-generation-rows.json`,
      );
      const poisoned = `${dir}/compiler/check_state.vl`;
      await Deno.writeTextFile(
        poisoned,
        (await Deno.readTextFile(poisoned)) +
          "\nlet zzControlGen: i32 = 0\nfunction zzControl(x: i32): boolean {\n" +
          "  (zzControlGen != x)\n}\n",
      );
      const { code, out } = await list(dir);
      if (code !== 1 || !out.includes("UNCLASSIFIED stamp `zzControlGen`")) {
        throw new Error(
          `memo-generation-probe.vl --list on a tree with an unclassified stamp: want exit 1 ` +
            `naming \`zzControlGen\`, got exit ${code}:\n${out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
