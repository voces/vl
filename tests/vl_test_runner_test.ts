// NATIVE `vl test` — the runner (docs/internals/vl-test-design.md). Every
// behaviour asserted here is a claim the design makes:
//
//   * discovery finds `*.test.vl` and nothing else;
//   * a failing expectation reports the message `std:test` RECORDED, not a trap;
//   * a TRAP in one test fails that test alone — the tests after it still run
//     (the isolation proof: the host re-instantiates the module);
//   * a test file that does not COMPILE is one failing entry and the run continues;
//   * a green run exits 0, any failure exits 1, a usage error exits 2;
//   * files really are SCHEDULED in parallel (their stamped run intervals
//     overlap under `--jobs 4` and are disjoint under `--jobs 1`).
//
// The report is built entirely in VL (`compiler/cli.vl`) — the host contributes
// only wasm instances, the thread pool and trap catching — so these assertions
// also gate the brain/mechanism split.
//
// GATING: same as tests/selfhost_native_align_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const FIXTURES = `${ROOT}/tests/fixtures/vl-test`;
const SLOW = `${ROOT}/tests/fixtures/vl-test-parallel`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-test-runner] skipped — missing vl binary or seed wasm.");
}

const runTest = async (
  target: string,
  extraArgs: string[] = [],
  extraEnv: Record<string, string> = {},
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["test", target, "--compiler", COMPILER, ...extraArgs],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", ...extraEnv },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

/** Every report line, trimmed of the report's own indentation. */
const lines = (s: string): string[] =>
  s.split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);

const has = (report: string, needle: string): boolean =>
  lines(report).some((l) => l.includes(needle));

const expectHas = (report: string, needle: string) => {
  if (!has(report, needle)) {
    throw new Error(`report is missing ${JSON.stringify(needle)}:\n${report}`);
  }
};

Deno.test({
  name: "vl-test: green file — every test passes, skips are reported, exit 0",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(`${FIXTURES}/pass.test.vl`);
    if (r.code !== 0) {
      throw new Error(
        `expected exit 0 on an all-green file, got ${r.code}:\n${r.err}`,
      );
    }
    expectHas(r.err, "ok   adds");
    // A nested `describe` contributes its scope to the reported path.
    expectHas(r.err, "ok   strings > nested > reports its full path");
    expectHas(r.err, "ok   negates");
    // `itSkip` is collected and reported, never run — if it RAN it would fail.
    expectHas(r.err, "skip is skipped and never runs");
    expectHas(r.err, "1 file · 6 passed · 0 failed · 1 skipped");
  },
});

Deno.test({
  name:
    "vl-test: a failed expectation reports std:test's recorded message + captured output",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(`${FIXTURES}/fail.test.vl`);
    if (r.code !== 1) {
      throw new Error(
        `expected exit 1 when a test fails, got ${r.code}:\n${r.err}`,
      );
    }
    // The message is the matcher's, read back off the instance AFTER the trap —
    // not the engine's "unreachable" text.
    expectHas(r.err, "expected 7 to equal 8");
    // Strings render quoted so `"4"` and `4` are distinguishable.
    expectHas(r.err, 'expected "left" to equal "right"');
    // `fail(msg)` is the no-matcher escape hatch.
    expectHas(r.err, "no branch reached");
    // A failing test's own output is captured and shown beneath it.
    expectHas(r.err, "--- captured output ---");
    expectHas(r.err, "about to fail");
    // The tests either side of a failure still ran.
    expectHas(r.err, "ok   passes before the failure");
    expectHas(r.err, "ok   passes after the failure");
  },
});

