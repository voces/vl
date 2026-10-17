// THE DISTILLED-CORPUS TOOLS, PINNED: `regress.vl`, `index.vl`, `redistil.vl` and
// `census/gradecensus.vl`.
//
// Each reads its corpus at a fixed path under the working directory, so this builds a small
// checkout of its own — the tools and `scripts/lib` copied, `std/`, `build/` and
// `scripts/vl-host` linked. The grading fixture has a cell in every class the grader tells
// apart (runs, wrong value with quotes and a non-ASCII letter in its message, loud check
// reject, loud emit reject, check-clean invalid wasm, trap_loads, compiler trap) in both
// `cells/` and `named/`, and `$VL` is a STUB (`support/census_stub_vl.ts`) answering each
// cell from its own `//! key: value` lines, so a compiler fix cannot turn this red. Grading
// runs with `JOBS=2`. The redistil fixture is a census history synthesised on disk.
//
// These tools were ported from Python and graded beside it before it was deleted: every
// output and file below is the one the Python produced, except where they were made to
// differ on purpose, which is pinned here rather than left as prose:
//   1. The fix hints of an incomplete index name `index.vl`, `redistil.vl` and `regress.vl`.
//   2. The seed-slot refusal reads `regress.vl: the first argument is the SEED wasm, ...`.
//   3. A tool given no argument prints a usage text (the Python printed its docstring).
//   4. What the Python wrote to stderr (redistil's `SKIP` lines, `SystemExit` words) is on
//      stdout, because VL has no stderr sink.
//   5. redistil's manifest note and closing hint name `redistil.vl` and `regress.vl`, and a
//      history where every block is skipped exits 1 with a sentence, not a ZeroDivisionError.
//   6. Paths resolve against the working directory, not the script's own location.
//   7. A stored message erases a backtrace frame's module offset (`0: 0xN - `) and a
//      `<wasm function N>` index, which move with any emitter change (a000005, a000007).
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, STD, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-distilled-tools] skipped — missing vl binary or seed wasm.",
  );
}

const dec = new TextDecoder();
type Out = { code: number; out: string };

const D = "scripts/silent-sweep/distilled";
const CENSUS = "scripts/silent-sweep/census";

// One cell per class, as (directives, expected stdout). Names sort in the order listed.
const CELLS: Record<string, [string, string]> = {
  a000001: ["run-out: 42\ncached: 1\n", "42"],
  a000002: ["check-err: type mismatch: expected i32, found string", "s"],
  a000003: [
    "run-rc: 1\nrun-err: Error: emit error\\nf.vl:1:1: emitProgram: a range step of i32's minimum has no negation\\n",
    "10",
  ],
  a000004: ['run-out: it\'s "q" ü\\n', "x"],
  a000005: [
    "run-rc: 70\nrun-err: error: wasm trap: out of bounds array access\\n    0:    0x14b - vl!inner\\n\nbuilt: 1",
    "2",
  ],
  a000006: [
    "run-rc: 1\nrun-err: [wasm] Invalid input WebAssembly code at offset 77: type mismatch\\n",
    "7",
  ],
  a000007: [
    "run-rc: 70\nrun-err: error: wasm trap: unreachable\\n    0:   0x2a - <wasm function 12>\\n",
    "8",
  ],
};
const NAMED: Record<string, [string, string]> = {
  fx_runs: ["run-out: é\\n\ncached: 1", "é"],
  fx_reject: ["check-err: undefined name `undefinedName`", ""],
  fx_wrong: ["run-out: 1\\n2\\n", "1"],
};
const REPRESENTS = [60, 7, 1200, 3, 45, 5, 2];

