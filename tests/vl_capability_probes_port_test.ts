// THE CAPABILITY-PROBE RUNNER'S REPORT, PINNED to what the Python it replaced printed.
//
// `scripts/capability-probes.vl` ported `scripts/capability-probes/run.py`
// (architecture-refactor-plan.md, T3), and this suite graded the two BESIDE each other,
// output for output, until the Python was deleted. Each golden under
// `tests/fixtures/capability-probes-port/` is the PYTHON's stdout, stderr and exit code on
// the last beside-run, with this suite's temp dirs and `std/` written as `@D@`, `@T@` and
// `@S@`; the port printed every one byte for byte. The fixture is a small checkout whose
// `vl` is a STUB answering from directives in each probe, which is what reaches the outcomes
// no healthy seed produces on demand: every verdict (RUNS, WRONG, check refuses, emit
// refuses, SILENT, COMPILER TRAP, TIMEOUT before and after the check), every `--live-sites`
// row (LIVE, FELL, DRIFT, GONE, NOPROBE), red and green, the fan-out and in-process paths, a
// named `--compiler` and an empty probe directory. A one-word mutation of the grader must red.
//
// The two TIMEOUT probes grade in a tree of their own under a 3 s bound; the rest under 60 s,
// which only a starved machine could reach, so load cannot turn an answering probe into one.
//
// Where they could not agree, pinned below rather than left as prose:
//   1. An argument error: both exit 2; the Python's argparse wrote to stderr, the port's
//      usage text goes to stdout, because VL has no stderr sink.
//   2. The usage and error lines name `capability-probes.vl`, where the Python's named
//      `run.py`: a message naming a deleted script would be wrong.
//
// Since the Python's deletion the goldens follow the grader, not it: a trap is COMPILER
// TRAP only on the host's exit 70 or its banner, any other trap past a clean check is
// TRAP (program), and a trap's detail is its `wasm trap:` line. So `n-trap-inv` (exit 1,
// an invalid module) is SILENT, and `n2`/`n3` are the program-trap and banner controls.

// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, STD, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-capability-probes-port] skipped — missing vl binary or seed wasm.",
  );
}

const dec = new TextDecoder();
type Out = { code: number; out: string };

const P = "scripts/capability-probes";
const GOLD = `${ROOT}/tests/fixtures/capability-probes-port`;

// The stub `vl`: `<cmd> <probe> --compiler <seed>`, answered from the probe's `//! <cmd>-…:`
// lines. `@F@` is the probe's path, `@C@` the seed and `@S@` `$VL_STD`, so the
// report also shows that both runners hand the child the same three.
const STUB = `#!/usr/bin/env bash
cmd=$1; f=$2; c=$4
d() { sed -n "s|^//! $1: ||p" "$f" | head -1; }
s=$(d "$cmd-sleep"); [ -n "$s" ] && exec sleep "$s"
sub() { local t=\${1//@F@/$f}; t=\${t//@C@/$c}; printf '%b' "\${t//@S@/$VL_STD}"; }
o=$(d "$cmd-out"); e=$(d "$cmd-err"); rc=$(d "$cmd-rc")
[ -n "$o" ] && sub "$o"
[ -n "$e" ] && sub "$e" >&2
exit \${rc:-0}
`;

const CHECKED = "//! check-out: Checked 1 file, no errors.\\n";
const LONG = "emitProgram: ü".padEnd(84, "x") +
  " — the late LIVE literal is here";

