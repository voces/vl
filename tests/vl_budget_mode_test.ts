// `vl check --budget` HOLDS AND WRITES THE INTERP RATCHET.
//
// The interp ratchet has no script: `vl check --budget scripts/interp-budget-baseline.json`
// is its gate row and `--write-baseline` its writer, in the layout scripts/ratchet.py
// writes (architecture-refactor-plan T2). This holds the three verbs to one answer:
//
//   1. On the real tree, a fresh write must pass its own `--budget` with the ok line,
//      `--budget-why` must find every entry where the write put it, and a second write
//      over the first must be byte-identical (the layout is a fixed point).
//   2. On a doctored copy (one file's count lowered, one entry dropped, one invented),
//      over a narrowed population, `--budget` must red with exactly the doctored file's
//      line and `--budget-why` must move a name both ways.
//   3. `--exempt-codes` prints the codes the committed baseline still owes.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-budget-mode] skipped — missing vl binary or seed wasm.");
}

const BASELINE = `${ROOT}/scripts/interp-budget-baseline.json`;
const CODE = "prefer-interpolation";
const NARROW = ["std", "scripts/seed-size.vl"];
const DOCTORED_FILE = "std/fs.vl";

type Run = { code: number; out: string; err: string };

const vl = async (args: string[]): Promise<Run> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", ...args, "--compiler", COMPILER],
    cwd: ROOT,
    env: nativeEnv(),
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

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
  name: "vl check --budget writes, holds and explains the interp baseline",
  ignore: !ENABLED,
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: "vl_budget_mode_" });
    try {
      // 1. The real tree.
      const full = `${dir}/full.json`;
      await Deno.copyFile(BASELINE, full);
      const w = await vl(["--budget", full, "--write-baseline"]);
      if (w.code !== 0) {
        throw new Error(`--write-baseline: ${w.code}\n${w.out}${w.err}`);
      }
      const text = await Deno.readTextFile(full);
      const base: Baseline = JSON.parse(text);
      const total = base.total[CODE];
      if (!(total > 0)) {
        throw new Error(
          `the tree carries no ${CODE} finding, so this check is vacuous`,
        );
      }
      expectEq(
        "--write-baseline: stdout",
        `wrote ${full}: ${total} ${CODE}\n`,
        w.out,
      );
      const committed = JSON.parse(await Deno.readTextFile(BASELINE));
      for (const k of ["label", "targets", "exclude"]) {
        expectEq(`--write-baseline keeps ${k}`, committed[k], base[k]);
      }
      expectEq(
        "one entry line per entry",
        base.entries.length + 1,
        text.split('\n["').length,
      );
      const [check, why, again] = await Promise.all([
        vl(["--budget", full]),
        vl(["--budget-why", full]),
        Deno.copyFile(full, `${dir}/again.json`).then(() =>
          vl(["--budget", `${dir}/again.json`, "--write-baseline"])
        ),
      ]);
      expectEq("--budget on a fresh write: exit", 0, check.code);
      expectEq(
        "--budget on a fresh write: stdout",
        `interp budget ok — ${total} ${CODE} (baseline ${total} or below)\n`,
        check.out,
      );
      expectEq("--budget-why: exit", 0, why.code);
      for (
        const want of [
          "  (the same entries, by name)",
          "Nothing moved by name.",
        ]
      ) {
        if (!why.out.includes(want)) {
          throw new Error(
            `--budget-why did not find the written names:\n${why.out}`,
          );
        }
      }
      expectEq("a second write: exit", 0, again.code);
      expectEq(
        "a second write is byte-identical",
        text,
        await Deno.readTextFile(`${dir}/again.json`),
      );

      // 2. A doctored baseline over a narrowed population.
      const doc: Baseline = structuredClone(base);
      const was = doc.files[DOCTORED_FILE]?.[CODE] ?? 0;
      if (was < 1) {
        throw new Error(`${DOCTORED_FILE} has no ${CODE} finding to doctor`);
      }
      doc.files[DOCTORED_FILE][CODE] = was - 1;
      doc.total[CODE] = total - 1;
      const drop = doc.entries.findIndex((e) =>
        e[1].startsWith(`${DOCTORED_FILE}: `)
      );
      doc.entries.splice(drop, 1);
      doc.entries.push([CODE, `${DOCTORED_FILE}: an entry no tree has`, 2]);
      const doctored = `${dir}/doctored.json`;
      await Deno.writeTextFile(doctored, JSON.stringify(doc, null, 0));
      const [vc, vw] = await Promise.all([
        vl(["--budget", doctored, ...NARROW]),
        vl(["--budget-why", doctored, ...NARROW]),
      ]);
      expectEq("doctored --budget: exit", 1, vc.code);
      expectEq(
        "doctored --budget: the regressed lines",
        [
          "interp budget REGRESSED — a file may only go down or stay:",
          `  ${DOCTORED_FILE}  ${CODE}: ${was} (baseline ${was - 1})`,
        ],
        vc.out.split("\n").filter((l) =>
          l.includes("REGRESSED") ||
          l.startsWith("  ") && l.includes(`${CODE}: `)
        ),
      );
      if (!vc.out.includes(`vl check --budget ${doctored} --write-baseline`)) {
        throw new Error(`the doctored --budget names no writer:\n${vc.out}`);
      }
      expectEq("doctored --budget-why: exit", 0, vw.code);
      if (!vw.out.includes("  ENTERED  ") || !vw.out.includes("  LEFT     ")) {
        throw new Error(
          `the doctored --budget-why moved no name both ways:\n${vw.out}`,
        );
      }

      // 3. The codes lint-self.sh exempts.
      const ex = await vl(["--budget", BASELINE, "--exempt-codes"]);
      expectEq("--exempt-codes: exit", 0, ex.code);
      expectEq(
        "--exempt-codes: stdout",
        committed.total[CODE] > 0 ? `${CODE}\n` : "\n",
        ex.out,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
