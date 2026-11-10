// `$VL_CLS_CENSUS=1`, the classifier phase census (`compiler/emit_cls_census.vl`): armed, a
// compile prints one `[cls] <path>: <fn>\t<site>\t<phase>\t<n>` row per classifier, call site
// and emit phase it counted; unarmed it prints none. `scripts/classifier-census.vl` reads these
// rows, so a host or seed that stopped printing them would leave the census reading zeros.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-cls-census] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();
const PHASES = [
  "passes",
  "monomorphizing",
  "monomorphized",
  "capsCached",
  "arenaFinal",
];
// Programs that reach the classifiers still probed: a struct list's literal, a generic's record
// holding a hole-function list, a filled nullable-string list. Once no classifier is probed, the
// armed census must print no row (step 7's classifier half is done).
const PROGRAMS = [
  "type P = { q: i32 }\nfunction mk(n: i32): P[] { return [{ q: n }] }\nfor p in mk(3) { print(p.q) }\n",
  "function inc0(a) { return a + 1 }\nfunction mk<T>(x: T) { return { fs: [inc0], x: x } }\nconst rs = [mk(1), mk(2)]\nprint(rs[1].fs[0](rs[0].x))\n",
  'import { filled } from "std:array"\nconst flags = filled<string | null>(2, null)\nprint(flags.length)\n',
];

Deno.test({
  name:
    "cls-census: armed rows name a probed classifier, a site and a phase; unarmed none; none once nothing is probed",
  ignore: !ENABLED,
  fn: async () => {
    const src = await Deno.readTextFile(`${ROOT}/compiler/emit_classify.vl`);
    const probed = new Set(
      [...src.matchAll(/clsCensusEnter\("([^"]+)"\)/g)].map((m) => m[1]),
    );
    const dir = await Deno.makeTempDir({ prefix: "vl_cls_census_" });
    try {
      const check = async (file: string, armed: boolean): Promise<string[]> => {
        const env: Record<string, string> = { NO_COLOR: "1" };
        if (armed) env.VL_CLS_CENSUS = "1";
        const { code, stderr } = await new Deno.Command(VL, {
          args: ["check", "--codegen", file, "--compiler", COMPILER],
          cwd: ROOT,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv(env),
        }).output();
        const err = dec.decode(stderr);
        if (code !== 0) throw new Error(`want exit 0, got ${code}:\n${err}`);
        return err.split("\n").filter((l) => l.startsWith("[cls] "));
      };
      const on: string[] = [];
      for (let i = 0; i < PROGRAMS.length; i++) {
        const file = `${dir}/p${i}.vl`;
        await Deno.writeTextFile(file, PROGRAMS[i]);
        const off = await check(file, false);
        if (off.length !== 0) {
          throw new Error(
            `unarmed: want no rows, got ${off.length}: ${off[0]}`,
          );
        }
        on.push(...await check(file, true));
      }
      if (probed.size === 0) {
        if (on.length !== 0) {
          throw new Error(
            `nothing probed: want no rows, got ${on.length}: ${on[0]}`,
          );
        }
        return;
      }
      if (on.length === 0) {
        throw new Error(
          `armed: want rows, got none (probed: ${[...probed].join(", ")})`,
        );
      }
      for (const row of on) {
        const f = row.slice(row.indexOf(": ") + 2).split("\t");
        const ok = f.length === 4 && f[1] === "-1" && PHASES.includes(f[2]) &&
          Number(f[3]) > 0;
        if (!ok) throw new Error(`want <fn>\\t-1\\t<phase>\\t<n>, got ${row}`);
        if (!probed.has(f[0])) {
          throw new Error(
            `want a probed classifier, got ${f[0]} (probed: ${
              [...probed].join(", ")
            })`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
