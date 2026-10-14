// THE GOAL SCOREBOARD'S REPORT, PINNED to what the Python it replaced printed.
//
// `scripts/goal-scoreboard.vl` ported `scripts/goal-scoreboard.py` (architecture-refactor-
// plan.md, T3). Before the Python was deleted the two ran BESIDE each other on the real
// tree — the bare report, `--sites`, `--top 3`, `--top 0 --sites`, `--json`, `--top=200`,
// a `./`-prefixed and an absolute `--baseline`, abbreviated flags — and printed the same
// stdout and exit code, the `--json` file byte for byte. The real tree moves, so the goldens
// here come from a small checkout of this suite's own, graded the same way: each file under
// `tests/fixtures/goal-scoreboard/` is the PYTHON's output on it with disagreement 1's two
// renames applied (`@D@` for the temp dir), and the port matched every one byte for byte.
// The fixture reaches what the corpus does not hold today: a `.2f` tie (1 of 800), a cell
// with no `msg`, a repeated cell, every message-normalisation case, literals the wording scan
// must skip (comments, short, unclosed, escaped quotes), and both witness columns.
//
// Where they could not agree, pinned below rather than left as prose:
//   1. The two hint lines name `vl run scripts/capability-probes.vl` where the Python named
//      `python3 scripts/capability-probes/run.py`, and the usage and error lines name
//      `goal-scoreboard.vl`: a message naming a deleted script would be wrong.
//   2. An argument error goes to stdout (VL has no stderr sink) on ONE usage line, where
//      argparse wrapped it to the terminal on stderr. Both exit 2.
//   3. A `--baseline` outside the working directory prints as given; `os.path.relpath`
//      climbed to it with `../`. Inside it, both print the relative path.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-goal-scoreboard] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();
const SCRIPT = "scripts/goal-scoreboard.vl";
const GOLD = `${ROOT}/tests/fixtures/goal-scoreboard`;
const BASE = "scripts/silent-sweep/distilled/baseline.jsonl";

const cell = (id: string, cls: string, msg?: string) =>
  JSON.stringify(msg === undefined ? { cell: id, class: cls } : { cell: id, class: cls, msg });

// 800 cells and one of them runs: 0.125% is an exact tie, which `.2f` rounds to even.
const CELLS = [
  cell("a0", "runs", ""),
  cell("a1", "loud emit reject", "Error: emit error  emitProgram: `==` over i64[] has no lowering"),
  cell("a2", "loud emit reject", "emitProgram: `==` over f64[] has no lowering"),
  cell("a3", "loud emit reject", "emit error\tfunc 12 at u160 refuses x7"),
  cell("a4", "runs but wrong value", "want 3, got 2"),
  cell("a5", "trap_loads", "wasm trap: cast failure"),
  cell("a6", "check-clean invalid wasm", "type mismatch: expected (ref $type), found (ref $type) é"),
  cell("a7", "loud check reject"),
  "",
  cell("a8", "loud check reject", "[ERROR]: this program is type-valid but cannot BUILD `T9`"),
  cell("a9", "loud check reject", "[ERROR]: cannot assign {f: i32} to 'c' of type WS1"),
  cell("a3", "loud emit reject", "the repeated cell keeps its first place and its last value"),
  ...Array.from({ length: 790 }, (_, k) =>
    cell(`z${k}`, "loud check reject", `Error: closures over \`T${k}\` u8 i7 f64x not supported YET`)),
].join("\n") + "\n";

// Literals the wording scan must see, and the ones it must skip.
const COMPILER_A = [
  "// emitFail(\"a comment line that has no lowering at all\")",
  "emitFail(\"emitProgram: `==` over f64[] has no lowering\")",
  "x = \"short lowering\" + \"no lowering\"",
  "y = \"an \\\"escaped\\\" quote that is not yet implemented\" z \"unclosed not yet built",
  "w = \"  padded and Not Yet Callable  \"",
  "",
].join("\n");
const COMPILER_B = [
  "emitFail(\"emitProgram: `==` over f64[] has no lowering\")",
  "emitFail(\"closures over `T` not supported yet in this position\")",
  "v = \"ü a literal that is not supported by codegen and runs far past sixty code points to be cut\"",
  "",
].join("\n");
const SITES = {
  sites: [
    { literal: "emitProgram: `==` over f64[] has no lowering", probe: "a.vl", row: "D0" },
    { literal: "emitProgram: a site no phrase finds, 'quoted'", probe: "b.vl", row: "D0" },
    { literal: "it's a \"both quotes\" literal long enough to be cut at fifty-eight", probe: "c.vl", row: "D0" },
  ],
};

