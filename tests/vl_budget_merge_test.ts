// TWO LOWERINGS OF NEIGHBOURING BASELINE ROWS MERGE WITHOUT A CONFLICT.
//
// `vl check --budget <baseline> --write-baseline` keeps a loaded file row or entry at zero and
// writes a blank line after each, so two branches that lower different files touch separate
// hunks. This writes a baseline from a findings report in a temp git repo, lowers two
// alphabetically adjacent files on two branches (one to zero), merges them, and requires a clean
// merge whose baseline holds the combined tree.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-budget-merge] skipped — missing vl binary or seed wasm.");
}

type Finding = { file: string; code: string; text: string };

const run = async (
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
};

const must = async (cmd: string, args: string[], cwd: string) => {
  const r = await run(cmd, args, cwd);
  if (r.code !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited ${r.code}: ${r.out}`);
  }
  return r.out;
};

// Three findings in each of four files, so lowering one file leaves its neighbours' rows and
// entries in place on both sides of it.
const FILES = ["src/a.vl", "src/b.vl", "src/c.vl", "src/d.vl"];
const ALL: Finding[] = FILES.flatMap((f) =>
  [1, 2, 3].map((k) => ({ file: f, code: "t-code", text: `line ${k} of ${f}` }))
);

const report = (fs: Finding[]): string =>
  JSON.stringify(fs.map((f, i) => ({
    file: f.file,
    line: i + 1,
    col: 1,
    severity: "warning",
    code: f.code,
    message: "m",
    text: f.text,
  })));

const write = (dir: string, fs: Finding[]) =>
  Deno.writeTextFile(`${dir}/f.json`, report(fs)).then(() =>
    must(VL, [
      "check",
      "--budget",
      "b.json",
      "--findings",
      "f.json",
      "--compiler",
      COMPILER,
      "--write-baseline",
    ], dir)
  );

Deno.test({
  name: "budget baselines: lowerings of neighbouring rows merge cleanly",
  ignore: !ENABLED,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: "vl_budget_merge_" });
    try {
      const git = (...args: string[]) => must("git", args, dir);
      await git("init", "-q");
      await git("config", "user.email", "t@t");
      await git("config", "user.name", "t");
      await Deno.writeTextFile(
        `${dir}/b.json`,
        `{"label": "t", "targets": ["src"], "codes": ["t-code"], "files": {}, "entries": []}\n`,
      );
      await write(dir, ALL);
      await git("add", "b.json");
      await git("commit", "-qm", "base");
      const base = (await git("branch", "--show-current")).trim();

      // b.vl drops one finding on one branch; c.vl, its neighbour, drops all three on the other.
      const dropB = ALL.filter((f) => f.text !== "line 3 of src/b.vl");
      const dropC = ALL.filter((f) => f.file !== "src/c.vl");
      await git("checkout", "-qb", "x");
      await write(dir, dropB);
      await git("commit", "-qam", "x");
      await git("checkout", "-q", base);
      await git("checkout", "-qb", "y");
      await write(dir, dropC);
      await git("commit", "-qam", "y");

      const merged = await run("git", ["merge", "-q", "x", "-m", "m"], dir);
      if (merged.code !== 0) {
        throw new Error(
          `the two lowerings conflict:\n${merged.out}\n${await Deno
            .readTextFile(`${dir}/b.json`)}`,
        );
      }
      const both = dropC.filter((f) => f.text !== "line 3 of src/b.vl");
      const b = JSON.parse(await Deno.readTextFile(`${dir}/b.json`));
      const want = {
        "src/a.vl": 3,
        "src/b.vl": 2,
        "src/c.vl": 0,
        "src/d.vl": 3,
      };
      const got = Object.fromEntries(
        Object.entries(b.files as Record<string, Record<string, number>>)
          .map(([k, v]) => [k, v["t-code"]]),
      );
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(
          `merged rows: want ${JSON.stringify(want)}, got ${
            JSON.stringify(got)
          }`,
        );
      }
      await Deno.writeTextFile(`${dir}/f.json`, report(both));
      await must(VL, [
        "check",
        "--budget",
        "b.json",
        "--findings",
        "f.json",
        "--compiler",
        COMPILER,
      ], dir);
      // The zero row and entries are kept, so a third lowering edits lines and deletes none.
      if (
        !(b.entries as unknown[][]).some((e) =>
          e[1] === "src/c.vl: line 1 of src/c.vl" && e[2] === 0
        )
      ) {
        throw new Error(
          `the zeroed file's entries were dropped: ${
            JSON.stringify(b.entries)
          }`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
