// `$VL_INST_KEYS` (STORE A0): the instance-key shadow prints its rows only when asked, and an
// unasked compile's output is byte-identical to one with no shadow at all.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed.

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const ENABLED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1" &&
  exists(VL) && exists(COMPILER);

const PROGRAM = `function id(x) { return x }
function twice(f, x) { return f(f(x)) }
function inc(a) { return a + 1 }
print(id(3))
print(id("s"))
print(twice(inc, 4))
`;

async function checkCodegen(
  env: Record<string, string>,
): Promise<{ out: string; err: string; code: number }> {
  const dir = await Deno.makeTempDir();
  try {
    const path = `${dir}/p.vl`;
    await Deno.writeTextFile(path, PROGRAM);
    const r = await new Deno.Command(VL, {
      args: ["check", "--codegen", "--compiler", COMPILER, path],
      env: { ...nativeEnv(), ...env },
      cwd: ROOT,
      stdout: "piped",
      stderr: "piped",
    }).output();
    const dec = new TextDecoder();
    return {
      out: dec.decode(r.stdout),
      err: dec.decode(r.stderr).replaceAll(path, "<p>"),
      code: r.code,
    };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test({
  name: "inst keys: unset, no [inst] row and the same output as an explicit 0",
  ignore: !ENABLED,
  async fn() {
    const unset = await checkCodegen({});
    const zero = await checkCodegen({ VL_INST_KEYS: "0" });
    if (unset.err.includes("[inst]")) {
      throw new Error(`want no [inst] row unset, got:\n${unset.err}`);
    }
    if (
      unset.out !== zero.out || unset.err !== zero.err ||
      unset.code !== zero.code
    ) {
      throw new Error(
        `want byte-identical output unset and at 0\nunset: ${unset.code}\n${unset.out}${unset.err}\nzero: ${zero.code}\n${zero.out}${zero.err}`,
      );
    }
  },
});

Deno.test({
  name:
    "inst keys: set, one summary row and the check's keys agree with the elaboration's",
  ignore: !ENABLED,
  async fn() {
    const on = await checkCodegen({ VL_INST_KEYS: "1" });
    const off = await checkCodegen({});
    if (on.out !== off.out || on.code !== off.code) {
      throw new Error(
        `want the same stdout and exit armed\n${on.out}\nvs\n${off.out}`,
      );
    }
    const rows = on.err.split("\n").filter((l) => l.startsWith("[inst] "));
    const summary = rows.filter((l) => l.includes(": summary "));
    if (summary.length !== 1) {
      throw new Error(
        `want one summary row, got ${summary.length}:\n${on.err}`,
      );
    }
    const m = summary[0].match(/equal=(\d+) check-only=(\d+) elab-only=(\d+)/);
    if (!m || Number(m[1]) < 3) {
      throw new Error(
        `want at least 3 equal keys (id twice, twice), got:\n${summary[0]}`,
      );
    }
  },
});
