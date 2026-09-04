// THE DAY-ONE SAMPLER, GRADED AGAINST ITS OWN CONTROL.
//
// `scripts/day-one/sample.py` generates ORDINARY programs in PAIRS — two spellings of one
// program, one axis apart — and reports agree/disagree rather than runs/refuses. It is a
// DISCOVERY instrument, so what belongs in the gate is not a hit count (that number moves
// every time a defect closes) but the three things whose breakage would make a future zero
// meaningless: the vocabulary, the axis coverage, and the positive control.
//
// An instrument that reports zero is worth nothing until something it MUST see makes it
// speak. The first version of this suite used D1473 for that — a LIVE DEFECT — and D1473
// was fixed (#2476) two days later: its pair started grading AGREE and the gate read a
// closed row as a broken instrument, six CI rounds in a row. So the liveness controls are
// now SYNTHETIC, each resting on a rule the design will always enforce (a type error, a
// bounds-checked index, an exact output contract), and the closed rows are AGREE controls,
// which is the right shape for a closed row anyway: it pins the fix rather than the bug.
//
// Axis coverage is the second half of the same rule (a zero-disagreement axis and an axis
// the sample never reached must not print the same), and it is asserted against the
// grammar's OWN list, so adding an axis nothing can generate fails here rather than
// silently narrowing every future run.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const SAMPLE = `${ROOT}/scripts/day-one/sample.py`;
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) && exists(SAMPLE);
if (GATED && !ENABLED) {
  console.warn("[vl-day-one] skipped — missing vl binary, seed wasm or sample.py.");
}

const run = async (args: string[]): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command("python3", {
    args: [SAMPLE, ...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
};

type Summary = {
  pairs: number;
  axes: string[];
  grammar_axes: string[];
  grades: Record<string, number>;
  verdicts: Record<string, number>;
  grade_vocabulary: string[];
  verdict_vocabulary: string[];
};

let cached: Promise<Summary> | undefined;
const sample = (): Promise<Summary> => {
  // ONE 20-pair run for every assertion below: the sampler is the thing under test, not
  // the seed's throughput, and this suite has to fit inside gate.sh's budget.
  if (!cached) {
    cached = (async () => {
      const { code, out } = await run(["--seed", "4242", "--count", "40", "--jobs", "4", "--json"]);
      if (code !== 0) throw new Error(`sample.py --json exited ${code}:\n${out}`);
      const line = out.trim().split("\n").pop() ?? "";
      try {
        return JSON.parse(line) as Summary;
      } catch {
        throw new Error(`sample.py --json did not print JSON, got:\n${out}`);
      }
    })();
  }
  return cached;
};

Deno.test({
  name: "day-one: 40 programs is 20 pairs, and every grade is in the declared vocabulary",
  ignore: !ENABLED,
  fn: async () => {
    const s = await sample();
    if (s.pairs !== 20) {
      throw new Error(`want 20 pairs from --count 40, got ${s.pairs}`);
    }
    for (const g of Object.keys(s.grades)) {
      if (!s.grade_vocabulary.includes(g)) {
        throw new Error(
          `grade ${JSON.stringify(g)} is outside the vocabulary ` +
            `${JSON.stringify(s.grade_vocabulary)} — sample.py and ` +
            `capability-probes/run.py have drifted`,
        );
      }
    }
    for (const v of Object.keys(s.verdicts)) {
      if (!s.verdict_vocabulary.includes(v)) {
        throw new Error(
          `verdict ${JSON.stringify(v)} is outside ${JSON.stringify(s.verdict_vocabulary)}`,
        );
      }
    }
  },
});

Deno.test({
  name: "day-one: the fixed-seed sample varies EVERY axis the grammar declares",
  ignore: !ENABLED,
  fn: async () => {
    const s = await sample();
    const missing = s.grammar_axes.filter((a) => !s.axes.includes(a));
    if (missing.length > 0) {
      throw new Error(
        `want every axis varied at least once, got ${JSON.stringify(s.axes)} — ` +
          `never reached: ${JSON.stringify(missing)}. An axis no sample exercises makes ` +
          `its zero unreadable: it cannot be told from an axis that found nothing.`,
      );
    }
  },
});

Deno.test({
  name: "day-one: every control speaks — synthetic disagreements and closed-row agreements",
  ignore: !ENABLED,
  fn: async () => {
    const { code, out } = await run(["--control"]);
    if (code !== 0) {
      throw new Error(
        `want every control speaking, got rc ${code}:\n${out}\n` +
          `A synthetic control failing means the GRADER can no longer see or classify a ` +
          `disagreement; an agree control failing means a closed row regressed. They are ` +
          `different faults with the same exit code, so read which line says NOT SPEAKING.`,
      );
    }
    // The liveness half must not be quietly deleted, leaving only agree pins: a suite of
    // agree controls passes on an instrument that has stopped speaking entirely.
    const synthetic = out.split("\n").filter((l) =>
      l.trim().startsWith("synthetic/") && /DISAGREE|RUNS-WRONG/.test(l)
    );
    if (synthetic.length < 3) {
      throw new Error(
        `want at least 3 SYNTHETIC controls grading a disagreement, got ` +
          `${synthetic.length}:\n${out}\nA control built on a live defect evaporates when ` +
          `the defect is fixed (D1473, #2476) — the synthetic ones are what stay true.`,
      );
    }
  },
});