// Probe name → its source. Names sort in the order listed.
const PROBES: Record<string, string> = {
  "a-runs.vl": "// Should print 42.\n//! run-out: 42\\n\nprint(42)\n",
  "b-twice.vl": "// Should print 7 twice.   \n//! run-out: 7\\n7\\n\n",
  "c-then.vl":
    "// A contract.\n// Should print 1 then 0\n//! run-out: 1\\r\\n 0 \\n\n",
  "d-noheader.vl":
    "// Nothing to compare against.\n//! run-out: anything @S@\\n\n",
  "e-wrong.vl":
    '// Should print 5 then 6.\n//! run-out: it\'s "q" ü\\t\\x01 @C@\\n\n',
  "f-check.vl": [
    "// Should print 1.",
    "//! run-rc: 1",
    "//! run-err: @F@:3:1: [ERROR]: cannot lower\\n",
    "//! check-rc: 1",
    "//! check-out: [HINT] use const\\n@F@:3:1:  [ERROR]: type mismatch in argument\\n  context\\nFound 1 error.\\n",
    "",
  ].join("\n"),
  "g-emit-phrase.vl": [
    "//! run-rc: 1",
    '//! run-err: Error: emit error\\n@F@:1:1: emitProgram: `==` over f64[] has no lowering for "quoted" and a tail that runs far past the fifty-four\\n',
    CHECKED,
    "",
  ].join("\n"),
  "h-emit-plain.vl": [
    "//! run-rc: 1",
    `//! run-err: [WARNING] unused\\n${LONG}\\n`,
    CHECKED,
    "",
  ].join("\n"),
  "i-emit-empty.vl": "//! run-rc: 1\n",
  "j-silent-inv.vl": [
    "//! run-rc: 1",
    "//! run-err: [wasm] Invalid input WebAssembly code at offset 1234: type mismatch: expected (ref $type), found (ref null $type) and more\\n",
    CHECKED,
    "",
  ].join("\n"),
  "k-silent-tm.vl": [
    "//! run-rc: 1",
    "//! run-err: failed to parse WebAssembly module\\nfunc 3: type mismatch: expected i32, found i64 ü with a long continuation\\n",
    "",
  ].join("\n"),
  "l-silent-none.vl": [
    "//! run-rc: 1",
    "//! run-err: WebAssembly translation error\\n   indented\\nthe last line\\n",
    "",
  ].join("\n"),
  "m-trap.vl": [
    "//! run-rc: 70",
    "//! run-err: error: wasm trap: out of bounds\\nwasm backtrace:\\n    0: 0x1 - <unknown>\\n",
    CHECKED,
    "",
  ].join("\n"),
  "n-trap-inv.vl": [
    "//! run-rc: 1",
    "//! run-err: call stack exhausted\\nInvalid input WebAssembly code\\n",
    "",
  ].join("\n"),
  "n2-trap-program.vl": [
    "//! run-rc: 1",
    "//! run-err: Error: error while executing at wasm backtrace:\\n    0: 0x1 - vl!f\\n\\nCaused by:\\n    wasm trap: null reference\\n",
    CHECKED,
    "",
  ].join("\n"),
  "n3-trap-banner.vl": [
    "//! run-rc: 70",
    "//! run-err: vl: the compiler itself trapped while compiling x.vl. This is a bug in vl, not in your program.\\nError: wasm trap: out of bounds array access\\n",
    CHECKED,
    "",
  ].join("\n"),
  "q-scenery.vl": [
    "//! run-rc: 1",
    "//! run-err: Error: emit error  \\nChecked 3 files, no errors.\\nFound 2 errors.\\n[ERROR]:\\nfoo.vl:1:2:   the real cause\\n",
    "",
  ].join("\n"),
  "r-live.vl": [
    "//! run-rc: 1",
    `//! run-err: ${LONG}\\n`,
    CHECKED,
    "",
  ].join("\n"),
  "s-drift.vl": [
    "//! run-rc: 1",
    "//! run-err: emitProgram: some other refusal\\n",
    CHECKED,
    "",
  ].join("\n"),
};

// The two probes that answer by never answering. They are graded apart, in a tree of their
// own and under a bound long enough that no probe that DOES answer can be starved into one,
// so the other nineteen are graded with a bound they cannot reach at all.
const TIMEOUTS: Record<string, string> = {
  "o-timeout-run.vl": "// Should print 1.\n//! run-sleep: 600\n",
  "p-timeout-check.vl":
    "//! run-rc: 1\n//! run-out: partial\\n\n//! check-sleep: 600\n",
};
const SLOW = "3";
const FAST = "60";

// Probes no green run can hold: dropped for the green cases.
const RED = [
  "e-wrong.vl",
  "f-check.vl",
  "g-emit-phrase.vl",
  "h-emit-plain.vl",
  "i-emit-empty.vl",
  "j-silent-inv.vl",
  "k-silent-tm.vl",
  "l-silent-none.vl",
  "m-trap.vl",
  "n-trap-inv.vl",
  "n2-trap-program.vl",
  "n3-trap-banner.vl",
  "q-scenery.vl",
  "r-live.vl",
  "s-drift.vl",
];

