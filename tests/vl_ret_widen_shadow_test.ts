// The stage-5c shadow (`retWidenShadowNote`, emit_ty_seal.vl) under `$VL_ID_SHADOW`: a widened
// result's spelling against its set id. A merge whose two types are stored apart must report
// `fold-storage-differs`, and one stored alike must not; the counts row carries both.
import { filePath } from "./support/filePath.ts";
const ROOT = filePath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl${
  Deno.build.os === "windows" ? ".exe" : ""
}`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;

const exists = (p: string) => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};
const ENABLED = exists(VL) && exists(COMPILER);

// Program, then the counts row's merge and fold-storage-differs.
const CASES: [string, number, number][] = [
  // A union alias and the union it names: one set id, two rep ids.
  ["tests/cases/closures/generic-returned-union-alias-result.vl", 1, 1],
  // A record alias and its unrolling: one set id, one rep id.
  ["tests/cases/closures/generic-returned-record-param.vl", 1, 0],
];

const counts = async (rel: string, dir: string) => {
  const { stderr } = await new Deno.Command(VL, {
    args: ["build", rel, "--compiler", COMPILER, "-o", `${dir}/out.wasm`],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: { NO_COLOR: "1", VL_STD: `${ROOT}/std`, VL_ID_SHADOW: "1" },
  }).output();
  const text = new TextDecoder().decode(stderr);
  const m = text.match(
    /canon ret5c notes \d+ split \d+ merge (\d+) merge-ne \d+ fold-storage-differs (\d+)/,
  );
  return m ? [Number(m[1]), Number(m[2])] : null;
};

Deno.test({
  name:
    "ret-widen shadow: a fold of two storages reports, a fold of one does not",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_ret_widen_" });
    try {
      const bad: string[] = [];
      for (const [rel, merge, differs] of CASES) {
        const got = await counts(rel, dir);
        if (!got) {
          bad.push(`${rel}: no ret5c counts row`);
        } else if (got[0] !== merge || got[1] !== differs) {
          bad.push(
            `${rel}: want merge ${merge} fold-storage-differs ${differs}, got merge ${
              got[0]
            } fold-storage-differs ${got[1]}`,
          );
        }
      }
      if (bad.length) throw new Error(bad.join("\n"));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
