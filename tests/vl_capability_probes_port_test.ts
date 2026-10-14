// THE VL PORT OF THE CAPABILITY-PROBE RUNNER AGREES WITH THE PYTHON, byte for byte.
//
// `scripts/capability-probes.vl` ports `scripts/capability-probes/run.py`
// (architecture-refactor-plan.md, T3). Both grade the probes at a fixed path under the
// checkout with the checkout's own `vl`, so this builds a small checkout of their own —
// the two scripts copied, `std/` and `build/` linked — whose `vl` is a STUB that answers
// from directives in each probe. That is what reaches the outcomes no healthy seed can be
// made to produce on demand: every verdict (RUNS, WRONG, check refuses, emit refuses,
// SILENT, COMPILER TRAP, TIMEOUT before and after the check) and every `--live-sites` row
// (LIVE, FELL, DRIFT, GONE, NOPROBE). It then requires the same stdout and exit code from
// both for the default report, `--floor` and `--live-sites`, red and green; the fan-out
// path (more probes than the port grades in-process) and the in-process one; a named
// `--compiler`; and an empty probe directory. A one-word mutation of the port must red.
//
// The two TIMEOUT probes grade in a tree of their own under a 10 s bound; the rest under 60 s, which
// only a starved machine could reach, so load cannot turn an answering probe into a TIMEOUT.
//
// Where they cannot agree, pinned below rather than left as prose:
//   1. An argument error: both exit 2; the Python's argparse writes to stderr, the port's
//      usage text goes to stdout, because VL has no stderr sink.
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
  console.warn(
    "[vl-capability-probes-port] skipped — missing vl binary or seed wasm.",
  );
}

const dec = new TextDecoder();
type Out = { code: number; out: string };

const P = "scripts/capability-probes";

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
// so the other seventeen are graded with a bound they cannot reach at all.
const TIMEOUTS: Record<string, string> = {
  "o-timeout-run.vl": "// Should print 1.\n//! run-sleep: 600\n",
  "p-timeout-check.vl":
    "//! run-rc: 1\n//! run-out: partial\\n\n//! check-sleep: 600\n",
};
const SLOW = "10";
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
  await Deno.copyFile(`${ROOT}/${P}/run.py`, `${dir}/${P}/run.py`);
  await Deno.copyFile(`${ROOT}/${P}.vl`, `${dir}/${P}.vl`);
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
    "capability probes: the VL port prints the Python's report, byte for byte",
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
      const py = (argv: string[]) =>
        spawn(pythonBin(), [`${P}/run.py`, ...argv]);
      const port = (argv: string[]) =>
        spawn(VL, ["run", `${P}.vl`, "--compiler", COMPILER, "--", ...argv]);
      const agree = async (label: string, argv: string[], want: number) => {
        // Concurrent: neither runner writes to the tree, and a TIMEOUT case is mostly waiting.
        const [p, v] = await Promise.all([py(argv), port(argv)]);
        if (p.code !== v.code || p.out !== v.out) {
          throw new Error(
            `${label}: the port disagrees with the Python.\n` +
              `want exit ${p.code}:\n${p.out}\ngot exit ${v.code}:\n${v.out}`,
          );
        }
        if (p.code !== want) {
          throw new Error(
            `${label}: want exit ${want} from both, got ${p.code}:\n${p.out}`,
          );
        }
        return p.out;
      };
      return { py, port, agree };
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
      const { py, port, agree } = runner(dir, FAST);
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
          "COMPILER TRAP (check rc 0): wasm backtrace:",
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

      // The must-red control: one verdict word changed in the port, in place, because the
      // fan-out's workers are built from that path.
      const src = await Deno.readTextFile(`${dir}/${P}.vl`);
      const bad = src.replace(
        'let where = "emit refuses"',
        'let where = "emit refused"',
      );
      if (bad === src) throw new Error("the mutation did not apply");
      await Deno.writeTextFile(`${dir}/${P}.vl`, bad);
      const m = await port([]);
      await Deno.writeTextFile(`${dir}/${P}.vl`, src);
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

      // Disagreement 1: an argument error.
      const pu = await py(["--nope"]);
      const vu = await port(["--nope"]);
      if (pu.code !== 2 || vu.code !== 2 || !vu.out.startsWith("usage:")) {
        throw new Error(
          `an unknown flag: want exit 2 from both, got ${pu.code} / ${vu.code}:\n${vu.out}`,
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
