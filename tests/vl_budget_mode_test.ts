// `vl check --budget` AGAINST THE PYTHON RATCHET IT REPLACES AS A GATE ROW.
//
// The interp ratchet's gate row is `vl check --budget scripts/interp-budget-baseline.json`
// (architecture-refactor-plan T2); `scripts/interp-budget.py` stays beside it as the
// reference and the baseline's writer. This holds the two to one answer:
//
//   1. On the real tree, the Python writes a fresh baseline (counts AND named entries)
//      and `vl check --budget-why` over it must find every name where the Python put it
//      — "the same entries, by name", nothing LEFT, nothing ENTERED — and `--budget`
//      must pass with the Python's own ok line.
//   2. On a doctored copy (one file's count lowered, one entry dropped, one invented),
//      over a narrowed population both tools accept, both must red with the same
//      regressed lines and print the same `--why`, byte for byte.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, pythonBin, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-budget-mode] skipped — missing vl binary or seed wasm.");
}

const SCRIPT = `${ROOT}/scripts/interp-budget.py`;
const CODE = "prefer-interpolation";
// The narrowed population of case 2, in each tool's spelling.
const NARROW = ["std", "scripts/seed-size.vl"];
const DOCTORED_FILE = "std/fs.vl";

type Run = { code: number; out: string; err: string };

const run = async (cmd: string, args: string[]): Promise<Run> => {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    cwd: ROOT,
    env: nativeEnv(),
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};
const py = (args: string[]) => run(pythonBin(), [SCRIPT, ...args]);
const vl = (args: string[]) => run(VL, ["check", ...args, "--compiler", COMPILER]);

const expectEq = (what: string, want: unknown, got: unknown) => {
  const w = JSON.stringify(want);
  const g = JSON.stringify(got);
  if (w !== g) throw new Error(`${what}\n  want: ${w}\n  got:  ${g}`);
};

type Baseline = {
  total: Record<string, number>;
  files: Record<string, Record<string, number>>;
  entries: [string, string, number][];
  [k: string]: unknown;
};

Deno.test({
  name: "vl check --budget agrees with interp-budget.py on the tree and on a doctored baseline",
  ignore: !ENABLED,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: "vl_budget_mode_" });
    try {
      // 1. The real tree.
      const full = `${dir}/full.json`;
      const w = await py(["--write-baseline", "--baseline", full]);
      if (w.code !== 0) throw new Error(`python --write-baseline: ${w.code}\n${w.out}${w.err}`);
      const base: Baseline = JSON.parse(await Deno.readTextFile(full));
      const total = base.total[CODE];
      if (!(total > 0)) {
        throw new Error(`the tree carries no ${CODE} finding, so this agreement is vacuous`);
      }
      const [check, why] = await Promise.all([
        vl(["--budget", full]),
        vl(["--budget-why", full]),
      ]);
      expectEq("vl --budget on the python's own baseline: exit", 0, check.code);
      expectEq(
        "vl --budget on the python's own baseline: stdout",
        `interp budget ok — ${total} ${CODE} (baseline ${total} or below)\n`,
        check.out,
      );
      expectEq("vl --budget-why: exit", 0, why.code);
      for (const want of ["  (the same entries, by name)", "Nothing moved by name."]) {
        if (!why.out.includes(want)) {
          throw new Error(`vl --budget-why did not find the python's names:\n${why.out}`);
        }
      }

      // 2. A doctored baseline over a narrowed population.
      const doc: Baseline = structuredClone(base);
      const was = doc.files[DOCTORED_FILE]?.[CODE] ?? 0;
      if (was < 1) throw new Error(`${DOCTORED_FILE} has no ${CODE} finding to doctor`);
      doc.files[DOCTORED_FILE][CODE] = was - 1;
      doc.total[CODE] = total - 1;
      const drop = doc.entries.findIndex((e) => e[1].startsWith(`${DOCTORED_FILE}: `));
      doc.entries.splice(drop, 1);
      doc.entries.push([CODE, `${DOCTORED_FILE}: an entry no tree has`, 2]);
      const doctored = `${dir}/doctored.json`;
      await Deno.writeTextFile(doctored, JSON.stringify(doc, null, 0));
      const only = ["--baseline", doctored, "--only", NARROW.join(",")];
      const [pc, vc, pw, vw] = await Promise.all([
        py(["--check", ...only]),
        vl(["--budget", doctored, ...NARROW]),
        py(["--why", ...only]),
        vl(["--budget-why", doctored, ...NARROW]),
      ]);
      expectEq("doctored --check: python exit", 1, pc.code);
      expectEq("doctored --check: vl exit", 1, vc.code);
      const verdict = (s: string) =>
        s.split("\n").filter((l) =>
          l.includes("REGRESSED") || l.startsWith("  ") && l.includes(`${CODE}: `)
        );
      const want = verdict(pc.out);
      expectEq("doctored --check: regressed line count", 2, want.length);
      expectEq("doctored --check: the same verdict lines", want, verdict(vc.out));
      expectEq("doctored --why: python exit", 0, pw.code);
      expectEq("doctored --why: vl exit", 0, vw.code);
      expectEq("doctored --why: the same report", pw.out, vw.out);
      if (!vw.out.includes("  ENTERED  ") || !vw.out.includes("  LEFT     ")) {
        throw new Error(`the doctored --why moved no name both ways:\n${vw.out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