const site = (literal: string, probe: string) => ({
  literal,
  probe,
  row: "D0",
});
const LIVE_LIT = "the late LIVE literal is here";
const SITES = [
  site(LIVE_LIT, "r-live.vl"),
  site("emitProgram: a FELL literal whose witness runs", "a-runs.vl"),
  site("emitProgram: a DRIFT literal", "s-drift.vl"),
  site("emitProgram: a GONE literal that left the compiler", "r-live.vl"),
  site("emitProgram: a NOPROBE literal", "no-such-probe.vl"),
  site(
    "emitProgram: ü a literal long enough that the sixty-four code point cut shows " +
      LIVE_LIT,
    "h-emit-plain.vl",
  ),
];

const tree = async (dir: string, probes: Record<string, string> = PROBES) => {
  await Deno.mkdir(`${dir}/${P}`, { recursive: true });
  await Deno.mkdir(`${dir}/compiler`, { recursive: true });
  await Deno.mkdir(`${dir}/scripts/vl-host/target/release`, {
    recursive: true,
  });
  await Deno.copyFile(`${ROOT}/${P}.vl`, `${dir}/${P}.vl`);
  await Deno.mkdir(`${dir}/scripts/lib`, { recursive: true });
  for (const l of ["common.vl", "probe-grade.vl"]) {
    await Deno.copyFile(`${ROOT}/scripts/lib/${l}`, `${dir}/scripts/lib/${l}`);
  }
  await Deno.symlink(STD, `${dir}/std`);
  await Deno.symlink(`${ROOT}/build`, `${dir}/build`);
  const stub = `${dir}/scripts/vl-host/target/release/vl`;
  await Deno.writeTextFile(stub, STUB);
  await Deno.chmod(stub, 0o755);
  for (const [n, src] of Object.entries(probes)) {
    await Deno.writeTextFile(`${dir}/${P}/${n}`, src);
  }
  await Deno.writeTextFile(
    `${dir}/${P}/live-sites.json`,
    JSON.stringify({ sites: SITES }),
  );
  // Every literal but the GONE one is in the compiler's source, quoted, across two files.
  await Deno.writeTextFile(
    `${dir}/compiler/a.vl`,
    SITES.slice(0, 2).map((s) => `emitFail("${s.literal}")\n`).join(""),
  );
  await Deno.writeTextFile(
    `${dir}/compiler/b.vl`,
    [SITES[2], SITES[4], SITES[5]].map((s) => `x = "${s.literal}"\n`).join(""),
  );
  await Deno.writeTextFile(`${dir}/compiler/c.txt`, `"${SITES[3].literal}"\n`);
};