const tree = async (dir: string) => {
  await Deno.mkdir(`${dir}/scripts/silent-sweep/distilled`, { recursive: true });
  await Deno.mkdir(`${dir}/scripts/capability-probes`, { recursive: true });
  await Deno.mkdir(`${dir}/scripts/lib`, { recursive: true });
  await Deno.mkdir(`${dir}/compiler`, { recursive: true });
  await Deno.copyFile(`${ROOT}/${SCRIPT}`, `${dir}/${SCRIPT}`);
  for (const l of ["common.vl", "probe-grade.vl"]) {
    await Deno.copyFile(`${ROOT}/scripts/lib/${l}`, `${dir}/scripts/lib/${l}`);
  }
  await Deno.writeTextFile(`${dir}/${BASE}`, CELLS);
  await Deno.writeTextFile(`${dir}/other.jsonl`, CELLS.split("\n").slice(0, 8).join("\n"));
  await Deno.writeTextFile(`${dir}/compiler/a.vl`, COMPILER_A);
  await Deno.writeTextFile(`${dir}/compiler/b.vl`, COMPILER_B);
  await Deno.writeTextFile(`${dir}/compiler/c.txt`, "\"a .txt file's literal has no lowering\"\n");
  await Deno.writeTextFile(
    `${dir}/scripts/capability-probes/live-sites.json`,
    JSON.stringify(SITES),
  );
};

Deno.test({
  name: "goal scoreboard: the report is the Python's pinned one, byte for byte",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_goal_scoreboard_" });
    try {
      await tree(dir);
      const port = async (argv: string[]) => {
        const { code, stdout, stderr } = await new Deno.Command(VL, {
          args: ["run", SCRIPT, "--compiler", COMPILER, "--", ...argv],
          cwd: dir,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1" }),
        }).output();
        return { code, out: dec.decode(stdout) + dec.decode(stderr) };
      };
      const pin = async (slug: string, argv: string[], want: number) => {
        const gold = await Deno.readTextFile(`${GOLD}/${slug}.txt`);
        const v = await port(argv);
        const got = `exit ${v.code}\n` + v.out.replaceAll(dir, "@D@");
        if (got !== gold) {
          throw new Error(
            `${slug}: the scoreboard disagrees with the Python's pinned report ` +
              `(${GOLD}/${slug}.txt).\nwant:\n${gold}\ngot:\n${got}`,
          );
        }
        if (v.code !== want) throw new Error(`${slug}: want exit ${want}, got ${v.code}`);
        return v.out;
      };
      const all = await pin("report", [], 0);
      for (const v of ["0.12%", "WORDING", "WITNESS", "clause 1 — silent: 3 cells"]) {
        if (!all.includes(v)) {
          throw new Error(`the fixture must reach \`${v}\`; the report is:\n${all}`);
        }
      }
      const sites = await pin("sites", ["--sites", "--top", "1"], 0);
      for (const v of ["HIT ", "ZERO", "WORDED", "UNSEEN"]) {
        if (!sites.includes(`  ${v}`)) {
          throw new Error(`--sites must reach ${v}; it printed:\n${sites}`);
        }
      }
      await pin("top0", ["--top=0", "--si"], 0);
      await pin("baseline", ["--base", "./other.jsonl"], 0);
      await pin("json", ["--json", "out.json"], 0);
      const gold = await Deno.readTextFile(`${GOLD}/json.out.json`);
      const got = await Deno.readTextFile(`${dir}/out.json`);
      if (got !== gold) {
        throw new Error(`--json wrote a different file.\nwant:\n${gold}\ngot:\n${got}`);
      }

      // Disagreement 3: inside the working directory an absolute path prints relative.
      await pin("baseline", ["--baseline", `${dir}/other.jsonl`], 0);
      // Disagreements 1 and 2: an argument error, on one stdout line naming the VL script.
      const usage = "usage: goal-scoreboard.vl [-h] [--baseline BASELINE] [--sites] " +
        "[--top TOP] [--json OUT]\n";
      for (
        const [argv, msg] of [
          [["--nope"], "unrecognized arguments: --nope"],
          [["--top", "x"], "argument --top: invalid int value: 'x'"],
          [["--json"], "argument --json: expected one argument"],
        ]
      ) {
        const v = await port(argv as string[]);
        const want = `${usage}goal-scoreboard.vl: error: ${msg}\n`;
        if (v.code !== 2 || v.out !== want) {
          throw new Error(`${argv}: want exit 2 and\n${want}got exit ${v.code}:\n${v.out}`);
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
