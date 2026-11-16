// `$VL_TOUCH_SET=1`, each top-level function's touch set (`compiler/check_touch_set.vl`): armed, a
// compile prints one `[touch] <path>: <fn>\t<globals>[\tlambda][\tunknown]` row per function, the
// module globals it or anything it calls reads or writes; unarmed, it prints none. The init-order
// work (init-order-design-2026-11.md §2.1) reads these rows, so a host or seed that stopped printing
// them, or changed their shape, would leave it reading nothing.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-touch-set] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();
const CASES: { src: string; want: string[] }[] = [
  // Transitive through a call chain, a write, and a recursive cycle.
  {
    src: "let a = 1\nlet b = 2\nfunction f() { g() }\nfunction g() { h() }\n" +
      "function h() { a = b }\n" +
      "function r(n: i32): i32 { return if n > 0 { r(n - 1) + a } else { b } }\n" +
      "f()\nprint(r(2))\n",
    want: ["f\ta,b", "g\ta,b", "h\ta,b", "r\ta,b"],
  },
  // A user operator; a call through a function value and a lambda flag where the set may be short.
  {
    src: "type V = { x: i32 }\n" +
      'function "+"(self: V, other: V): i32 { return self.x + other.x + k }\n' +
      "function run(h: () => i32) { return h() }\nfunction mk() { return () => k }\n" +
      "const p: V = { x: 1 }\nconst k = p.x + 1\nprint(p + p)\nprint(run(mk()))\n",
    want: ["+@V\tk", "run\t\tunknown", "mk\t\tlambda"],
  },
];

Deno.test({
  name: "touch set: armed rows give each function's touched globals; unarmed none",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_touch_" });
    try {
      const rows = async (file: string, armed: boolean): Promise<string[]> => {
        const env: Record<string, string> = { NO_COLOR: "1" };
        if (armed) env.VL_TOUCH_SET = "1";
        const { code, stderr } = await new Deno.Command(VL, {
          args: ["check", "--codegen", file, "--compiler", COMPILER],
          cwd: ROOT,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv(env),
        }).output();
        const err = dec.decode(stderr);
        if (code !== 0) throw new Error(`want exit 0, got ${code}:\n${err}`);
        const pre = `[touch] ${file}: `;
        return err.split("\n").filter((l) => l.startsWith("[touch] ")).map(
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
        const got = (await rows(file, true)).join("\n");
        const want = CASES[i].want.join("\n");
        if (got !== want) {
          throw new Error(`case ${i} armed: want\n${want}\ngot\n${got}`);
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
