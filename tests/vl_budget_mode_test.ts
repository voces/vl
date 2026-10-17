// `vl check --budget` HOLDS AND WRITES THE INTERP RATCHET.
//
// The interp ratchet has no script: `vl check --budget scripts/interp-budget-baseline.json`
// is its gate row and `--write-baseline` its writer, in the layout the retired
// scripts/ratchet.py wrote (architecture-refactor-plan T2). This holds the three verbs to one answer:
//
//   1. A fresh write must pass its own `--budget` with the ok line, `--budget-why` must
//      find every entry where the write put it, and a second write over the first must be
//      byte-identical (the layout is a fixed point).
//   2. On a doctored copy (one file's count lowered, one entry dropped, one invented),
//      `--budget` must red with exactly the doctored file's line and `--budget-why` must
//      move a name both ways.
//
// Every verb runs over a NARROWED population: the verbs do not depend on its size, and the
// committed baseline over the real tree is ci.yml's "Interpolation budget" step.
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
// The sentinel write's population: one compiler file. The committed baseline over the whole
// tree is lint-self.sh's hold; this test owns the writer's layout and sentences.
const SENTINEL_NARROW = "compiler/parser.vl";

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
      // 1. A fresh write.
      const full = `${dir}/full.json`;
      await Deno.copyFile(BASELINE, full);
      const w = await vl(["--budget", full, "--write-baseline", ...NARROW]);
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
        vl(["--budget", full, ...NARROW]),
        vl(["--budget-why", full, ...NARROW]),
        Deno.copyFile(full, `${dir}/again.json`).then(() =>
          vl(["--budget", `${dir}/again.json`, "--write-baseline", ...NARROW])
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

      // 2. A doctored baseline.
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

// THE SENTINEL RATCHET RIDES THE SAME MODE, WITH ITS OWN SENTENCES. Its baseline names an
// `ok` template and a `remedy` paragraph, and the census (scripts/sentinel-census.vl, an
// independent implementation) must agree with the lint's count file by file.
Deno.test({
  name:
    "vl check --budget holds the sentinel-index baseline with its own sentences",
  ignore: !ENABLED,
  async fn() {
    const path = `${ROOT}/scripts/sentinel-budget-baseline.json`;
    const committed = JSON.parse(await Deno.readTextFile(path));
    const dir = await Deno.makeTempDir({ prefix: "vl_budget_sentinel_" });
    try {
      const full = `${dir}/full.json`;
      await Deno.copyFile(path, full);
      // The hold reads a report at exactly the baseline: the walk is the write's to prove.
      const atBaseline = `${dir}/at-baseline.json`;
      await Deno.writeTextFile(
        atBaseline,
        JSON.stringify(
          Object.entries(
            committed.files as Record<string, Record<string, number>>,
          )
            .flatMap(([file, codes]) =>
              Object.entries(codes).flatMap(([code, n]) =>
                Array.from(
                  { length: n },
                  (_, i) => ({ file, code, line: i + 1, col: 1 }),
                )
              )
            ),
        ),
      );
      const [w, check, ex] = await Promise.all([
        vl(["--budget", full, "--write-baseline", SENTINEL_NARROW]),
        vl(["--budget", path, "--findings", atBaseline]),
        vl(["--budget", path, "--exempt-codes"]),
      ]);
      expectEq("--write-baseline: exit", 0, w.code);
      expectEq("--budget: exit", 0, check.code);
      const [u, s] = [
        "sentinel-index-unguarded",
        "sentinel-index-strict-untested",
      ];
      expectEq(
        "--budget: the baseline's own ok sentence",
        `sentinel-index budget ok — ${committed.total[u]} unguarded reads, ` +
          `${committed.total[s]} untested strict reads (baseline or below)\n`,
        check.out,
      );
      expectEq(
        "--exempt-codes",
        Object.keys(committed.total).filter((c) => committed.total[c] > 0).join(
          " ",
        ) + "\n",
        ex.out,
      );
      // A write over one file keeps the committed header byte for byte (ok, remedy and its
      // escapes, targets) and writes that file's lines exactly as the committed file has them.
      const want = (await Deno.readTextFile(path)).split("\n");
      const got = (await Deno.readTextFile(full)).split("\n");
      const header = (t: string[]) =>
        t.slice(0, t.findIndex((l) => l.startsWith('"total"')))
          .filter((l) => !l.startsWith('"commit"'));
      expectEq("a narrowed write keeps the header", header(want), header(got));
      const mine = (t: string[]) =>
        t.filter((l) => l.includes(`"${SENTINEL_NARROW}`))
          .map((l) => l.replace(/,$/, ""));
      if (mine(want).length < 2) {
        throw new Error(`${SENTINEL_NARROW} has no committed entry, so this is vacuous`);
      }
      expectEq("a narrowed write's own lines", mine(want), mine(got));
      const n = committed.files[SENTINEL_NARROW][u];
      expectEq(
        "a narrowed write's total line",
        `"total": {"${u}": ${n}, "${s}": 0},`,
        got.find((l) => l.startsWith('"total"')),
      );
      // A second write over the first is a fixed point.
      const again = `${dir}/again.json`;
      await Deno.copyFile(full, again);
      const w2 = await vl(["--budget", again, "--write-baseline", SENTINEL_NARROW]);
      expectEq("a second write: exit", 0, w2.code);
      expectEq(
        "a second write is byte-identical",
        got.join("\n"),
        await Deno.readTextFile(again),
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// `--findings` COUNTS A `--json` REPORT INSTEAD OF WALKING. A report with one finding more
// than a file's baseline reds on exactly that file; an out-of-target file is ignored. A
// finding names its entry only through an optional `text`, so `--budget-why` refuses a
// report without one rather than naming every entry by its file alone.
Deno.test({
  name: "vl check --budget --findings counts a report, not a walk",
  ignore: !ENABLED,
  async fn() {
    const base = JSON.parse(
      await Deno.readTextFile(`${ROOT}/scripts/sentinel-budget-baseline.json`),
    );
    const code = "sentinel-index-unguarded";
    const at = (file: string, n: number) =>
      Array.from(
        { length: n },
        (_, i) => ({ file, code, line: i + 1, col: 1 }),
      );
    const dir = await Deno.makeTempDir({ prefix: "vl_budget_findings_" });
    try {
      const baselinePath = `${ROOT}/scripts/sentinel-budget-baseline.json`;
      const file = "compiler/emit_classify.vl";
      const was = base.files[file][code];
      const ok = `${dir}/ok.json`;
      await Deno.writeTextFile(
        ok,
        JSON.stringify([...at(file, was), ...at("std/fs.vl", 5)]),
      );
      const good = await vl(["--budget", baselinePath, "--findings", ok]);
      expectEq("at baseline: exit", 0, good.code);
      const bad = `${dir}/bad.json`;
      await Deno.writeTextFile(bad, JSON.stringify(at(file, was + 1)));
      const red = await vl(["--budget", baselinePath, "--findings", bad]);
      expectEq("one over: exit", 1, red.code);
      expectEq(
        "one over: names the file",
        true,
        red.out.includes(`${file}  ${code}: ${was + 1} (baseline ${was})`),
      );
      const refused = await vl([
        "--budget-why",
        baselinePath,
        "--findings",
        ok,
      ]);
      expectEq("--budget-why refuses findings with no `text`", 2, refused.code);
      expectEq(
        "the refusal says why",
        true,
        (refused.out + refused.err).includes("carry no `text`"),
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
