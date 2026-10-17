// THE DAY-ONE SAMPLER, GRADED AGAINST ITS OWN CONTROL.
//
// `scripts/day-one/sample.vl` generates ORDINARY programs in PAIRS — two spellings of one
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
// silently narrowing every future run. `modules_split` needs one assertion of its own:
// its faces differ by the NUMBER OF FILES, which axis coverage cannot see.
//
// @test-timing instrument

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const SAMPLE = `${ROOT}/scripts/day-one/sample.vl`;
const MINIMISE = `${ROOT}/scripts/day-one/minimise.vl`;
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) && exists(SAMPLE) && exists(MINIMISE);
if (GATED && !ENABLED) {
  console.warn("[vl-day-one] skipped — missing vl binary, seed wasm or sample.vl.");
}

const vlRun = async (script: string, args: string[]): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", script, "--compiler", COMPILER, "--", ...args, "--compiler", COMPILER],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
};
const run = (args: string[]) => vlRun(SAMPLE, args);

type Summary = {
  pairs: number;
  axes: string[];
  grammar_axes: string[];
  grades: Record<string, number>;
  verdicts: Record<string, number>;
  grade_vocabulary: string[];
  verdict_vocabulary: string[];
  multi_file: number;
};

let cached: Promise<Summary> | undefined;
const sample = (): Promise<Summary> => {
  // ONE 12-pair run for every assertion below. The sampler covers each axis once before it
  // draws at random, so one pair per axis (eleven) and one spare is all the axis assertion
  // needs; the sampler is the thing under test, not the seed's throughput.
  if (!cached) {
    cached = (async () => {
      const { code, out } = await run(["--seed", "4242", "--count", "24", "--jobs", "4", "--json"]);
      if (code !== 0) throw new Error(`sample.vl --json exited ${code}:\n${out}`);
      const line = out.trim().split("\n").pop() ?? "";
      try {
        return JSON.parse(line) as Summary;
      } catch {
        throw new Error(`sample.vl --json did not print JSON, got:\n${out}`);
      }
    })();
  }
  return cached;
};

Deno.test({
  name: "day-one: 24 programs is 12 pairs, and every grade is in the declared vocabulary",
  ignore: !ENABLED,
  fn: async () => {
    const s = await sample();
    if (s.pairs !== 12) {
      throw new Error(`want 12 pairs from --count 24, got ${s.pairs}`);
    }
    for (const g of Object.keys(s.grades)) {
      if (!s.grade_vocabulary.includes(g)) {
        throw new Error(
          `grade ${JSON.stringify(g)} is outside the vocabulary ` +
            `${JSON.stringify(s.grade_vocabulary)} — sample.vl and ` +
            `scripts/capability-probes.vl have drifted`,
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
  name: "day-one: the modules_split axis really writes TWO files",
  ignore: !ENABLED,
  fn: async () => {
    const s = await sample();
    // The axis table above cannot say this. A `modules_split` pair whose split face
    // silently stopped carrying a second `// file:` section would still be counted as an
    // exercised axis, and both its faces would then be the same single-module program —
    // an AGREE that no defect can disturb. Three clause-1 rows this week needed two files
    // to appear at all, so a sample that writes one is the frame quietly narrowing.
    if (s.multi_file < 1) {
      throw new Error(
        `want at least one multi-module program in the fixed-seed sample, got ` +
          `${s.multi_file}. The modules_split axis is declared and varied, so its split ` +
          `face is rendering as a single file — see scripts/day-one/modules.vl's renderModules.`,
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

Deno.test({
  name: "day-one: minimise cuts a line the refusal does not need and keeps a called declaration",
  ignore: !ENABLED,
  fn: async () => {
    // `unused` is a free cut; `helper` is still called by the surviving `print`, so the
    // context guard must keep it even though removing it would still refuse.
    const dir = await Deno.makeTempDir({ prefix: "vl-day-one-min-test-" });
    try {
      const file = `${dir}/w.vl`;
      const src = [
        "function helper(x: i32): i32 { return x + 1 }",
        "const unused = 5",
        'const k: i32 = "oops"',
        "print(helper(k))",
        "",
      ];
      await Deno.writeTextFile(file, src.join("\n"));
      const { code, out } = await vlRun(MINIMISE, ["--file", file, "--want", "3"]);
      const want = [src[0], src[2], src[3]].join("\n");
      const lines = out.split("\n");
      const ok = code === 0 && lines[0].startsWith("check refuses: ") &&
        lines.slice(2, 5).join("\n") === want && !out.includes("unused");
      if (!ok) {
        throw new Error(`want rc 0, a check refusal and the witness\n${want}\ngot rc ${code}:\n${out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
