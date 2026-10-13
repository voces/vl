// THE VL PORT OF THE DISTILLED-CORPUS GATE AGREES WITH THE PYTHON, byte for byte.
//
// `scripts/silent-sweep/distilled/regress.vl` ports `regress.py` and the grading half of
// `census/gradecensus.py` (architecture-refactor-plan.md, T3). Both read their corpus at a
// fixed path under the checkout, so this builds a small checkout of their own — the scripts
// copied, `std/`, `build/` and `scripts/vl-host` linked — with a fixture corpus whose cells
// land in every class the grader can tell apart: runs, wrong value (quotes and a non-ASCII
// letter in the `%r` message), loud check reject, loud emit reject, check-clean invalid wasm,
// trap_loads and compiler trap, in both `cells/` and `named/`. The graders' `$VL` is a STUB
// that answers each cell from `//! key: value` lines, so no outcome is a live compiler
// defect and a compiler fix cannot turn this red. It then requires the same stdout, exit code
// and files from both for: `--write-baseline`, a clean diff, a doctored baseline with a lost
// `runs` cell, a move into silent and a message change (exit 1), `--verify-fresh` stale and
// fresh, a per-cell grade (`GRADE_BATCH=0`), an incomplete index, its `--set` repair, the
// prune of an orphan row, and the two seed-slot refusals. Grading runs with `JOBS=2`.
//
// Where they cannot agree, pinned below rather than left as prose:
//   1. No argument: both exit 2; the Python prints its docstring, the port a usage text.
//   2. A loud failure the Python raises (`SystemExit` from `index.write_set`, an unreadable
//      file): the same words on the port's stdout, because VL has no stderr sink.
//   Not exercised here, by construction: a non-ASCII code point Python's `isprintable`
//   refuses because it is UNASSIGNED (the port tables only separators, format, control and
//   private-use code points), and child output that is not UTF-8 (the port decodes lossily).
//
// @test-timing native

import {
  COMPILER,
  exists,
  nativeEnv,
  pythonBin,
  ROOT,
  STD,
  VL,
} from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-regress-port] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();
type Out = { code: number; out: string };

const D = "scripts/silent-sweep/distilled";

// The stub `vl` both graders spawn (`$VL`): it answers `check`, `check --batch --json`,
// `run`, `run --batch --out-dir` and `build` from `//! key: value` lines in each cell
// (`\n` in a value is a newline). The port builds `regress.vl` with `$VL` and runs the result for
// its grading chunks, so the stub's wrapper hands those two calls to the real binary, so no outcome depends on a live compiler defect.
// Keys: `check-err` (a check error message), `run-out`, `run-err`, `run-rc`, `built`.
const STUB_PY = `import json, os, sys
a = sys.argv[1:]
def d(f):
    o = {}
    for l in open(f, encoding="utf-8"):
        if l.startswith("//! ") and ": " in l:
            k, v = l[4:].rstrip("\\n").split(": ", 1)
            o[k] = v.replace("\\\\n", "\\n")
    return o
def files(): return [x for x in a[1:] if x.endswith(".vl")]
def out(s, e=sys.stdout): e.write(s); e.flush()
if a[0] == "check" and "--batch" in a:
    for f in files():
        m = d(f).get("check-err")
        out(json.dumps({"exit": 1 if m else 0, "diagnostics":
            [{"severity": "error", "message": m}] if m else []}) + "\\n")
elif a[0] == "check":
    m = d(a[1]).get("check-err")
    out("[ERROR]: " + m + "\\n" if m else "Checked 1 file, no errors.\\n")
    sys.exit(1 if m else 0)
elif a[0] == "run" and "--batch" in a:
    od = a[a.index("--out-dir") + 1]
    for f in files():
        c = d(f)
        n = os.path.join(od, os.path.basename(f))
        open(n + ".out", "w", encoding="utf-8").write(c.get("run-out", ""))
        if int(c.get("run-rc", "0")) != 0:
            open(n + ".err", "w", encoding="utf-8").write(c.get("run-err", ""))
elif a[0] == "run":
    c = d(a[1])
    out(c.get("run-out", ""))
    out(c.get("run-err", ""), sys.stderr)
    sys.exit(int(c.get("run-rc", "0")))
elif a[0] == "build":
    if d(a[1]).get("built") == "1":
        open(a[a.index("-o") + 1], "wb").write(b"\\0asm")
else:
    sys.exit(64)
`;

// One cell per class, as (directives, expected stdout). Names sort in the order listed.
const CELLS: Record<string, [string, string]> = {
  a000001: ["run-out: 42\n", "42"],
  a000002: ["check-err: type mismatch: expected i32, found string", "s"],
  a000003: [
    "run-rc: 1\nrun-err: Error: emit error\\nf.vl:1:1: emitProgram: a range step of i32's minimum has no negation\\n",
    "10",
  ],
  a000004: ['run-out: it\'s "q" \u00fc\\n', "x"],
  a000005: [
    "run-rc: 70\nrun-err: error: wasm trap: out of bounds array access\\n\nbuilt: 1",
    "2",
  ],
  a000006: [
    "run-rc: 1\nrun-err: [wasm] Invalid input WebAssembly code at offset 77: type mismatch\\n",
    "7",
  ],
  a000007: ["run-rc: 70\nrun-err: error: wasm trap: unreachable\\n", "8"],
};
const NAMED: Record<string, [string, string]> = {
  fx_runs: ["run-out: \u00e9\\n", "\u00e9"],
  fx_reject: ["check-err: undefined name `undefinedName`", ""],
  fx_wrong: ["run-out: 1\\n2\\n", "1"],
};
const REPRESENTS = [60, 7, 1200, 3, 45, 5, 2];