Deno.test({
  name:
    "vl-test: a TRAP fails only its own test — the file keeps running (isolation)",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(`${FIXTURES}/trap.test.vl`);
    if (r.code !== 1) {
      throw new Error(
        `expected exit 1 when a test traps, got ${r.code}:\n${r.err}`,
      );
    }
    // Two DIFFERENT traps, neither carrying a recorded message: the engine's own
    // trap text becomes the failure message.
    expectHas(r.err, "out of bounds array access");
    expectHas(r.err, "unreachable");
    // THE ISOLATION PROOF: the test declared after two traps still ran and passed,
    // which is only possible because the host caught each trap and re-instantiated.
    expectHas(r.err, "ok   still runs after two traps");
    expectHas(r.err, "ok   runs before the trap");
  },
});

Deno.test({
  name:
    "vl-test: a test file that does not compile is one failure, and the run continues",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(FIXTURES);
    if (r.code !== 1) {
      throw new Error(
        `expected exit 1 over the mixed fixture set, got ${r.code}:\n${r.err}`,
      );
    }
    expectHas(r.err, "FAIL <compile>");
    // The compiler's own diagnostic, positioned in the user's file — proof the
    // appended protocol re-export did not shift any line.
    expectHas(r.err, "undeclared identifier 'noSuchName'");
    expectHas(r.err, "broken.test.vl: error [9:10]");
    // Every other file still ran.
    expectHas(r.err, "ok   adds");
    expectHas(r.err, "ok   still runs after two traps");
    expectHas(r.err, "4 files · 10 passed · 6 failed · 1 skipped");
  },
});

Deno.test({
  name: "vl-test: -t selects by the scope-qualified name",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(FIXTURES, ["-t", "nested"]);
    expectHas(r.err, "ok   strings > nested > reports its full path");
    // Everything else was filtered out — the files with no surviving test say so
    // rather than silently reporting nothing.
    expectHas(r.err, "no tests");
    if (has(r.err, "ok   adds")) {
      throw new Error(`-t nested should not have run "adds":\n${r.err}`);
    }
  },
});

Deno.test({
  name:
    "vl-test: discovery finds only *.test.vl, and an empty tree is not a failure",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_test_discovery_" });
    try {
      // A plain `.vl` that would FAIL to compile: if discovery picked it up the
      // run would go red, so a green exit is the evidence it was skipped.
      await Deno.writeTextFile(`${dir}/helper.vl`, "let q: string = 5\n");
      await Deno.writeTextFile(`${dir}/notes.txt`, "ignore me\n");
      // `test.vl` alone is NOT a test file — the predicate is the `.test.vl`
      // suffix, dot included.
      await Deno.writeTextFile(`${dir}/test.vl`, "let q: string = 5\n");
      const empty = await runTest(dir);
      if (empty.code !== 0) {
        throw new Error(
          `a tree with no *.test.vl should exit 0, got ${empty.code}:\n${empty.err}`,
        );
      }
      expectHas(empty.err, "no *.test.vl files found");

      // A SKIP_DIRS subtree is not walked, even holding a real test file.
      await Deno.mkdir(`${dir}/node_modules`);
      await Deno.writeTextFile(
        `${dir}/node_modules/skipped.test.vl`,
        'import { expect, it, toEqual } from "std:test"\nit("x", () => { expect(1).toEqual(2) })\n',
      );
      await Deno.writeTextFile(
        `${dir}/real.test.vl`,
        'import { expect, it, toEqual } from "std:test"\nit("x", () => { expect(1).toEqual(1) })\n',
      );
      const r = await runTest(dir);
      if (r.code !== 0) {
        throw new Error(
          `node_modules must not be walked; got ${r.code}:\n${r.err}`,
        );
      }
      expectHas(r.err, "1 file · 1 passed · 0 failed");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-test: usage errors exit 2 without running anything",
  ignore: !ENABLED,
  fn: async () => {
    const bad = await runTest(FIXTURES, ["--nonsense"]);
    if (bad.code !== 2) {
      throw new Error(
        `an unknown flag should exit 2, got ${bad.code}:\n${bad.err}`,
      );
    }
    expectHas(bad.err, "unknown flag");

    const jobs = await runTest(FIXTURES, ["--jobs", "0"]);
    if (jobs.code !== 2) {
      throw new Error(`--jobs 0 should exit 2, got ${jobs.code}:\n${jobs.err}`);
    }

    const missing = await runTest(`${FIXTURES}/does-not-exist.test.vl`);
    if (missing.code !== 2) {
      throw new Error(
        `a missing named target should exit 2, got ${missing.code}:\n${missing.err}`,
      );
    }
    expectHas(missing.err, "cannot read");
  },
});

/** The `[start_us, end_us]` stamp each file's `phase` carried under `$VL_TEST_TRACE=1`. */
const traceIntervals = (
  stderr: string,
  phase: string,
): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (const line of stderr.split("\n")) {
    const m = line.match(
      /^vl-test-trace (\w+) file=(\d+) start_us=(\d+) end_us=(\d+)$/,
    );
    if (m && m[1] === phase) out.push([Number(m[3]), Number(m[4])]);
  }
  return out;
};

