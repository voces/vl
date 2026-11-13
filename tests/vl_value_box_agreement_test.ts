// ONE VALUE-UNION VERDICT PER TYPE: `valueBoxOfTy` (emit_rep) answers "is this a value-union box"
// from the type, through the same classifiers `rtOfUnion` and `rtOfNullable` build the rep tree
// from. Under `$VL_REP_SHADOW` the shadow sweep compares that answer with the tree actually built
// for every union and nullable type (`valueBox/disagree` must stay 0). `valueBox/checked` counts
// the types compared, so the control shows the compare is reached. The programs are D16062's
// grading list and every literal-union case, the population whose verdict the spellings split.
// `VL_VALUE_BOX_FULL=1` sweeps all of `tests/cases` instead.
import { filePath } from "./support/filePath.ts";
const ROOT = filePath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl${
  Deno.build.os === "windows" ? ".exe" : ""
}`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const WITNESSES = `${ROOT}/tests/fixtures/value-box-agreement/witnesses.txt`;
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

// Every `rep-shadow[...]: unsup valueBox/<bucket> xN` line, summed per bucket.
const sweep = async (rel: string, dir: string, i: number) => {
  const { stderr, stdout } = await new Deno.Command(VL, {
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
  for (const m of text.matchAll(/^rep-shadow\[[^\]]*\]: (.*)$/gm)) {
    const k = /^unsup (valueBox\/\S+) x(\d+)$/.exec(m[1]);
    if (k) counts[k[1]] = (counts[k[1]] ?? 0) + Number(k[2]);
  }
  return counts;
};

Deno.test({
  name:
    "value box: valueBoxOfTy agrees with the rep tree on every union and nullable type",
  ignore: !ENABLED,
  fn: async () => {
    const full = Deno.env.get("VL_VALUE_BOX_FULL") === "1";
    const list = full ? walk("tests/cases", []).sort() : [
      ...Deno.readTextFileSync(WITNESSES).split("\n").map((l) => l.trim())
        .filter((l) => l !== ""),
      ...walk("tests/cases/literal-unions", []).sort(),
    ];
    const dir = await Deno.makeTempDir({ prefix: "vl_value_box_" });
    try {
      let next = 0;
      let checked = 0;
      const bad: string[] = [];
      const work = async () => {
        while (next < list.length) {
          const i = next++;
          const c = await sweep(list[i], dir, i);
          checked += c["valueBox/checked"] ?? 0;
          if ((c["valueBox/disagree"] ?? 0) > 0) {
            bad.push(`${list[i]} (${c["valueBox/disagree"]})`);
          }
        }
      };
      await Promise.all(Array.from({ length: POOL }, work));
      if (checked === 0) {
        throw new Error(
          "valueBox/checked: want > 0 (the shadow compare was reached), got 0",
        );
      }
      if (bad.length > 0) {
        throw new Error(
          `valueBox/disagree: want 0 programs, got ${bad.length}:\n${
            bad.join("\n")
          }`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