Deno.test({
  name:
    "capability probes: the runner prints the Python's pinned report, byte for byte",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({
      prefix: "vl_capability_probes_port_",
    });
    const dirT = await Deno.makeTempDir({
      prefix: "vl_capability_probes_port_t_",
    });
    // One runner per tree: `cwd` is the checkout the scripts grade, `bound` its timeout.
    const runner = (cwd: string, bound: string) => {
      const spawn = async (cmd: string, args: string[]): Promise<Out> => {
        const { code, stdout, stderr } = await new Deno.Command(cmd, {
          args,
          cwd,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({
            NO_COLOR: "1",
            JOBS: "2",
            VL,
            VL_PROBE_TIMEOUT: bound,
          }),
        }).output();
        return { code, out: dec.decode(stdout) + dec.decode(stderr) };
      };
      const port = (argv: string[]) =>
        spawn(VL, ["run", `${P}.vl`, "--compiler", COMPILER, "--", ...argv]);
      const norm = (s: string) =>
        s.replaceAll(dirT, "@T@").replaceAll(dir, "@D@").replaceAll(STD, "@S@");
      const agree = async (label: string, argv: string[], want: number) => {
        const slug = label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
        const gold = await Deno.readTextFile(`${GOLD}/${slug}.txt`);
        const v = await port(argv);
        const got = `exit ${v.code}\n` + norm(v.out);
        if (got !== gold) {
          throw new Error(
            `${label}: the runner disagrees with the Python's pinned report ` +
              `(${GOLD}/${slug}.txt).\nwant:\n${gold}\ngot:\n${got}`,
          );
        }
        if (v.code !== want) {
          throw new Error(`${label}: want exit ${want}, got ${v.code}:\n${v.out}`);
        }
        return v.out;
      };
      return { port, agree };
    };
    // The probes that never answer, in a tree of their own under the bound that lets them
    // time out. Mostly waiting, so they grade beside the rest rather than before it.
    const timeouts = async () => {
      await tree(dirT, TIMEOUTS);
      const slow = await runner(dirT, SLOW).agree("the timeouts", [], 1);
      for (
        const v of [
          `TIMEOUT: no answer in ${SLOW}s`,
          `TIMEOUT: check gave no answer in ${SLOW}s`,
        ]
      ) {
        if (!slow.includes(v)) {
          throw new Error(
            `the fixture must reach \`${v}\`; the report is:\n${slow}`,
          );
        }
      }
    };
    const rest = async () => {
      const { port, agree } = runner(dir, FAST);
      await tree(dir);
      const all = await agree("the report", [], 1);
      for (
        const v of [
          "RUNS  a-runs.vl",
          "RUNS  d-noheader.vl",
          "RUNS but output",
          "check refuses: ",
          "emit refuses: has no lowering",
          "SILENT (check rc 0): Invalid input",
          "SILENT (check rc 0): type mismatch: expected i32",
          "SILENT (check rc 0): the last line",
          "COMPILER TRAP (check rc 0): wasm trap: out of bounds",
          "TRAP (program): wasm trap: null reference",
          "emit refuses: the real cause",
        ]
      ) {
        if (!all.includes(v)) {
          throw new Error(
            `the fixture must reach \`${v}\`; the report is:\n${all}`,
          );
        }
      }
      await agree("--floor", ["--floor"], 1);
      const live = await agree("--live-sites", ["--live-sites"], 1);
      for (const v of ["LIVE ", "FELL ", "DRIFT ", "GONE ", "NOPROBE "]) {
        if (!live.includes(`  ${v}`)) {
          throw new Error(`--live-sites must reach ${v}; it printed:\n${live}`);
        }
      }
      await agree("a named --compiler", ["--compiler", `${dir}/other.wasm`], 1);
      await agree("--compiler=", ["--floor", `--compiler=${dir}/x.wasm`], 1);

      // The must-red control: one verdict word changed in the grader, in place, because the
      // fan-out's workers are built from that path.
      const lib = `${dir}/scripts/lib/probe-grade.vl`;
      const src = await Deno.readTextFile(lib);
      const bad = src.replace(
        'let where = "emit refuses"',
        'let where = "emit refused"',
      );
      if (bad === src) throw new Error("the mutation did not apply");
      await Deno.writeTextFile(lib, bad);
      const m = await port([]);
      await Deno.writeTextFile(lib, src);
      if (m.out === all) {
        throw new Error(`a mutated port must disagree, and printed:\n${m.out}`);
      }

      // Green: every red probe gone, so the in-process path grades what is left.
      for (const n of RED) await Deno.remove(`${dir}/${P}/${n}`);
      await Deno.writeTextFile(
        `${dir}/${P}/live-sites.json`,
        JSON.stringify({
          sites: [site("emitProgram: a DRIFT literal", "c-then.vl")],
        }),
      );
      await Deno.writeTextFile(
        `${dir}/${P}/c-then.vl`,
        PROBES["c-then.vl"] +
          "//! run-rc: 3\n//! run-err: emitProgram: a DRIFT literal\\n\n",
      );
      await agree("a green --live-sites", ["--live-sites"], 0);
      await Deno.writeTextFile(`${dir}/${P}/c-then.vl`, PROBES["c-then.vl"]);
      await agree("a green report", [], 0);
      await agree("a green --floor", ["--floor"], 0);
      for (const n of Object.keys(PROBES)) {
        if (!RED.includes(n)) await Deno.remove(`${dir}/${P}/${n}`);
      }
      await agree("no probes", [], 1);

      // Disagreements 1 and 2: an argument error, on stdout, naming the VL script.
      const vu = await port(["--nope"]);
      const wantU = "usage: capability-probes.vl [-h] [--compiler COMPILER] " +
        "[--live-sites] [--floor]\n" +
        "capability-probes.vl: error: unrecognized arguments: --nope\n";
      if (vu.code !== 2 || vu.out !== wantU) {
        throw new Error(
          `an unknown flag: want exit 2 and\n${wantU}got exit ${vu.code}:\n${vu.out}`,
        );
      }
    };
    try {
      const done = await Promise.allSettled([timeouts(), rest()]);
      for (const d of done) if (d.status === "rejected") throw d.reason;
    } finally {
      await Deno.remove(dir, { recursive: true });
      await Deno.remove(dirT, { recursive: true });
    }
  },
});
