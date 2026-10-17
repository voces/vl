// The offset an engine validation message names is parsed twice: by the guest's
// `engineFailOffset` (compiler/engine_msg.vl, for `vl check --codegen`) and by the
// host's `engine_fail_offset` (scripts/vl-host/src/main.rs, for `vl build`/`vl run`).
// Both are graded on one case table, tests/fixtures/engine-fail-offset.txt.
//
// The guest half runs here: engine_msg.vl is a leaf, so it is copied beside a
// generated program that prints the answer for every case. The host half is the Rust
// `engine_offset_tests` (`cargo test engine_offset`); CI does not run cargo, so this
// file also holds that test to the same table by source.
//
// @test-timing native

import { ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const TABLE = "tests/fixtures/engine-fail-offset.txt";
const LEAF = `${ROOT}/compiler/engine_msg.vl`;

type Case = { want: number; msg: string };

const cases = (): Case[] => {
  const out: Case[] = [];
  for (const line of Deno.readTextFileSync(`${ROOT}/${TABLE}`).split("\n")) {
    if (line.startsWith("#") || line.length === 0) continue;
    const bar = line.indexOf("|");
    if (bar < 0) throw new Error(`${TABLE}: not \`<want>|<message>\`: ${line}`);
    const want = Number(line.slice(0, bar));
    const msg = line.slice(bar + 1);
    if (!Number.isInteger(want)) throw new Error(`${TABLE}: want: ${line}`);
    if (/["\\|]/.test(msg)) {
      throw new Error(`${TABLE}: a message holds no \`"\`, \`\\\` or \`|\`: ${line}`);
    }
    out.push({ want, msg });
  }
  if (out.length === 0) throw new Error(`${TABLE}: no cases`);
  return out;
};

Deno.test("engine fail offset: the table is well formed and engine_msg.vl is a leaf", () => {
  cases();
  const src = Deno.readTextFileSync(LEAF);
  if (/^import\b/m.test(src)) {
    throw new Error("compiler/engine_msg.vl must import nothing: this test runs it alone");
  }
});

Deno.test("engine fail offset: the host's Rust test reads the same table", () => {
  const rs = Deno.readTextFileSync(`${ROOT}/scripts/vl-host/src/main.rs`);
  const include = `include_str!("../../../${TABLE}")`;
  for (const want of ["mod engine_offset_tests", "fn engine_offset_table", include]) {
    if (!rs.includes(want)) throw new Error(`main.rs: want \`${want}\``);
  }
});

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const NATIVE = GATED && exists(VL);

Deno.test({
  name: "engine fail offset: the guest's engineFailOffset answers every case",
  ignore: !NATIVE,
  fn: async () => {
    const table = cases();
    const dir = await Deno.makeTempDir({ prefix: "vl_engine_fail_offset_" });
    try {
      await Deno.copyFile(LEAF, `${dir}/engine_msg.vl`);
      const body = table.map((c) => `print(engineFailOffset("${c.msg}"))`).join("\n");
      await Deno.writeTextFile(
        `${dir}/main.vl`,
        `import { engineFailOffset } from "./engine_msg"\n${body}\n`,
      );
      const { code, stdout, stderr } = await new Deno.Command(VL, {
        args: ["run", `${dir}/main.vl`],
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({ NO_COLOR: "1" }),
      }).output();
      const out = new TextDecoder().decode(stdout);
      if (code !== 0) {
        throw new Error(`vl run exited ${code}: ${out}${new TextDecoder().decode(stderr)}`);
      }
      const got = out.trimEnd().split("\n");
      const bad = table.flatMap((c, i) =>
        String(c.want) === got[i] ? [] : [`  ${JSON.stringify(c.msg)}: want ${c.want}, got ${got[i]}`]
      );
      if (got.length !== table.length || bad.length > 0) {
        throw new Error(`engineFailOffset disagrees with ${TABLE}:\n${bad.join("\n")}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