const tree = async (dir: string) => {
  await Deno.mkdir(`${dir}/${D}/cells`, { recursive: true });
  await Deno.mkdir(`${dir}/${D}/named`, { recursive: true });
  await Deno.mkdir(`${dir}/scripts/silent-sweep/census`, { recursive: true });
  for (const f of ["regress.py", "index.py", "cellmap.py", "regress.vl"]) {
    await Deno.copyFile(`${ROOT}/${D}/${f}`, `${dir}/${D}/${f}`);
  }
  await Deno.mkdir(`${dir}/scripts/lib`, { recursive: true });
  await Deno.copyFile(
    `${ROOT}/scripts/lib/common.vl`,
    `${dir}/scripts/lib/common.vl`,
  );
  await Deno.copyFile(
    `${ROOT}/scripts/silent-sweep/census/gradecensus.py`,
    `${dir}/scripts/silent-sweep/census/gradecensus.py`,
  );
  await Deno.symlink(STD, `${dir}/std`);
  await Deno.symlink(`${ROOT}/build`, `${dir}/build`);
  await Deno.symlink(`${ROOT}/scripts/vl-host`, `${dir}/scripts/vl-host`);
  await Deno.writeTextFile(`${dir}/stubvl.py`, STUB_PY);
  await Deno.writeTextFile(
    `${dir}/stubvl`,
    `#!/bin/sh\ncase "$2" in *regress.vl|*grader.wasm) exec "${VL}" "$@";; esac\n` +
      `exec "${pythonBin()}" "${dir}/stubvl.py" "$@"\n`,
  );
  await Deno.chmod(`${dir}/stubvl`, 0o755);
  const rows: string[] = [];
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
  Object.keys(CELLS).forEach((c, i) =>
    rows.push(`{"cell": "${c}", "block": "A", "represents": ${REPRESENTS[i]}}`)
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

Deno.test({
  name:
    "regress: the VL port prints the Python's report and writes its files, byte for byte",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_regress_port_" });
    const spawn = async (
      cmd: string,
      args: string[],
      extra = {},
    ): Promise<Out> => {
      const { code, stdout, stderr } = await new Deno.Command(cmd, {
        args,
        cwd: dir,
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({
          NO_COLOR: "1",
          JOBS: "2",
          VL: `${dir}/stubvl`,
          ...extra,
        }),
      }).output();
      return { code, out: dec.decode(stdout) + dec.decode(stderr) };
    };
    const py = (argv: string[], extra = {}) =>
      spawn(pythonBin(), [`${D}/regress.py`, ...argv], extra);
    const port = (argv: string[], extra = {}) =>
      spawn(VL, [
        "run",
        `${D}/regress.vl`,
        "--compiler",
        COMPILER,
        "--",
        ...argv,
      ], extra);
    const read = (f: string) =>
      Deno.readTextFile(`${dir}/${f}`).catch(() => "<absent>");
    // Run both on the same tree state, restoring `restore` (path → content) before each.
    const agree = async (
      label: string,
      argv: (who: string) => string[],
      files: (who: string) => string[] = () => [],
      restore: Record<string, string> = {},
      extra = {},
    ) => {
      const reset = async () => {
        for (const [f, t] of Object.entries(restore)) {
          await Deno.writeTextFile(`${dir}/${f}`, t);
        }
      };
      await reset();
      const p = await py(argv("py"), extra);
      const pf = await Promise.all(files("py").map(read));
      await reset();
      const v = await port(argv("vl"), extra);
      const vf = await Promise.all(files("vl").map(read));
      if (p.code !== v.code || p.out !== v.out) {
        throw new Error(
          `${label}: the port disagrees with the Python.\n` +
            `want exit ${p.code}:\n${p.out}\ngot exit ${v.code}:\n${v.out}`,
        );
      }
      pf.forEach((t, i) => {
        if (t !== vf[i]) {
          throw new Error(
            `${label}: ${files("vl")[i]} differs.\nwant:\n${t}\ngot:\n${vf[i]}`,
          );
        }
      });
      return p;
    };
    try {
      await tree(dir);
      const seed = COMPILER;
      const json = (w: string) => `${dir}/${w}.json`;
      const w = await agree(
        "--write-baseline",
        (
          who,
        ) => [
          seed,
          "--write-baseline",
          "--baseline",
          `${dir}/${who}.jsonl`,
          "--json",
          json(who),
        ],
        (
          who,
        ) => [
          `${who}.jsonl`,
          `${who}.json`,
          `${who}.json.cells`,
          `${who}.json.named`,
        ],
      );
      if (w.code !== 0) {
        throw new Error(`--write-baseline must succeed, got:\n${w.out}`);
      }
      const base = await read("py.jsonl");
      for (
        const cls of [
          "runs but wrong value",
          "loud check reject",
          "loud emit reject",
          "trap_loads",
          "check-clean invalid wasm",
          "compiler trap",
        ]
      ) {
        if (!base.includes(`"class": "${cls}"`)) {
          throw new Error(
            `the fixture must reach \`${cls}\`; its baseline is:\n${base}`,
          );
        }
      }
      await Deno.writeTextFile(`${dir}/${D}/baseline.jsonl`, base);

      const clean = await agree(
        "a clean diff",
        (who) => [seed, "--json", json(who)],
        (who) => [`${who}.json`],
      );
      if (clean.code !== 0) {
        throw new Error(`a fresh baseline must pass, got:\n${clean.out}`);
      }
      await agree(
        "a fresh --verify-fresh",
        (who) => [seed, "--verify-fresh", "--json", json(who)],
      );
      await agree(
        "a per-cell grade",
        (who) => [seed, "--json", json(who)],
        (who) => [`${who}.json`],
        {},
        {
          GRADE_BATCH: "0",
        },
      );

      const red = base
        .replace(/("a000002", "class": )"loud check reject"/, '$1"runs"')
        .replace(/("a000005", "class": )"trap_loads"/, '$1"loud emit reject"')
        .replace(
          /("fx_reject", "class": "loud check reject", "msg": ")/,
          "$1was ",
        );
      if (red === base) {
        throw new Error(`the doctored baseline did not change:\n${base}`);
      }
      await Deno.writeTextFile(`${dir}/red.jsonl`, red);
      const r = await agree(
        "a lost runs cell",
        (who) => [seed, "--baseline", `${dir}/red.jsonl`, "--json", json(who)],
      );
      if (r.code !== 1 || !r.out.includes("REGRESSION")) {
        throw new Error(
          `a lost runs cell must exit 1 with REGRESSION, got ${r.code}:\n${r.out}`,
        );
      }
      await agree("a stale --verify-fresh", (who) => [
        seed,
        "--verify-fresh",
        "--baseline",
        `${dir}/red.jsonl`,
        "--json",
        json(who),
      ]);

      // The index: a cell with no row, refused, then repaired by `--set`; then an orphan row.
      const expected = await read(`${D}/expected.jsonl`);
      await Deno.writeTextFile(`${dir}/${D}/named/fx_new.vl`, "print(3)\n");
      await agree("a cell with no index row", () => [seed]);
      await agree(
        "--write-baseline with no --set",
        () => [seed, "--write-baseline"],
      );
      const at = { [`${D}/expected.jsonl`]: expected };
      await agree(
        "--write-baseline --set",
        (
          who,
        ) => [
          seed,
          "--write-baseline",
          "--set",
          "fx-set",
          "--baseline",
          `${dir}/${who}.jsonl`,
          "--json",
          json(who),
        ],
        (who) => [`${D}/expected.jsonl`, `${who}.jsonl`],
        at,
      );
      await Deno.remove(`${dir}/${D}/named/fx_new.vl`);
      const orphaned = await read(`${D}/expected.jsonl`);
      const ot = { [`${D}/expected.jsonl`]: orphaned };
      await agree("an orphan row", () => [seed], () => [], ot);
      await agree(
        "--write-baseline prunes an orphan",
        (
          who,
        ) => [
          seed,
          "--write-baseline",
          "--baseline",
          `${dir}/${who}.jsonl`,
          "--json",
          json(who),
        ],
        (who) => [`${D}/expected.jsonl`, `${who}.jsonl`],
        ot,
      );

      // The seed slot: a flag, and a path that does not exist (regress_seed_arg_test.ts).
      for (
        const bad of [["--verify-fresh"], [
          "build/no-such-seed.wasm",
          "--verify-fresh",
        ]]
      ) {
        const b = await agree(`seed slot ${bad[0]}`, () => bad);
        if (b.code !== 2 || !b.out.includes(bad[0])) {
          throw new Error(
            `a bad seed slot must exit 2 naming it, got ${b.code}:\n${b.out}`,
          );
        }
      }
      // Disagreement 1: no argument.
      const pu = await py([]);
      const vu = await port([]);
      if (pu.code !== 2 || vu.code !== 2 || !vu.out.startsWith("usage:")) {
        throw new Error(
          `no-argument usage: want exit 2 from both, got ${pu.code} / ${vu.code}:\n${vu.out}`,
        );
      }
      // Disagreement 2: `--set` naming no provenance, the Python's `SystemExit` on stderr.
      await Deno.writeTextFile(`${dir}/${D}/named/fx_new.vl`, "print(3)\n");
      const ps = await py([seed, "--write-baseline", "--set", "nosuchset"]);
      const vs = await port([seed, "--write-baseline", "--set", "nosuchset"]);
      if (ps.code !== 1 || vs.code !== 1 || ps.out !== vs.out) {
        throw new Error(
          `an unknown --set: want the same words and exit 1, got ${ps.code} / ${vs.code}:\n${vs.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
