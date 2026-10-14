// THE VL PORT OF THE FILED-WITNESS GRADER AGREES WITH THE PYTHON, byte for byte.
//
// `scripts/check-filed-witnesses.vl` is the second orchestrator script ported to VL
// (architecture-refactor-plan.md, T3); the Python stays beside it until the gate switches.
// This runs both on a small fixture inventory that reaches every column of the report —
// as filed, MOVED, `wrong_output`, a parse-error witness, a negated status, two `Want:`
// blocks, an unparsed row heading, a multi-file witness, a wrapped status — in the
// monolith, split-directory and README-fallback forms, plus `--json` and `--self-test`,
// and requires the same stdout, the same exit code and the same JSON file. Grading runs
// with `JOBS=2`, so the port's `xargs -P` fan-out is what is compared.
//
// Where they cannot agree, pinned below rather than left as prose:
//   1. No document argument: both exit 2, but the Python prints its docstring and the port
//      a short usage text.
//   2. A loud failure (a missing doc, a directory with no rows and no README fallback):
//      both exit 1, the Python through a traceback or `SystemExit` on stderr, the port with
//      one line on stdout, because VL has no stderr sink.
//   3. A diagnostic that quotes the witness's temp path: the two stage witnesses in
//      different temp directories, so a `detail` is compared up to that path.
//   4. A witness stopped by its timeout (`$WITNESS_TIMEOUT`, default 120 s): the Python
//      raises, the port retries once and reports the row not graded (the last test).
//   Not exercised here, by construction: child output that is not UTF-8 (the Python
//   raises, the port decodes lossily), and a non-ASCII letter or digit next to a heading's
//   id or a `Want`/`Repro` label (the port's `\s`, `\d` and `\b` read every non-ASCII byte
//   as punctuation; its `\s` does admit Unicode spaces).
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, nativeEnv, pythonBin } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-check-filed-witnesses] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();
type Out = { code: number; out: string; err: string };

const spawn = async (cmd: string, args: string[]): Promise<Out> => {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1", JOBS: "2" }),
  }).output();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

const py = (argv: string[]) =>
  spawn(pythonBin(), ["scripts/check-filed-witnesses.py", ...argv]);
const port = (argv: string[]) =>
  spawn(VL, [
    "run",
    "scripts/check-filed-witnesses.vl",
    "--compiler",
    COMPILER,
    "--",
    ...argv,
  ]);

const ind = (src: string) =>
  src.split("\n").map((l) => (l === "" ? "" : `    ${l}`)).join("\n");

// One row per behaviour the report distinguishes; ids are chosen so the split form sorts
// them out of lexical order (D9 before D10).
const ROWS: Record<string, string> = {
  D1: `### D1 — a closed row that runs
**closed · prints its value**

Repro:

${ind("print(6 * 7)")}
`,
  D2: `### D2 — a check reject that now runs
**loud check reject**

Repro:

${ind("print(2)")}
`,
  D3: `### D3 — no witness at all
**closed**

Nothing to run here.
`,
  D4: `### D4 — a negated status
**deliberately not closed by D1**

Repro:

${ind("print(4)")}
`,
  D5: `### D5 — Want met, ünïcødé ✓ title
**closed**

Repro:

${ind('print(5)\nprint("é")')}

Want:

${ind("5\né")}
`,
  D6: `### D6 — Want unmet
**closed**

Repro:

${ind('print("ü")')}

Want:

${ind("u")}
`,
  D7: `### D7 — prose filed as a program
**loud check reject**

Repro:

${ind("The classifier answers only for the kinds it\nknows, and the caller is worse off.")}
`,
  D8: `### D8 — a parse error is the filed outcome
**loud check reject · a parse error, deliberately**

Repro:

${ind("const = 1")}
`,
  D9: `### D9-x — a wrapped status and a PRINTS line
**check-clean
silently wrong · still prints 9**

Repro (one line):

${ind("print(9)\n// PRINTS 9")}
`,
  D10: `#### D10 bad heading, no dash
**closed**
`,
  D11: `### D11 — a two-file witness
**closed**

Repro:

${ind('// file: a.vl\nexport function six(): i32 { return 6 }\n// file: main.vl\nimport { six } from "./a"\nprint(six() * 7)')}
`,
  D12: `### D12 — loads then traps
**loads then traps**

Repro:

${ind("const xs: i32[] = [1, 2]\nprint(xs.length)\nprint(xs[9])")}
`,
  D13: `### D13 — two Want blocks
**closed**

Repro:

${ind("print(13)")}

Want:

${ind("13")}

Want:

${ind("14")}
`,
  D14: `### D14 — a later heading closes the row
**closed**

## Notes

Repro:

${ind("print(14)")}
`,
};

const MONOLITH = `# Fixture inventory\n\n${Object.values(ROWS).join("\n")}`;

