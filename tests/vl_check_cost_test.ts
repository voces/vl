// `$VL_CHECK_COST`: the checker's cost report prints only when asked, names each full check pass by
// cause, and counts the type arena's rows beside its structurally distinct ones (#10525, S0).
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed.

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const ENABLED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1" &&
  exists(VL) && exists(COMPILER);

// A literal binding whose use pins its type: one re-check by the literal pin.
const PROGRAM = `const xs = []
xs.push(1.5)
print(xs[0])
`;

async function checkCodegen(env: Record<string, string>): Promise<string> {
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
    return new TextDecoder().decode(r.stderr).replaceAll(path, "<p>");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test({
  name: "check cost: unset, no [check-cost] row",
  ignore: !ENABLED,
  async fn() {
    const err = await checkCodegen({});
    if (err.includes("[check-cost]")) {
      throw new Error(`want no [check-cost] row unasked\ngot:\n${err}`);
    }
  },
});

Deno.test({
  name:
    "check cost: passes by cause, and the arena's distinct rows within its rows",
  ignore: !ENABLED,
  async fn() {
    const err = await checkCodegen({ VL_CHECK_COST: "1" });
    const rows = err.split("\n").filter((l) =>
      l.startsWith("[check-cost] <p>: ")
    )
      .map((l) => l.slice("[check-cost] <p>: ".length));
    const passes = rows.find((r) => r.startsWith("passes "));
    const first = rows.find((r) => r.startsWith("pass first "));
    const arena = rows.find((r) => r.startsWith("arena rows "));
    if (
      passes === undefined || first !== "pass first 1" || arena === undefined
    ) {
      throw new Error(
        `want a passes row, "pass first 1" and an arena row\ngot:\n${
          rows.join("\n")
        }`,
      );
    }
    const n = Number(passes.split(" ")[1]);
    const byCause = rows.filter((r) => r.startsWith("pass "))
      .reduce((s, r) => s + Number(r.split(" ").at(-1)), 0);
    if (n < 1 || byCause !== n) {
      throw new Error(
        `want the causes to sum to the passes (${n})\ngot: ${byCause}`,
      );
    }
    const m = arena.match(/^arena rows (\d+) distinct (\d+)$/);
    if (m === null || Number(m[2]) < 1 || Number(m[2]) > Number(m[1])) {
      throw new Error(`want 0 < distinct <= rows\ngot: ${arena}`);
    }
  },
});
