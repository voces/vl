// `vl check --budget` HOLDS AND WRITES THE INTERP RATCHET.
//
// The interp ratchet has no script: `vl check --budget scripts/interp-budget-baseline.json`
// is its gate row and `--write-baseline` its writer, in the layout the retired
// scripts/ratchet.py wrote (architecture-refactor-plan T2). This holds the verbs to one answer:
//
//   1. A fresh write keeps the committed header and writes one line per entry, and
//      `--budget-why` over it finds every entry where the write put it.
//   2. On a doctored copy (one file's count lowered, one entry dropped, one invented),
//      `--budget` must red with exactly the doctored file's line and `--budget-why` must
//      move a name both ways.
//
// Every verb runs over a NARROWED population: the verbs do not depend on its size, and the
// committed baseline over the real tree is ci.yml's "Interpolation budget" step. Each
// invocation here is the only one a planted defect in the budget mode reds; one that only
// re-caught another's defects was removed rather than kept as a second witness.
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
// The sentinel write's population: one fixture file in a temp tree, since the committed
// baseline is at zero. The committed baseline over the whole tree is lint-self.sh's hold;
// this test owns the writer's layout and sentences.
const SENTINEL_FIXTURE = "compiler/holes.vl";
const SENTINEL_FIXTURE_SRC = `let tys: i32[] = []

type Row = { inner: i32 }

function ok(t: Row): i32 {
  if t.inner < 0 { return 0 }
  tys[t.inner]
}

function bad(t: Row): i32 {
  tys[t.inner]
}

function worse(t: Row): i32 {
  tys[t.inner] + 1
}
`;

type Run = { code: number; out: string; err: string };

const vl = async (args: string[], cwd = ROOT): Promise<Run> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", ...args, "--compiler", COMPILER],
    cwd,
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
      const [why, vc, vw] = await Promise.all([
        vl(["--budget-why", full, ...NARROW]),
        vl(["--budget", doctored, ...NARROW]),
        vl(["--budget-why", doctored, ...NARROW]),
      ]);
      expectEq("--budget-why on a fresh write: exit", 0, why.code);
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
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// THE SENTINEL RATCHET RIDES THE SAME MODE, WITH ITS OWN SENTENCES. Its baseline names an
// `ok` template and a `remedy` paragraph. The committed baseline is at zero, so the write's
// population is a fixture tree of its own: two unguarded reads in one `compiler/` file.
Deno.test({
  name:
    "vl check --budget holds the sentinel-index baseline with its own sentences",
  ignore: !ENABLED,
  async fn() {
    const path = `${ROOT}/scripts/sentinel-budget-baseline.json`;
    const committed = JSON.parse(await Deno.readTextFile(path));
    const dir = await Deno.makeTempDir({ prefix: "vl_budget_sentinel_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      await Deno.writeTextFile(`${dir}/${SENTINEL_FIXTURE}`, SENTINEL_FIXTURE_SRC);
      const full = `${dir}/full.json`;
      await Deno.copyFile(path, full);
      const [w, ex] = await Promise.all([
        vl(["--budget", full, "--write-baseline", SENTINEL_FIXTURE], dir),
        vl(["--budget", path, "--exempt-codes"]),
      ]);
      expectEq("--write-baseline: exit", 0, w.code);
      const [u, s] = [
        "sentinel-index-unguarded",
        "sentinel-index-strict-untested",
      ];
      expectEq(
        "--exempt-codes",
        Object.keys(committed.total).filter((c) => committed.total[c] > 0).join(
          " ",
        ) + "\n",
        ex.out,
      );
      // A write keeps the committed header byte for byte (ok, remedy and its escapes,
      // targets) and writes one count line and one entry line per finding.
      const want = (await Deno.readTextFile(path)).split("\n");
      const got = (await Deno.readTextFile(full)).split("\n");
      const header = (t: string[]) =>
        t.slice(0, t.findIndex((l) => l.startsWith('"total"')))
          .filter((l) => !l.startsWith('"commit"'));
      expectEq("a write keeps the header", header(want), header(got));
      expectEq(
        "a write's own lines",
        [
          `"${SENTINEL_FIXTURE}": {"${u}": 2, "${s}": 0}`,
          `["${u}", "${SENTINEL_FIXTURE}: tys[t.inner]", 1]`,
          `["${u}", "${SENTINEL_FIXTURE}: tys[t.inner] + 1", 1]`,
        ],
        got.filter((l) => l.includes(`"${SENTINEL_FIXTURE}`))
          .map((l) => l.replace(/,$/, "")),
      );
      expectEq(
        "a write's total line",
        `"total": {"${u}": 2, "${s}": 0},`,
        got.find((l) => l.startsWith('"total"')),
      );
      // The hold reads a report at exactly the written baseline: the walk is the write's to prove.
      const atBaseline = `${dir}/at-baseline.json`;
      await Deno.writeTextFile(
        atBaseline,
        JSON.stringify(
          [1, 2].map((line) => ({ file: SENTINEL_FIXTURE, code: u, line, col: 1 })),
        ),
      );
      const check = await vl(["--budget", full, "--findings", atBaseline]);
      expectEq("--budget: exit", 0, check.code);
      expectEq(
        "--budget: the baseline's own ok sentence",
        `sentinel-index budget ok — 2 unguarded reads, 0 untested strict reads (baseline or below)\n`,
        check.out,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// `--findings` COUNTS A `--json` REPORT INSTEAD OF WALKING. A report at a file's baseline
// passes and an out-of-target file is ignored; the red path is the doctored walk's above. A
// finding names its entry only through an optional `text`, so `--budget-why` refuses a
// report without one rather than naming every entry by its file alone.
Deno.test({
  name: "vl check --budget --findings counts a report, not a walk",
  ignore: !ENABLED,
  async fn() {
    const code = "sentinel-index-unguarded";
    const at = (file: string, n: number) =>
      Array.from(
        { length: n },
        (_, i) => ({ file, code, line: i + 1, col: 1 }),
      );
    const dir = await Deno.makeTempDir({ prefix: "vl_budget_findings_" });
    try {
      // The committed baseline is at zero; a copy owing three reads in one file is the hold.
      const base = JSON.parse(
        await Deno.readTextFile(`${ROOT}/scripts/sentinel-budget-baseline.json`),
      );
      const file = "compiler/emit_mono.vl";
      const was = 3;
      base.total[code] = was;
      base.files[file] = { [code]: was, "sentinel-index-strict-untested": 0 };
      const baselinePath = `${dir}/baseline.json`;
      await Deno.writeTextFile(baselinePath, JSON.stringify(base));
      const ok = `${dir}/ok.json`;
      await Deno.writeTextFile(
        ok,
        JSON.stringify([...at(file, was), ...at("std/fs.vl", 5)]),
      );
      const [good, refused] = await Promise.all([
        vl(["--budget", baselinePath, "--findings", ok]),
        vl(["--budget-why", baselinePath, "--findings", ok]),
      ]);
      expectEq("at baseline: exit", 0, good.code);
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
