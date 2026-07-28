// NATIVE `vl test` — the runner (docs/internals/vl-test-design.md). Every
// behaviour asserted here is a claim the design makes:
//
//   * discovery finds `*.test.vl` and nothing else;
//   * a failing expectation reports the message `std:test` RECORDED, not a trap;
//   * a TRAP in one test fails that test alone — the tests after it still run
//     (the isolation proof: the host re-instantiates the module);
//   * a test file that does not COMPILE is one failing entry and the run continues;
//   * a green run exits 0, any failure exits 1, a usage error exits 2;
//   * files really do run in parallel (`--jobs 1` is measurably slower).
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
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["test", target, "--compiler", COMPILER, ...extraArgs],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
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
      throw new Error(`expected exit 0 on an all-green file, got ${r.code}:\n${r.err}`);
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
  name: "vl-test: a failed expectation reports std:test's recorded message + captured output",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(`${FIXTURES}/fail.test.vl`);
    if (r.code !== 1) {
      throw new Error(`expected exit 1 when a test fails, got ${r.code}:\n${r.err}`);
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
  name: "vl-test: a TRAP fails only its own test — the file keeps running (isolation)",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(`${FIXTURES}/trap.test.vl`);
    if (r.code !== 1) {
      throw new Error(`expected exit 1 when a test traps, got ${r.code}:\n${r.err}`);
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
  name: "vl-test: a test file that does not compile is one failure, and the run continues",
  ignore: !ENABLED,
  fn: async () => {
    const r = await runTest(FIXTURES);
    if (r.code !== 1) {
      throw new Error(`expected exit 1 over the mixed fixture set, got ${r.code}:\n${r.err}`);
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
  name: "vl-test: discovery finds only *.test.vl, and an empty tree is not a failure",
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
        throw new Error(`a tree with no *.test.vl should exit 0, got ${empty.code}:\n${empty.err}`);
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
        throw new Error(`node_modules must not be walked; got ${r.code}:\n${r.err}`);
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
      throw new Error(`an unknown flag should exit 2, got ${bad.code}:\n${bad.err}`);
    }
    expectHas(bad.err, "unknown flag");

    const jobs = await runTest(FIXTURES, ["--jobs", "0"]);
    if (jobs.code !== 2) {
      throw new Error(`--jobs 0 should exit 2, got ${jobs.code}:\n${jobs.err}`);
    }

    const missing = await runTest(`${FIXTURES}/does-not-exist.test.vl`);
    if (missing.code !== 2) {
      throw new Error(`a missing named target should exit 2, got ${missing.code}:\n${missing.err}`);
    }
    expectHas(missing.err, "cannot read");
  },
});

Deno.test({
  name: "vl-test: files run in PARALLEL — --jobs 1 over the same work is markedly slower",
  ignore: !ENABLED,
  fn: async () => {
    // Four files, one ~250 ms test each. Serial must take roughly 4x the parallel
    // wall clock; the assertion is deliberately loose (parallel < 70% of serial)
    // so a loaded or few-core CI box cannot flake it, while a runner that silently
    // fell back to serial scheduling — the regression this guards — reads ~1.0.
    const t0 = performance.now();
    const par = await runTest(SLOW, ["--jobs", "4"]);
    const parallelMs = performance.now() - t0;

    const t1 = performance.now();
    const ser = await runTest(SLOW, ["--jobs", "1"]);
    const serialMs = performance.now() - t1;

    if (par.code !== 0 || ser.code !== 0) {
      throw new Error(`the slow fixtures must all pass:\n${par.err}\n${ser.err}`);
    }
    expectHas(par.err, "4 files · 4 passed · 0 failed");
    if (parallelMs > serialMs * 0.7) {
      throw new Error(
        `expected parallel scheduling: --jobs 4 took ${parallelMs.toFixed(0)}ms, ` +
          `--jobs 1 took ${serialMs.toFixed(0)}ms (ratio ${(parallelMs / serialMs).toFixed(2)}, want < 0.70)`,
      );
    }
  },
});
