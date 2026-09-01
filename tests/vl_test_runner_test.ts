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
//     overlap under `--jobs 4` and are disjoint under `--jobs 1`);
//   * a failed `expect` reports WHERE IT WAS WRITTEN (track-caller), and that
//     position is the `expect` line rather than the `it` line — the claim the
//     editor's failure anchor is built on.
//
// The report is built entirely in VL (`compiler/cli.vl`) — the host contributes
// only wasm instances, the thread pool and trap catching — so these assertions
// also gate the brain/mechanism split.
//
// GATING: same as tests/selfhost_native_align_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.

// The extension's own report parser and anchor resolver, so the editor payoff is
// graded against the RUNNER'S REAL OUTPUT rather than a retyped sample. Pure —
// `testDiscovery.ts` imports no `vscode` (tests/lsp_test_discovery_test.ts is the
// unit half of the same pair).
import { failureAnchor, parseTestReport } from "../lsp/src/testDiscovery.ts";

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
    // VL_STD pins std to THIS tree: without it the host resolves std: from the
    // BINARY's checkout (the main repo), and a branch that changes a std export
    // silently grades against the wrong std — measured live when the toString
    // rename's template constant met the main repo's still-toStr std here.
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std`, ...extraEnv },
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
    expectHas(r.err, "ok   interpolates a template");
    expectHas(r.err, "1 file · 7 passed · 0 failed · 1 skipped");
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
    // the renderer-agreement pin: std:test's private i64 renderer must produce
    // the same digits std:fmt's toString does at i64 min (see fail.test.vl)
    expectHas(r.err, "expected -9223372036854775808 to equal 1");
    // `fail(msg)` is the no-matcher escape hatch.
    expectHas(r.err, "no branch reached");
    // A failing test's own output is captured and shown beneath it.
    expectHas(r.err, "--- captured output ---");
    expectHas(r.err, "about to fail");
    // The tests either side of a failure still ran.
    expectHas(r.err, "ok   passes before the failure");
    expectHas(r.err, "ok   passes after the failure");
    // TRACK-CALLER: every one of those assertion sentences is followed by the
    // position it was written at. The sentences above are unchanged — the
    // location is a SECOND LINE, so every pin in this file stayed a prefix match
    // when it landed. `fail(msg)` carries no location and must not grow a
    // forged one.
    expectHas(r.err, `at ${FIXTURES}/fail.test.vl:`);
    const failLine = lines(r.err)
      .findIndex((l) => l.includes("no branch reached"));
    if (lines(r.err)[failLine + 1].startsWith("at ")) {
      throw new Error(`fail(msg) must carry no location:\n${r.err}`);
    }
  },
});

Deno.test({
  name: "vl-test: a failure ANCHORS at its own expect line, not at the it line",
  ignore: !ENABLED,
  fn: async () => {
    // THE EDITOR PAYOFF, end to end: run the real runner, parse the real report
    // with the extension's own parser, and check the position against the
    // fixture's own source. Line numbers are READ OUT of the fixture rather than
    // written down here, so the pin survives the file moving and fails loudly if
    // the statements it names ever disappear.
    const src = await Deno.readTextFile(`${FIXTURES}/fail.test.vl`);
    const srcLines = src.split("\n");
    const lineOf = (needle: string): number => {
      const i = srcLines.findIndex((l) => l.includes(needle));
      if (i < 0) {
        throw new Error(
          `fail.test.vl no longer contains ${JSON.stringify(needle)} — this ` +
            "test reads its expected position out of the fixture",
        );
      }
      return i + 1; // the runner counts lines from 1
    };
    const itLine = lineOf('it("fails an assertion"');
    const expectLine = lineOf("expect(7).toEqual(8)");
    const expectCol = srcLines[expectLine - 1].indexOf("expect(") + 1;
    if (itLine === expectLine) {
      throw new Error(
        "the fixture must keep the `it` and its `expect` on different lines — " +
          "otherwise this test cannot tell the anchor from the fallback",
      );
    }

    const r = await runTest(`${FIXTURES}/fail.test.vl`);
    const parsed = parseTestReport(r.err);
    const result = parsed.results.find((x) => x.path === "fails an assertion");
    if (result === undefined) {
      throw new Error(`no result for "fails an assertion":\n${r.err}`);
    }
    const got = JSON.stringify(result.location);
    const want = JSON.stringify({
      file: `${FIXTURES}/fail.test.vl`,
      line: expectLine,
      col: expectCol,
    });
    if (got !== want) {
      throw new Error(
        `the failure anchored in the wrong place\n  want ${want}\n  got  ${got}` +
          `\n${r.err}`,
      );
    }

    // The claim spelled out: the message lands on the EXPECT, and the `it` line
    // — what the D9 slot 12 heuristic would have given — is a different line.
    const at = failureAnchor(
      result.location!,
      ROOT,
      `${FIXTURES}/fail.test.vl`,
    );
    if (!at.isTarget) {
      throw new Error(`the anchor left the file under test: ${at.file}`);
    }
    if (at.line !== expectLine - 1 || at.line === itLine - 1) {
      throw new Error(
        `the editor anchor is line ${at.line} (0-based); want ${
          expectLine - 1
        }, and NOT the it line ${itLine - 1}`,
      );
    }

    // `fail(msg)` has no expect behind it, so the extension keeps today's
    // it-line fallback rather than being handed a wrong position.
    const outright = parsed.results.find((x) => x.path === "fails outright");
    if (outright?.location !== undefined) {
      throw new Error(
        `fail(msg) must carry no location, got ${
          JSON.stringify(outright.location)
        }`,
      );
    }
  },
});

Deno.test({
  name:
    "vl-test: ONE HOP, and every spelling anchors at the `expect` that failed",
  ignore: !ENABLED,
  fn: async () => {
    // The semantics the owner ruled on: a `CallerLoc` is one location, never a
    // chain. A wrapper that takes its own `caller: CallerLoc = __callsite__` and
    // forwards it EXPLICITLY reports the line that called the wrapper; one that
    // does not forward reports its own `expect` — which may be in a DIFFERENT
    // FILE, the case no scan of the test body could ever have anchored.
    //
    // A temp dir rather than a new file under tests/fixtures/vl-test: the
    // fixtures' aggregate `N files · P passed · F failed` pin is shared with
    // every other case in this file, and this claim needs a helper module beside
    // the test rather than another entry in that count.
    // Both sources are LINE ARRAYS and every expected position is DERIVED from
    // them (`posOf` below), never counted by hand — an off-by-two in a hand
    // count is a test that fails for a reason that has nothing to do with the
    // compiler, which is exactly the noise a position pin must not add.
    const helperSrc = [
      'import { CallerLoc, expect, toEqual } from "std:test"',
      "",
      "export function forwards(v: i32, caller: CallerLoc = __callsite__) {",
      "  expect(v, caller).toEqual(1)",
      "}",
      "",
      "export function keepsItself(v: i32) {",
      "  expect(v).toEqual(1)",
      "}",
    ];
    const testSrc = [
      'import { expect, it, not, toEqual } from "std:test"',
      'import { forwards, keepsItself } from "./helper"',
      "",
      'it("forwarded", () => {',
      "  forwards(2)",
      "})",
      "",
      'it("kept", () => {',
      "  keepsItself(2)",
      "})",
      "",
      // The SPELLING grid. Both must report the `expect` token: the location
      // belongs to the ASSERTION, and `expect(` is where an assertion starts —
      // never the `.toEqual`, never the `.not()`. That follows from the location
      // riding on the RECEIPT rather than on each matcher, which is the reason
      // the matchers did not grow a parameter of their own.
      'it("negated", () => {',
      "  expect(1).not().toEqual(1)",
      "})",
      "",
      'it("non-ufcs", () => {',
      "  toEqual(expect(3), 4)",
      "})",
    ];
    /** The 1-based line/col of `needle` in `src` — the runner's own coordinates. */
    const posOf = (src: string[], needle: string, token: string) => {
      const line = src.findIndex((l) => l.includes(needle));
      if (line < 0) throw new Error(`no line holding ${JSON.stringify(needle)}`);
      return { line: line + 1, col: src[line].indexOf(token) + 1 };
    };

    const dir = await Deno.makeTempDir({ prefix: "vl_test_caller_" });
    try {
      await Deno.writeTextFile(`${dir}/helper.vl`, helperSrc.join("\n") + "\n");
      await Deno.writeTextFile(`${dir}/hop.test.vl`, testSrc.join("\n") + "\n");
      const r = await runTest(`${dir}/hop.test.vl`);
      const parsed = parseTestReport(r.err);
      const at = (path: string) =>
        JSON.stringify(parsed.results.find((x) => x.path === path)?.location);
      const want = (file: string, src: string[], needle: string, token: string) =>
        JSON.stringify({ file, ...posOf(src, needle, token) });
      const check = (path: string, wanted: string, why: string) => {
        if (at(path) !== wanted) {
          throw new Error(
            `${why}\n  want ${wanted}\n  got  ${at(path)}\n${r.err}`,
          );
        }
      };

      const test = `${dir}/hop.test.vl`;
      check(
        "forwarded",
        want(test, testSrc, "forwards(2)", "forwards"),
        "a forwarded caller must name the HELPER'S CALLER",
      );
      check(
        "kept",
        want(`${dir}/helper.vl`, helperSrc, "expect(v).toEqual(1)", "expect"),
        "an unforwarded caller must name the helper's own expect, in ITS file",
      );
      check(
        "negated",
        want(test, testSrc, "expect(1).not()", "expect"),
        "the not() chain must anchor at the expect, not the .not() or .toEqual",
      );
      check(
        "non-ufcs",
        want(test, testSrc, "toEqual(expect(3)", "expect"),
        "the non-UFCS spelling must anchor at the NESTED expect, not the toEqual",
      );

      // And the editor resolves the helper's one into the helper FILE, not the
      // test file — `isTarget` false is what tells the extension to open it.
      const anchor = failureAnchor(
        parsed.results.find((x) => x.path === "kept")!.location!,
        dir,
        test,
      );
      if (anchor.isTarget || anchor.file !== `${dir}/helper.vl`) {
        throw new Error(
          `the helper's failure must anchor in helper.vl, got ${
            JSON.stringify(anchor)
          }`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "vl-test: the GENERIC surface — structs and arrays assert, non-atoms render the sentinel",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(`${FIXTURES}/generic.test.vl`);
    if (r.code !== 1) {
      throw new Error(
        `expected exit 1 (the fixture has failing tests), got ${r.code}:\n${r.err}`,
      );
    }
    // The generic surface: one expect/toEqual over structs, arrays, negation.
    expectHas(r.err, "ok   compares structs");
    expectHas(r.err, "ok   compares arrays by element");
    expectHas(r.err, "ok   negates a struct comparison");
    // A failing non-atom operand renders as the `<value>` sentinel — the message
    // still names the position and sense; the values themselves wait on
    // reflection (std/test.vl header).
    expectHas(r.err, "expected <value> to equal <value>");
    // Atom rendering through the generic path is still exact (i64 here; the
    // i32/string exactness pins live in fail.test.vl).
    expectHas(r.err, "expected 5000000000 to equal 3000000000");
    expectHas(r.err, "1 file · 3 passed · 3 failed");
  },
});

Deno.test({
  name:
    "vl-test: a UNION-TYPED receiver asserts, and a failure renders the held arm exactly",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(`${FIXTURES}/union.test.vl`);
    if (r.code !== 1) {
      throw new Error(
        `expected exit 1 (the fixture has failing tests), got ${r.code}:\n${r.err}`,
      );
    }
    // The F1 shape: T inferred as `i32 | string` from a union-typed return.
    // Under the pre-fix v2 this file refused at emit (`narrowed union atom has
    // no value box`, inventory D947); it must keep compiling AND asserting.
    expectHas(r.err, "ok   asserts through a union-typed receiver");
    // A failing union receiver renders the arm it HOLDS, in v1's exact atom
    // forms — not the `<value>` sentinel.
    expectHas(r.err, "expected 4 to equal 5");
    expectHas(r.err, 'expected "x" to equal "y"');
    expectHas(r.err, "1 file · 1 passed · 2 failed");
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
    expectHas(r.err, "6 files · 15 passed · 12 failed · 1 skipped");
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