// The baseline the fixture grades to — what the Python wrote for it, byte for byte.
const BASELINE = [
  `{"cell": "a000001", "class": "runs", "msg": ""}`,
  `{"cell": "a000002", "class": "loud check reject", "msg": "[ERROR]: type mismatch: expected i32, found string"}`,
  `{"cell": "a000003", "class": "loud emit reject", "msg": "Error: Error: emit error  emitProgram: a range step of i32's minimum has no negation"}`,
  `{"cell": "a000004", "class": "runs but wrong value", "msg": "want 'x' got 'it\\\\'s \\"q\\" \\u00fc'"}`,
  `{"cell": "a000005", "class": "trap_loads", "msg": "error: wasm trap: out of bounds array access 0: 0xN - vl!inner"}`,
  `{"cell": "a000006", "class": "check-clean invalid wasm", "msg": "[wasm] Invalid input WebAssembly code at offset N: type mismatch"}`,
  `{"cell": "a000007", "class": "compiler trap", "msg": "error: wasm trap: unreachable 0: 0xN - <wasm function N>"}`,
  `{"cell": "fx_reject", "class": "loud check reject", "msg": "[ERROR]: undefined name \`undefinedName\`"}`,
  `{"cell": "fx_runs", "class": "runs", "msg": ""}`,
  `{"cell": "fx_wrong", "class": "runs but wrong value", "msg": "want '1' got '1\\\\n2'"}`,
].join("\n") + "\n";

const SUMMARY =
  "distilled corpus: 7 representatives standing for 1325 census cells, plus 3 curated cells from named regression sets\n";
// The batch run's eight check-clean cells; the stub traces a hit for the two marked `cached`.
const HEAD = SUMMARY +
  "  module cache: reused 2 of 8 compiled cell modules\n";
const QUIET = HEAD +
  "  runs -> NOT-RUNS  (blocking)    0 classes  (     0 of 1325 census cells)\n" +
  "  -> silent  (report)             0 classes  (     0 of 1325 census cells)\n" +
  "  other movement                  0 classes  (     0 of 1325 census cells)\n" +
  "  no cell changed class ✅\n\n";
const RED = HEAD +
  "  runs -> NOT-RUNS  (blocking)    1 classes  (     7 of 1325 census cells)\n" +
  "      a000002  runs -> loud check reject   [7 cells]\n" +
  "  -> silent  (report)             1 classes  (    45 of 1325 census cells)\n" +
  "      a000005  loud emit reject -> trap_loads   [45 cells]\n" +
  "  other movement                  1 classes  (     1 of 1325 census cells)\n" +
  "      fx_reject  loud check reject -> loud check reject   [1 cells]\n\n" +
  "distilled: REGRESSION — 1 behavioural class(es) stopped running\n";
const INCOMPLETE =
  "distilled: THE CORPUS INDEX IS INCOMPLETE — expected.jsonl does not describe the cells this run would grade, and grading anyway means defaulting an answer nobody computed.\n";
const NO_ROW = INCOMPLETE +
  "  1 cell(s) on disk with NO row: fx_new\n" +
  "    fix: vl run scripts/silent-sweep/distilled/index.vl -- --set <named-set> --missing   (a curated set),\n" +
  "         or vl run scripts/silent-sweep/distilled/redistil.vl                        (a derived cell),\n" +
  "         or regress.vl -- <seed.wasm> --write-baseline --set <named-set> in one move.\n";
const NO_CELL = INCOMPLETE +
  "  1 row(s) with NO cell: fx_new\n" +
  "    fix: vl run scripts/silent-sweep/distilled/index.vl -- --prune, or restore the missing `.vl`.\n";

const want = (label: string, got: Out, code: number, out: string) => {
  if (got.code !== code || got.out !== out) {
    throw new Error(
      `${label}:\nwant exit ${code}:\n${out}\ngot exit ${got.code}:\n${got.out}`,
    );
  }
};

const sameFile = async (label: string, path: string, body: string) => {
  const got = await Deno.readTextFile(path).catch(() => "<absent>");
  if (got !== body) {
    throw new Error(`${label}: ${path}\nwant:\n${body}\ngot:\n${got}`);
  }
};

