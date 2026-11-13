// ONE SET OF SPELLING RULES, TWO FACES: `unionSpellingOfTy` (emit_union_atoms) spells a value
// union, and `unionSpellingTyOf` builds the type that spelling reads back as, which the value-union
// mint keys a row by. Under `$VL_REP_SHADOW` each mint from the twin also parses the spelling and
// compares (`spellTy/disagree` must stay 0), so a rule changed in one face and not the other fails
// here. `spellTy/checked` counts the compares, so the control shows the compare is reached. The
// programs are the ones the mint reaches through the twin.
import { filePath } from "./support/filePath.ts";
const ROOT = filePath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl${
  Deno.build.os === "windows" ? ".exe" : ""
}`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const WITNESSES = `${ROOT}/tests/fixtures/spell-ty-agreement/witnesses.txt`;
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

// Every `rep-shadow[...]: unsup spellTy/<bucket> xN` line, summed per bucket.
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
    const k = /^unsup (spellTy\/\S+) x(\d+)$/.exec(m[1]);
    if (k) counts[k[1]] = (counts[k[1]] ?? 0) + Number(k[2]);
  }
  return counts;
};

Deno.test({
  name:
    "spelling twin: unionSpellingTyOf agrees with its spelling parsed back at every mint",
  ignore: !ENABLED,
  fn: async () => {
    const list = Deno.readTextFileSync(WITNESSES).split("\n").map((l) =>
      l.trim()
    ).filter((l) => l !== "");
    const dir = await Deno.makeTempDir({ prefix: "vl_spell_ty_" });
    try {
      let next = 0;
      let checked = 0;
      const bad: string[] = [];
      const work = async () => {
        while (next < list.length) {
          const i = next++;
          const c = await sweep(list[i], dir, i);
          checked += c["spellTy/checked"] ?? 0;
          if ((c["spellTy/disagree"] ?? 0) > 0) {
            bad.push(`${list[i]} (${c["spellTy/disagree"]})`);
          }
        }
      };
      await Promise.all(Array.from({ length: POOL }, work));
      if (checked === 0) {
        throw new Error(
          "spellTy/checked: want > 0 (the shadow compare was reached), got 0",
        );
      }
      if (bad.length > 0) {
        throw new Error(
          `spellTy/disagree: want 0 programs, got ${bad.length}:\n${
            bad.join("\n")
          }`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
