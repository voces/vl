// THE UNION KEY'S LICENCE: two rows minted under one `unKey` describe one union.
//
// Step 5 of the registry-by-key migration (docs/internals/registry-by-type-id.md §5) lets a
// seam return "the first row carrying this key" in place of the row its name finds. That is
// sound only while every pair of rows sharing a key agrees on BOTH halves of what a tag
// means: the member-set string (`keySweep/merge-diffset`, a value union's atoms) and the
// variant slice (`keySweep/merge-diffvar`, a struct union's positional tags — D1492 was the
// last pair to disagree). The sweep runs under `$VL_REP_SHADOW`, and only a program whose
// rows share a key (`keySweep/merge`) can reach either half, so the witness list is every
// `tests/cases` program that did, plus D1492's own. `VL_UNION_LICENCE_FULL=1` sweeps all
// of `tests/cases` instead.
import { filePath } from "./support/filePath.ts";
const ROOT = filePath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl${
  Deno.build.os === "windows" ? ".exe" : ""
}`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const WITNESSES = `${ROOT}/tests/fixtures/union-key-licence/witnesses.txt`;
// A struct union still minted as two rows under one key. D1492's own pair, `type AS = (Sc | Dg)`
// beside the inline `Sc | Dg`, is one row now that a union names the row of its type key.
const CONTROL = "tests/cases/unions/discriminant-narrows-parent.vl";
const POOL = 4;

const exists = (p: string) => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};
const ENABLED = exists(VL) && exists(COMPILER);

const walk = (dir: string, out: string[]) => {
  for (const e of Deno.readDirSync(`${ROOT}/${dir}`)) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory) walk(rel, out);
    else if (e.name.endsWith(".vl")) out.push(rel);
  }
  return out;
};

// Every `rep-shadow[...]: unsup keySweep/<bucket> xN` line, summed per bucket.
const sweep = async (rel: string, dir: string, i: number) => {
  const { code, stderr, stdout } = await new Deno.Command(VL, {
    args: ["build", rel, "--compiler", COMPILER, "-o", `${dir}/${i}.wasm`],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: {
      RUST_BACKTRACE: "0",
      NO_COLOR: "1",
      VL_STD: `${ROOT}/std`,
      VL_REP_SHADOW: "1",
    },
  }).output();
  const text = new TextDecoder().decode(stderr) +
    new TextDecoder().decode(stdout);
  const counts: Record<string, number> = {};
  let lines = 0;
  for (const m of text.matchAll(/^rep-shadow\[[^\]]*\]: (.*)$/gm)) {
    lines++;
    const k = /^unsup (keySweep\/\S+) x(\d+)$/.exec(m[1]);
    if (k) counts[k[1]] = (counts[k[1]] ?? 0) + Number(k[2]);
  }
  return { code, counts, lines };
};

Deno.test({
  name:
    "union key licence: no two rows sharing a key differ in member set or variant slice",
  ignore: !ENABLED,
  fn: async () => {
    const full = Deno.env.get("VL_UNION_LICENCE_FULL") === "1";
    const list = full
      ? walk("tests/cases", []).sort()
      : Deno.readTextFileSync(WITNESSES).split("\n").map((l) => l.trim())
        .filter((l) => l !== "");
    if (!list.includes(CONTROL)) {
      throw new Error(`the witness list lost its control ${CONTROL}`);
    }
    const missing = list.filter((rel) => !exists(`${ROOT}/${rel}`));
    if (missing.length) {
      throw new Error(
        `${missing.length} witnesses no longer exist — regenerate the list:\n  ${
          missing.join("\n  ")
        }`,
      );
    }
    const dir = await Deno.makeTempDir({ prefix: "vl_union_licence_" });
    try {
      const bad: string[] = [];
      let next = 0;
      let merged = 0;
      const worker = async () => {
        while (next < list.length) {
          const i = next++;
          const rel = list[i];
          const { code, counts, lines } = await sweep(rel, dir, i);
          if (lines === 0) {
            // A full sweep meets programs the checker refuses; they never reach the emitter.
            if (full && code !== 0) continue;
            bad.push(
              `${rel}: no rep-shadow report (exit ${code}) — the sweep did not run`,
            );
            continue;
          }
          merged += counts["keySweep/merge"] ?? 0;
          for (
            const half of ["keySweep/merge-diffset", "keySweep/merge-diffvar"]
          ) {
            if (counts[half]) {
              bad.push(`${rel}: want ${half} 0, got ${counts[half]}`);
            }
          }
          if (rel === CONTROL && !(counts["keySweep/merge"] >= 1)) {
            bad.push(
              `${rel}: want keySweep/merge >= 1 (the pair compare must be reached), got ${
                counts["keySweep/merge"] ?? 0
              }`,
            );
          }
        }
      };
      await Promise.all(Array.from({ length: POOL }, worker));
      if (bad.length) {
        throw new Error(
          `${bad.length} licence failures over ${list.length} programs:\n  ${
            bad.join("\n  ")
          }`,
        );
      }
      if (merged === 0) {
        throw new Error(
          `want keySweep/merge > 0 over ${list.length} programs, got 0`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