// A scratch checkout holding the four tools and their libraries.
const checkout = async (dir: string) => {
  for (const d of [`${D}/cells`, `${D}/named`, CENSUS, "scripts/lib"]) {
    await Deno.mkdir(`${dir}/${d}`, { recursive: true });
  }
  for (const f of ["regress.vl", "index.vl", "redistil.vl"]) {
    await Deno.copyFile(`${ROOT}/${D}/${f}`, `${dir}/${D}/${f}`);
  }
  await Deno.copyFile(
    `${ROOT}/${CENSUS}/gradecensus.vl`,
    `${dir}/${CENSUS}/gradecensus.vl`,
  );
  for (const f of ["common.vl", "corpus.vl", "census-grade.vl"]) {
    await Deno.copyFile(`${ROOT}/scripts/lib/${f}`, `${dir}/scripts/lib/${f}`);
  }
  await Deno.symlink(STD, `${dir}/std`);
  await Deno.symlink(`${ROOT}/build`, `${dir}/build`);
  await Deno.symlink(`${ROOT}/scripts/vl-host`, `${dir}/scripts/vl-host`);
};

// The grading fixture: both corpus halves, their index rows and the stub `vl`. A tool's
// own build and its grading worker go to the real binary.
const gradingFixture = async (dir: string) => {
  await checkout(dir);
  await Deno.writeTextFile(
    `${dir}/stubvl`,
    "#!/bin/sh\n" +
      `case "$2" in *regress.vl|*gradecensus.vl|*grader.wasm) exec "${VL}" "$@";; esac\n` +
      `exec "${Deno.execPath()}" run -A --no-check --quiet "${ROOT}/tests/support/census_stub_vl.ts" "$@"\n`,
  );
  await Deno.chmod(`${dir}/stubvl`, 0o755);
  const part = async (
    name: string,
    cells: Record<string, [string, string]>,
  ) => {
    const expect: Record<string, string> = {};
    for (const [c, [src, want]] of Object.entries(cells)) {
      await Deno.writeTextFile(
        `${dir}/${D}/${name}/${c}.vl`,
        src.split("\n").map((l) => `//! ${l}`).join("\n") + "\n",
      );
      expect[c] = want;
    }
    await Deno.writeTextFile(
      `${dir}/${D}/${name}/manifest.json`,
      JSON.stringify({ block: name, expect }, null, 1),
    );
  };
  await part("cells", CELLS);
  await part("named", NAMED);
  const rows = Object.keys(CELLS).map((c, i) =>
    `{"cell": "${c}", "block": "A", "represents": ${REPRESENTS[i]}}`
  );
  for (const c of Object.keys(NAMED)) {
    rows.push(`{"cell": "${c}", "block": "fx-set", "represents": 1}`);
  }
  await Deno.writeTextFile(
    `${dir}/${D}/expected.jsonl`,
    rows.sort().join("\n") + "\n",
  );
  await Deno.writeTextFile(
    `${dir}/${D}/named/sources.json`,
    JSON.stringify({ "fx-set": { "named by": "this test" } }),
  );
};

const runner = (dir: string) => {
  const spawn = async (args: string[], extra = {}): Promise<Out> => {
    const { code, stdout, stderr } = await new Deno.Command(VL, {
      args,
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
      env: nativeEnv({
        NO_COLOR: "1",
        JOBS: "2",
        VL: `${dir}/stubvl`,
        VL_DISTILLED_CACHE: `${dir}/module-cache`,
        ...extra,
      }),
    }).output();
    return { code, out: dec.decode(stdout) + dec.decode(stderr) };
  };
  return (tool: string, argv: string[], extra = {}) =>
    spawn(["run", tool, "--compiler", COMPILER, "--", ...argv], extra);
};

