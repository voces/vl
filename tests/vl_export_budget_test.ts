// THE DEAD-EXPORT RATCHET, VALIDATED AGAINST A CONTROL IT MUST FIRE ON.
//
// `vl check --budget scripts/export-budget-baseline.json` gates at ZERO, so on a
// healthy tree it is silent — and a silent detector proves nothing about itself
// (CLAUDE.md, "never trust a probe until a control you KNOW should trigger it does").
// This builds a two-file miniature of the same shape under `--root` and asserts BOTH
// arms: the export nothing references is reported, the one a sibling module imports is
// not, and adding a reference from `tests/` alone makes the first one go quiet. The
// control's report also reds the budget, and `--budget-why` names the declaration.
// A third pair of files pins the reachability arm: a self-calling pair named only in a
// comment and an `import` list is reported, and a top-level call clears it.
//
// It also pins that the committed baseline is at zero, which is the claim the
// gate row rests on: any export the tree stops referencing fails CI.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed.
//
// @test-timing sweep n=30

import { builtScript } from "./support/builtScript.ts";
import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/dead-exports.vl`;
const BASELINE = `${ROOT}/scripts/export-budget-baseline.json`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-export-budget] skipped — missing vl binary or seed wasm.");
}

const vl = async (args: string[]): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
};

const run = async (args: string[]): Promise<string> => {
  const r = await vl(["run", await builtScript(SCRIPT, { cwd: ROOT }), "--", ...args]);
  if (r.code !== 0) {
    throw new Error(`dead-exports.vl ${args.join(" ")} exited ${r.code}: ${r.out}`);
  }
  return r.out;
};

// The miniature tree: `compiler/` is the declaration side the ratchet owns,
// `tests/` one of the five other trees a reference may live in.
const MOD = `export function orphan(): i32 { 1 }
export function imported(): i32 { 2 }
export let table: i32[] = []
`;
// `use` is deliberately NOT exported: a second dead export would make the one row
// this asserts on ambiguous.
const USER = `import { imported } from "./mod"

function use(): i32 { imported() + table.length }
print(use())
`;
// The reachability arm: a pair that only calls itself, named again in a comment and in an
// `import` list, is dead; a top-level call is what brings it back.
const PAIR = `export function ping(n: i32): i32 { if n > 0 { pong(n - 1) } else { 0 } }
export function pong(n: i32): i32 { ping(n) }
`;
const NAMER = `import { ping, pong } from "./pair"

// ping and pong are named here only in this comment.
print(1)
`;

Deno.test({
  name: "dead-export ratchet: fires on the unreferenced export, not on the imported one",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_export_budget_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      await Deno.mkdir(`${dir}/tests`);
      await Deno.writeTextFile(`${dir}/compiler/mod.vl`, MOD);
      await Deno.writeTextFile(`${dir}/compiler/user.vl`, USER);

      // `table` is referenced from a sibling module, `imported` is imported by name,
      // `orphan` is named nowhere else — so exactly one row is owed.
      const first = (await run(["--root", dir, "--list"])).trim().split("\n").filter((l) => l);
      const want = ["compiler/mod.vl:1  function orphan"];
      if (JSON.stringify(first) !== JSON.stringify(want)) {
        throw new Error(
          `the control the detector must fire on: want ${JSON.stringify(want)}, ` +
            `got ${JSON.stringify(first)}`,
        );
      }

      // The report reds the zero baseline on that file, and `--budget-why` names the
      // declaration by its source line.
      const report = `${dir}/dead.json`;
      await run(["--root", dir, "--out", report]);
      const budget = (flag: string) =>
        vl(["check", flag, BASELINE, "--findings", report, "--compiler", COMPILER]);
      const red = await budget("--budget");
      if (red.code !== 1 || !red.out.includes("compiler/mod.vl  dead-export: 1 (baseline 0)")) {
        throw new Error(
          `the control's report must red compiler/mod.vl — got ${red.code}:\n${red.out}`,
        );
      }
      const why = await budget("--budget-why");
      if (!why.out.includes("compiler/mod.vl: export function orphan(): i32 { 1 }")) {
        throw new Error(`--budget-why must name the declaration — got ${why.code}:\n${why.out}`);
      }

      // THE OTHER ARM: a reference from `tests/` is a reference. The same tree with
      // one line added has to go quiet, or the corpus half is not being read at all.
      await Deno.writeTextFile(
        `${dir}/tests/uses_orphan_test.ts`,
        `// names orphan once, from outside compiler/\n`,
      );
      const second = (await run(["--root", dir, "--list"])).trim();
      if (second !== "") {
        throw new Error(
          `a reference from tests/ must clear the row — got ${JSON.stringify(second)}`,
        );
      }

      // The reachability arm fires on a cluster the word count calls live ...
      await Deno.writeTextFile(`${dir}/compiler/pair.vl`, PAIR);
      await Deno.writeTextFile(`${dir}/compiler/namer.vl`, NAMER);
      const third = (await run(["--root", dir, "--list"])).trim().split("\n").filter((l) => l);
      const wantPair = ["compiler/pair.vl:1  function ping", "compiler/pair.vl:2  function pong"];
      if (JSON.stringify(third) !== JSON.stringify(wantPair)) {
        throw new Error(
          `a cluster reached only from a comment and an import list: want ` +
            `${JSON.stringify(wantPair)}, got ${JSON.stringify(third)}`,
        );
      }
      // ... and a top-level call clears it.
      await Deno.writeTextFile(`${dir}/compiler/namer.vl`, NAMER + "print(ping(2))\n");
      const fourth = (await run(["--root", dir, "--list"])).trim();
      if (fourth !== "") {
        throw new Error(`a top-level call must clear the cluster — got ${JSON.stringify(fourth)}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test("dead-export ratchet: the committed baseline is at zero", async () => {
  const base = JSON.parse(await Deno.readTextFile(BASELINE)) as {
    total: Record<string, number>;
    files: Record<string, Record<string, number>>;
  };
  const total = base.total["dead-export"];
  if (total !== 0 || Object.keys(base.files).length !== 0) {
    throw new Error(
      `the dead-export baseline must stay at zero — got total ${total} over ` +
        `${Object.keys(base.files).length} file(s). It is the one ratchet whose tree ` +
        `reached zero in the PR that added it; a non-zero entry means an export was ` +
        `banked rather than deleted or un-exported.`,
    );
  }
});
