// THE UNION KEY'S LICENCE: two rows under one type key (`unTyKey`) describe one union.
//
// A typed lookup returns "the first row carrying this type key", which is sound only while
// every pair of rows sharing a key agrees on BOTH halves of what a tag means: the member-set
// string (`keySweep/merge-diffset`, a value union's atoms) and the variant slice
// (`keySweep/merge-diffvar`, a struct union's positional tags). Two rows under one type key
// that differ is the D1712 hazard: one union is one set, so one row. The sweep runs under
// `$VL_REP_SHADOW`; `keySweep/pair-keyed` counts the pairs of keyed rows it compares, so the
// control shows the compare is reached. D15761's record twins were the last differing pair: a
// twin alias now adopts its set's row, and a build with that adoption reverted reads 1 and 1 on
// the control. `VL_UNION_LICENCE_FULL=1` sweeps all of `tests/cases` instead.
import { filePath } from "./support/filePath.ts";
const ROOT = filePath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl${
  Deno.build.os === "windows" ? ".exe" : ""
}`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const WITNESSES = `${ROOT}/tests/fixtures/union-key-licence/witnesses.txt`;
// D15761's record twins, `Cat | Kot` beside `Cat | { m: i32 }`: one set, so one row.
const CONTROL = "tests/cases/unions/variant-twin-scalar-spellings.vl";
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
    "union key licence: no two rows sharing a type key differ in member set or variant slice",
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
          for (
            const half of ["keySweep/merge-diffset", "keySweep/merge-diffvar"]
          ) {
            if (counts[half]) {
              bad.push(`${rel}: want ${half} 0, got ${counts[half]}`);
            }
          }
          if (rel === CONTROL && !(counts["keySweep/pair-keyed"] >= 1)) {
            bad.push(
              `${rel}: want keySweep/pair-keyed >= 1 (the pair compare must be reached), got ${
                counts["keySweep/pair-keyed"] ?? 0
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
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
