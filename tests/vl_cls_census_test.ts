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
const PROGRAM =
  "type P = { q: i32 }\nfunction mk(n: i32): P[] { return [{ q: n }] }\nfor p in mk(3) { print(p.q) }\n";

Deno.test({
  name:
    "cls-census: armed rows name a classifier, a site and a phase; unarmed none",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_cls_census_" });
    try {
      const file = `${dir}/p.vl`;
      await Deno.writeTextFile(file, PROGRAM);
      const check = async (armed: boolean): Promise<string[]> => {
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
      const off = await check(false);
      if (off.length !== 0) {
        throw new Error(`unarmed: want no rows, got ${off.length}: ${off[0]}`);
      }
      const on = await check(true);
      if (on.length === 0) throw new Error("armed: want rows, got none");
      const names = new Set<string>();
      for (const row of on) {
        const f = row.slice(row.indexOf(": ") + 2).split("\t");
        const ok = f.length === 4 && f[1] === "-1" && PHASES.includes(f[2]) &&
          Number(f[3]) > 0;
        if (!ok) throw new Error(`want <fn>\\t-1\\t<phase>\\t<n>, got ${row}`);
        names.add(f[0]);
      }
      if (!names.has("forInVarStructIdx")) {
        throw new Error(
          `want a forInVarStructIdx row, got ${[...names].join(", ")}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