/** The most files in flight at once — a sweep over the interval endpoints. */
const peakConcurrency = (intervals: Array<[number, number]>): number => {
  const events: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    events.push([start, 1], [end, -1]);
  }
  // An END sorts BEFORE a START at an equal stamp: the intervals are half-open,
  // so a file that finishes exactly as the next begins is serial, not concurrent.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let live = 0;
  let peak = 0;
  for (const [, delta] of events) {
    live += delta;
    if (live > peak) peak = live;
  }
  return peak;
};

Deno.test({
  name:
    "vl-test: files run in PARALLEL — the schedule itself, not a wall-clock proxy",
  ignore: !ENABLED,
  fn: async () => {
    // Four files, one ~250 ms test each, stamped per file by the host under
    // `$VL_TEST_TRACE=1` (see `test_trace_stamp`). The assertion is two-sided and
    // reads the SCHEDULE: `--jobs 4` must run all four concurrently, `--jobs 1`
    // must run them one at a time.
    //
    // It reads the schedule and NOT a wall-clock ratio, because this file runs
    // under CI's `deno test --parallel` sweep beside ~1,876 subprocess-spawning
    // cases on 4 vCPUs. A ratio measures scheduling TIMES the box's free CPU, so
    // under that saturation a silent fallback to serial and a merely busy runner
    // are the same reading (~1.0). Overlap has no such ambiguity: contention
    // makes each file take LONGER, which WIDENS the overlap rather than hiding
    // it, so the measurement strengthens as the runner gets busier.
    const par = await runTest(SLOW, ["--jobs", "4"], { VL_TEST_TRACE: "1" });
    const ser = await runTest(SLOW, ["--jobs", "1"], { VL_TEST_TRACE: "1" });

    if (par.code !== 0 || ser.code !== 0) {
      throw new Error(
        `the slow fixtures must all pass:\n${par.err}\n${ser.err}`,
      );
    }
    expectHas(par.err, "4 files · 4 passed · 0 failed");

    const parIntervals = traceIntervals(par.err, "run");
    const serIntervals = traceIntervals(ser.err, "run");
    for (
      const [jobs, got] of [["4", parIntervals], ["1", serIntervals]] as const
    ) {
      if (got.length !== 4) {
        throw new Error(
          `--jobs ${jobs} stamped ${got.length} run intervals, want 4 — ` +
            `is $VL_TEST_TRACE still wired?`,
        );
      }
    }

    const parPeak = peakConcurrency(parIntervals);
    if (parPeak !== 4) {
      throw new Error(
        `--jobs 4 ran at most ${parPeak} file(s) at once, want 4 — ` +
          `the runner is not scheduling files concurrently:\n${par.err}`,
      );
    }

    // The other side of the claim: `--jobs 1` is honoured rather than ignored.
    const serPeak = peakConcurrency(serIntervals);
    if (serPeak !== 1) {
      throw new Error(
        `--jobs 1 ran ${serPeak} files at once, want 1 — serial scheduling is ` +
          `not honoured:\n${ser.err}`,
      );
    }
  },
});
