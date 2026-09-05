// THE DEAD-EXPORT RATCHET, VALIDATED AGAINST A CONTROL IT MUST FIRE ON.
//
// `scripts/export-budget.py --check` gates at ZERO, so on a healthy tree it is
// silent — and a silent detector proves nothing about itself (CLAUDE.md, "never
// trust a probe until a control you KNOW should trigger it does"). This builds a
// two-file miniature of the same shape under `--root` and asserts BOTH arms: the
// export nothing references is reported, the one a sibling module imports is not,
// and adding a reference from `tests/` alone makes the first one go quiet.
//
// It also pins that the committed baseline is at zero, which is the claim the
// gate row rests on: any export the tree stops referencing fails CI.
//
// Pure Python + a file walk — no seed, no binary, so it runs everywhere.

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const SCRIPT = `${ROOT}/scripts/export-budget.py`;
const BASELINE = `${ROOT}/scripts/export-budget-baseline.json`;

const run = async (args: string[]): Promise<string> => {
  const { code, stdout, stderr } = await new Deno.Command("python3", {
    args: [SCRIPT, ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const out = new TextDecoder().decode(stdout);
  if (code !== 0) {
    throw new Error(
      `export-budget.py ${args.join(" ")} exited ${code}: ` +
        `${new TextDecoder().decode(stderr)}${out}`,
    );
  }
  return out;
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
`;

Deno.test("dead-export ratchet: fires on the unreferenced export, not on the imported one", async () => {
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
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
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
