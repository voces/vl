// `$VL_IFACES=1`, L2 S0's shadow interfaces (`compiler/check_iface_shadow.vl`): armed, a compile
// prints one `[iface] <path>: fn …` row per un-annotated top-level function; unarmed, or for a
// program with no un-annotated function, it prints none. The L2 grading reads these rows, so a host
// or seed that stopped printing them, or changed their shape, would leave it reading nothing.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-ifaces] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();
const CASES: { src: string; want: string[] }[] = [
  {
    src: "function get(o) { o.x }\nprint(get({ x: 4 }))\n",
    want: ["fn get('?get.0) -> '?fld.x.?get.0 hd0=1 calls=1 differ=0"],
  },
  {
    src: "function inc(x: i32): i32 { x + 1 }\nprint(inc(2))\n",
    want: [],
  },
];

Deno.test({
  name:
    "ifaces: armed rows give each un-annotated function's shadow interface; unarmed none",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_ifaces_" });
    try {
      const rows = async (file: string, armed: boolean): Promise<string[]> => {
        const env: Record<string, string> = { NO_COLOR: "1" };
        if (armed) env.VL_IFACES = "1";
        const { code, stderr } = await new Deno.Command(VL, {
          args: ["check", "--codegen", file, "--compiler", COMPILER],
          cwd: ROOT,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv(env),
        }).output();
        const err = dec.decode(stderr);
        if (code !== 0) throw new Error(`want exit 0, got ${code}:\n${err}`);
        const pre = `[iface] ${file}: `;
        return err.split("\n").filter((l) => l.startsWith("[iface] ")).map(
          (l) => l.startsWith(pre) ? l.slice(pre.length) : l,
        );
      };
      for (let i = 0; i < CASES.length; i++) {
        const file = `${dir}/p${i}.vl`;
        await Deno.writeTextFile(file, CASES[i].src);
        const off = await rows(file, false);
        if (off.length !== 0) {
          throw new Error(`case ${i} unarmed: want no rows, got ${off[0]}`);
        }
        const on = await rows(file, true);
        const want = CASES[i].want.join("\n");
        const got = on.join("\n");
        if (got !== want) {
          throw new Error(`case ${i} armed: want\n${want}\ngot\n${got}`);
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