Deno.test({
  name: "regress.vl and gradecensus.vl grade the fixture and report as pinned",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_distilled_tools_" });
    const tool = runner(dir);
    const regress = (argv: string[], extra = {}) =>
      tool(`${D}/regress.vl`, argv, extra);
    const seed = COMPILER;
    try {
      await gradingFixture(dir);
      const wrote = `distilled: wrote baseline for 10 cells from ${seed}\n`;
      want(
        "--write-baseline",
        await regress([
          seed,
          "--write-baseline",
          "--baseline",
          `${dir}/b.jsonl`,
          "--json",
          `${dir}/g.json`,
        ]),
        0,
        wrote,
      );
      await sameFile("--write-baseline", `${dir}/b.jsonl`, BASELINE);
      const graded = JSON.parse(await Deno.readTextFile(`${dir}/g.json`));
      for (const l of BASELINE.trim().split("\n")) {
        const r = JSON.parse(l);
        const g = graded[r.cell];
        if (g?.class !== r.class || g?.msg !== r.msg) {
          throw new Error(
            `--json: ${r.cell} want ${l}, got ${JSON.stringify(g)}`,
          );
        }
      }
      // gradecensus.vl is the same grader over one directory: its file is the `cells` half.
      const cellsHalf = await Deno.readTextFile(`${dir}/g.json.cells`);
      const gc = await tool(`${CENSUS}/gradecensus.vl`, [
        `${D}/cells`,
        seed,
        `${dir}/gc.json`,
      ]);
      want(
        "gradecensus.vl",
        gc,
        0,
        `${dir}/gc.json  cells=7  seed=${seed}\n` +
          "  check-clean invalid wasm        1\n" +
          "  compiler trap                   1\n" +
          "  loud check reject               1\n" +
          "  loud emit reject                1\n" +
          "  runs                            1\n" +
          "  runs but wrong value            1\n" +
          "  trap_loads                      1\n" +
          "  SILENT TOTAL                    4\n",
      );
      await sameFile("gradecensus.vl", `${dir}/gc.json`, cellsHalf);

      await Deno.writeTextFile(`${dir}/${D}/baseline.jsonl`, BASELINE);
      want(
        "a clean diff",
        await regress([seed]),
        0,
        QUIET + "distilled: no runs lost ✅\n",
      );
      want(
        "a fresh --verify-fresh",
        await regress([seed, "--verify-fresh"]),
        0,
        QUIET + "distilled: baseline is fresh for this seed ✅\n",
      );
      // A per-cell grade keeps the run's own `Error: ` prefix, so the emit reject's message
      // moves; the class does not.
      want(
        "a per-cell grade",
        await regress([seed], { GRADE_BATCH: "0" }),
        0,
        SUMMARY +
          "  module cache: reused 0 of 0 compiled cell modules\n" +
          "  runs -> NOT-RUNS  (blocking)    0 classes  (     0 of 1325 census cells)\n" +
          "  -> silent  (report)             0 classes  (     0 of 1325 census cells)\n" +
          "  other movement                  1 classes  (  1200 of 1325 census cells)\n" +
          "      a000003  loud emit reject -> loud emit reject   [1200 cells]\n\n" +
          "distilled: no runs lost ✅\n",
      );

      const red = BASELINE
        .replace(/("a000002", "class": )"loud check reject"/, '$1"runs"')
        .replace(/("a000005", "class": )"trap_loads"/, '$1"loud emit reject"')
        .replace(
          /("fx_reject", "class": "loud check reject", "msg": ")/,
          "$1was ",
        );
      await Deno.writeTextFile(`${dir}/red.jsonl`, red);
      want(
        "a lost runs cell",
        await regress([seed, "--baseline", `${dir}/red.jsonl`]),
        1,
        RED,
      );
      want(
        "a stale --verify-fresh",
        await regress([
          seed,
          "--verify-fresh",
          "--baseline",
          `${dir}/red.jsonl`,
        ]),
        1,
        RED,
      );

      // The index: a cell with no row, refused, then repaired by `--set`; then an orphan row.
      const index = `${dir}/${D}/expected.jsonl`;
      const rows = await Deno.readTextFile(index);
      await Deno.writeTextFile(`${dir}/${D}/named/fx_new.vl`, "print(3)\n");
      want("a cell with no index row", await regress([seed]), 2, NO_ROW);
      want(
        "--write-baseline with no --set",
        await regress([seed, "--write-baseline"]),
        2,
        NO_ROW,
      );
      want(
        "an unknown --set",
        await regress([seed, "--write-baseline", "--set", "nosuchset"]),
        1,
        "index: `nosuchset` has no `named/sources.json` entry. A curated set carries its provenance there — what named it and what it cost — before it carries index rows.\n",
      );
      want(
        "--write-baseline --set",
        await regress([
          seed,
          "--write-baseline",
          "--set",
          "fx-set",
          "--baseline",
          `${dir}/b2.jsonl`,
        ]),
        0,
        "distilled: index — wrote 1 curated row(s) at block fx-set\n" + wrote,
      );
      const withNew = rows.replace(
        `{"cell": "fx_reject"`,
        `{"cell": "fx_new", "block": "fx-set", "represents": 1}\n{"cell": "fx_reject"`,
      );
      await sameFile("--write-baseline --set", index, withNew);
      await sameFile("--write-baseline --set", `${dir}/b2.jsonl`, BASELINE);
      await Deno.remove(`${dir}/${D}/named/fx_new.vl`);
      want("an orphan row", await regress([seed]), 2, NO_CELL);
      want(
        "--write-baseline prunes an orphan",
        await regress([
          seed,
          "--write-baseline",
          "--baseline",
          `${dir}/b3.jsonl`,
        ]),
        0,
        "distilled: index — pruned 1 row(s) whose cell is gone\n" + wrote,
      );
      await sameFile("--write-baseline prunes an orphan", index, rows);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "index.vl checks, prunes and writes the corpus index as pinned",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_distilled_index_" });
    const idx = (argv: string[]) => runner(dir)(`${D}/index.vl`, argv);
    try {
      await gradingFixture(dir);
      const index = `${dir}/${D}/expected.jsonl`;
      const rows = await Deno.readTextFile(index);
      want(
        "--check",
        await idx(["--check"]),
        0,
        "index: 10 rows — 7 derived, 3 curated over 1 named sets ✅\n",
      );
      want(
        "--prune with nothing to prune",
        await idx(["--prune"]),
        0,
        "index: pruned 0 row(s) with no cell\n",
      );
      await Deno.writeTextFile(`${dir}/${D}/named/fx_new.vl`, "print(3)\n");
      const noRow = await idx(["--check"]);
      if (
        noRow.code !== 2 ||
        !noRow.out.includes("1 cell(s) on disk with NO row: fx_new")
      ) {
        throw new Error(
          `--check of an unindexed cell: want exit 2 naming it, got ${noRow.code}:\n${noRow.out}`,
        );
      }
      want(
        "an empty --set",
        await idx(["--set", "fx-set"]),
        1,
        "index: --set names no cells. An empty write is not a no-op, it is a command that did nothing and said it worked.\n",
      );
      want(
        "--set --missing",
        await idx(["--set", "fx-set", "--missing"]),
        0,
        "index: wrote 1 row(s) at block fx-set\n",
      );
      await Deno.remove(`${dir}/${D}/named/fx_new.vl`);
      want(
        "--prune",
        await idx(["--prune"]),
        0,
        "index: pruned 1 row(s) with no cell: fx_new\n",
      );
      await sameFile("--prune", index, rows);
      const usage = await idx([]);
      if (usage.code !== 2 || !usage.out.startsWith("usage:")) {
        throw new Error(
          `no argument: want exit 2 and a usage text, got ${usage.code}:\n${usage.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "redistil.vl collapses a census history into one representative per class",
  ignore: !ENABLED,
  fn: async () => {
    const made = await Deno.makeTempDir({ prefix: "vl_distilled_redistil_" });
    const dir = await Deno.realPath(made);
    const redistil = (argv: string[]) => runner(dir)(`${D}/redistil.vl`, argv);
    try {
      await checkout(dir);
      const census = `${dir}/.claude/worktrees/x/scratch-silent/census`;
      await Deno.mkdir(`${census}/cellsA`, { recursive: true });
      await Deno.mkdir(`${census}/g1`, { recursive: true });
      // 104 cells; two snapshots classify cell i by i % 2 and i % 3, so the classes are i % 6.
      const ids = Array.from(
        { length: 104 },
        (_, i) => `a${String(i + 1).padStart(6, "0")}`,
      );
      const coords: Record<string, number[]> = {};
      const expect: Record<string, string> = {};
      for (const c of ids) {
        await Deno.writeTextFile(
          `${census}/cellsA/${c}.vl`,
          `print(${Number(c.slice(1))})\n`,
        );
        coords[c] = [Number(c.slice(1))];
        expect[c] = `out ${c}`;
      }
      await Deno.writeTextFile(
        `${census}/cellsA/manifest.json`,
        JSON.stringify({ coords, expect }),
      );
      const pad = "x".repeat(2100);
      const snap = async (path: string, cells: string[], by: number) => {
        const s: Record<string, { class: string; msg: string }> = {};
        cells.forEach((c, i) =>
          s[c] = { class: `k${i % by}`, msg: `m${i % by} ${pad}` }
        );
        await Deno.writeTextFile(path, JSON.stringify(s));
      };
      await snap(`${census}/g1/a.json`, ids, 2);
      await snap(`${census}/g1/a3.json`, ids, 3);
      await snap(`${census}/g1/partial.json`, ids.slice(1), 5); // covers too little
      await snap(`${census}/g1/b.json`, ids.map((c) => "b" + c.slice(1)), 2); // no cellsB
      await Deno.writeTextFile(`${dir}/${D}/cells/stale.vl`, "print(0)\n");
      await Deno.writeTextFile(`${dir}/${D}/named/fx_one.vl`, "print(1)\n");
      await Deno.writeTextFile(
        `${dir}/${D}/expected.jsonl`,
        `{"cell": "fx_one", "block": "fx-set", "represents": 1}\n` +
          `{"cell": "stale", "block": "A", "represents": 9}\n`,
      );
      const summary =
        "block A: 104 cells, 2 snapshots -> 6 representatives (94.23% redundant)\n" +
        "block B: no generated cell directory on disk — SKIP\n\n" +
        "TOTAL: 104 cells -> 6 representatives (94.23% redundant, 17x)\n";
      want(
        "--dry-run",
        await redistil(["--dry-run"]),
        0,
        summary + "--dry-run: nothing written\n",
      );
      if (!exists(`${dir}/${D}/cells/stale.vl`)) {
        throw new Error("--dry-run removed cells/");
      }
      want(
        "a rebuild",
        await redistil([]),
        0,
        summary +
          `wrote ${dir}/${D}/cells/*.vl (6 cells), cells/manifest.json and expected.jsonl (6 derived rows re-derived, 1 curated rows carried over)\n` +
          "named/ left untouched: 1 curated cells\n" +
          "now re-baseline:  vl run scripts/silent-sweep/distilled/regress.vl -- <seed.wasm> --write-baseline\n",
      );
      const reps = ids.slice(0, 6);
      const listed = [...Deno.readDirSync(`${dir}/${D}/cells`)].map((e) =>
        e.name
      ).sort();
      const wantListed = [...reps.map((c) => `${c}.vl`), "manifest.json"]
        .sort();
      if (listed.join() !== wantListed.join()) {
        throw new Error(
          `cells/: want ${wantListed.join(", ")}, got ${listed.join(", ")}`,
        );
      }
      await sameFile(
        "a rebuild",
        `${dir}/${D}/expected.jsonl`,
        reps.map((c, i) =>
          `{"cell": "${c}", "block": "A", "represents": ${i < 2 ? 18 : 17}}\n`
        ).join("") +
          `{"cell": "fx_one", "block": "fx-set", "represents": 1}\n`,
      );
      await sameFile(
        "a rebuild",
        `${dir}/${D}/cells/manifest.json`,
        '{\n "block": "distilled",\n "expect": {\n' +
          reps.map((c) => `  "${c}": "out ${c}"`).join(",\n") +
          '\n },\n "generated": 6,\n "meta": {\n  "note": "one representative per behavioural equivalence class of the census; rebuilt by redistil.vl"\n }\n}',
      );
      want(
        "every block skipped",
        await redistil(["--snapshots", `${census}/g1/b.json`]),
        1,
        "block B: no generated cell directory on disk — SKIP\n\n" +
          "TOTAL: no block had both a cell directory and a covering snapshot\n",
      );
      want(
        "no snapshot",
        await redistil(["--snapshots", `${dir}/nowhere/*.json`]),
        1,
        `no graded snapshots matched ${dir}/nowhere/*.json\n`,
      );
    } finally {
      await Deno.remove(made, { recursive: true });
    }
  },
});