// Disagreement 3: a diagnostic quotes the witness's temp path, which differs between the two
// (and from run to run), and the 200-code-point cut then lands on different text. A
// `detail` is compared up to the temp root; every other line exactly.
const TMP = Deno.env.get("TMPDIR") ?? "/tmp";
const untemp = (line: string): string => {
  if (!line.startsWith('    "detail": ')) return line;
  const cut = line.indexOf(TMP);
  return cut === -1 ? line : line.slice(0, cut);
};

const agree = async (label: string, argv: string[], json?: string) => {
  const p = await py(argv);
  const pj = json ? await Deno.readTextFile(json) : "";
  const v = await port(argv);
  const vj = json ? await Deno.readTextFile(json) : "";
  if (p.code !== v.code || p.out !== v.out) {
    throw new Error(
      `${label}: the port disagrees with the Python.\n` +
        `want exit ${p.code}, stdout:\n${p.out}\n${p.err}\n` +
        `got exit ${v.code}, stdout:\n${v.out}\n${v.err}`,
    );
  }
  const pl = pj.split("\n").map(untemp);
  const vl = vj.split("\n").map(untemp);
  const at = pl.findIndex((l, i) => l !== vl[i]);
  if (at !== -1 || pl.length !== vl.length) {
    throw new Error(
      `${label}: --json files differ at line ${at + 1}.\nwant: ${pl[at]}\ngot:  ${vl[at]}`,
    );
  }
  return p;
};

Deno.test({
  name: "check-filed-witnesses: the VL port prints the Python's report, byte for byte",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_cfw_" });
    try {
      const mono = `${dir}/inventory.md`;
      await Deno.writeTextFile(mono, MONOLITH);
      const split = `${dir}/split`;
      await Deno.mkdir(split);
      for (const id of ["D10", "D9", "D2", "D11"]) {
        await Deno.writeTextFile(`${split}/${id}.md`, ROWS[id]);
      }
      const fallback = `${dir}/fallback`;
      await Deno.mkdir(fallback);
      await Deno.writeTextFile(
        `${fallback}/README.md`,
        `# rows\n\n<!-- inventory-split: source ${mono} -->\n`,
      );

      const strict = await agree("--strict on the monolith", ["--strict", mono]);
      if (strict.code !== 1 || !strict.out.includes("** MOVED **")) {
        throw new Error(`the fixture must MOVE a row and exit 1, got:\n${strict.out}`);
      }
      await agree("--json, non-strict", ["--json", `${dir}/out.json`, mono], `${dir}/out.json`);
      await agree("a split directory, in id order", ["--strict", `${split}/`]);
      await agree("a README fallback directory", [fallback]);
      await agree("a single row file", [`${split}/D9.md`]);
      await agree("--self-test", ["--self-test"]);

      // Disagreement 1: no doc argument.
      const pu = await py([]);
      const vu = await port([]);
      if (pu.code !== 2 || vu.code !== 2 || !vu.out.startsWith("usage:")) {
        throw new Error(
          `no-argument usage: want exit 2 from both and the port's usage text, got ` +
            `${pu.code} / ${vu.code}:\n${vu.out}`,
        );
      }
      // Disagreement 2: a loud failure, on stdout in the port.
      for (const bad of [`${dir}/absent.md`, `${dir}/split/../fallback/..`]) {
        const pb = await py([bad]);
        const vb = await port([bad]);
        if (pb.code !== 1 || vb.code !== 1 || vb.out.trim() === "") {
          throw new Error(
            `loud failure on ${bad}: want exit 1 from both and a message on the port's ` +
              `stdout, got ${pb.code} / ${vb.code}:\n${vb.out}${vb.err}`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// A channel `timeout` stopped is the box's load, not the witness: before this, a witness
// that never finished fell through `classify` to `silent_invalid_wasm` (a filed row graded
// that way at load 83–122 and `runs` alone). It is retried once, then reported not graded.
Deno.test({
  name: "check-filed-witnesses: a witness stopped by its timeout is not graded, never a filed outcome",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_cfw_timeout_" });
    try {
      const doc = `${dir}/rows.md`;
      await Deno.writeTextFile(
        doc,
        `### D1 — a witness that never finishes\n**check-clean invalid wasm**\n\nRepro:\n\n` +
          `${ind("let i = 0\nwhile true { i = i + 1 }")}\n`,
      );
      const { code, stdout } = await new Deno.Command(VL, {
        args: ["run", "scripts/check-filed-witnesses.vl", "--compiler", COMPILER, "--", doc],
        cwd: ROOT,
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({ NO_COLOR: "1", JOBS: "1", WITNESS_TIMEOUT: "2" }),
      }).output();
      const out = dec.decode(stdout);
      const want = "0 graded · 0 as filed · 0 MOVED · 1 not graded";
      if (code !== 0 || !out.includes(want) || !out.includes("`vl run` was stopped after 2 s twice")) {
        throw new Error(`want exit 0, "${want}" and the timeout reason, got exit ${code}:\n${out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
