// THE VL PORT OF THE SURVEY RE-GRADER AGREES WITH THE PYTHON, byte for byte.
//
// `scripts/survey-regrade.vl` is the fifth orchestrator script ported to VL
// (architecture-refactor-plan.md, T3); the Python stays beside it, because
// `tests/vl_survey_measure_test.ts` reads its `KINDS` tuple. This builds a fixture
// checkout (both scripts, `seed_provenance.py`, a `compiler/` of two files, a survey
// document) and runs both from it, requiring the same stdout and exit code.
//
// The document reaches every column: holds, stale-live, stale-closed, one-sided `dir:`
// rows, an exemption, every NOT RE-RUNNABLE reason (no block, a bogus kind, no `why:`, a
// bad number, no `cmd:`, no `what:`, a failing command, a command printing no number, a
// bad `dir:`, a name the profile lacks), `%g` at both precisions across fixed and
// exponential spellings, and a title with a hyphen, an em dash and none. Three profiles
// (`stringArray`, `stringTable`, `shared.stringArray`) carry a recursive stack, a `$m2`
// suffix and a null sample, so inclusive shares count once and self shares count leaves.
// The seed's provenance is each of match, DIFFER and unknown, with and without a MOVED row.
// `--json`, `--strict`, `--require-profile` and `--self-test` are compared too, and a
// one-word mutation of the port, made in place, must disagree.
//
// Where they cannot agree, pinned below rather than left as prose:
//   1. No document argument: both exit 2, the Python prints its docstring, the port a
//      short usage text.
//   2. A loud failure (a missing document or profile): the Python raises on stderr, the
//      port prints one line on stdout and exits 1, because VL has no stderr sink.
//   3. `--self-test` names a temp directory, which differs; compared up to it.
//   Not exercised, by construction: a shell row running past 600 s, `float()` spellings
//   with digit separators, and a non-ASCII letter next to a `### row N` number.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, pythonBin, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-survey-regrade-port] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();
type Out = { code: number; out: string };

const ind = (lines: string[]) => lines.map((l) => `    ${l}`).join("\n");
const row = (n: string, title: string, block: string[] | null) =>
  `### row ${n}${title}\n\n${block === null ? "Prose only.\n" : `Measure:\n\n${ind(block)}\n`}\n`;
const sh = (cmd: string, filed: string, tol: string, extra: string[] = []) => [
  "kind: shell",
  `cmd: ${cmd}`,
  `filed: ${filed}`,
  `tol: ${tol}`,
  ...extra,
];

const DOC = `# Fixture survey

${row("1", " — holds", sh("echo 42", "42", "0"))}${
  row("2", " - grown (hyphen)", sh("echo 99", "10", "1"))
}${row("3", "", sh("echo 1", "30.29", "2"))}${
  row("4", " —   spaced   title  ", sh("echo 7", "7", "0", ["dir: at-most"]))
}${row("5", " — at-most fell, still holds", sh("echo 1", "7", "0", ["dir: at-most"]))}${
  row("6", " — at-most grew", sh("echo 9", "7", "0", ["dir: at-most"]))
}${row("7", " — at-least grew, still holds", sh("echo 9", "7", "0", ["dir: at-least"]))}${
  row("8", " — at-least fell", sh("echo 1", "7", "0", ["dir: at-least"]))
}${row("9", " — a bad dir", sh("echo 1", "7", "0", ["dir: sideways"]))}${
  row("10", " — no block", null)
}${row("11", " — a bogus kind", ["kind: guess", "filed: 1"])}${
  row("12", " — none without why", ["kind: none"])
}${
  row("13", " — none with a long ünïcode why", [
    "kind: none",
    "why: the figure is a readability claim — not a number, and this sentence runs on past the cut",
  ])
}${row("14", " — filed missing", ["kind: shell", "cmd: echo 1", "tol: 0"])}${
  row("15", " — tol not a number", ["kind: shell", "cmd: echo 1", "filed: 1", "tol: lots"])
}${row("16", " — no cmd", ["kind: shell", "filed: 1", "tol: 0"])}${
  row("17", " — a failing command", sh("echo oops >&2; exit 3", "1", "0"))
}${row("18", " — a failing command, stdout only", sh("echo 'out only'; exit 4", "1", "0"))}${
  row("19", " — no number printed", sh("printf 'no digits\\nhere \\\\ there'", "1", "0"))
}${row("20", " — quote in output", sh("printf \"it's text\"", "1", "0"))}${
  row("21", " — the last number wins", sh("echo '5 then 6 then -2.5 7.'", "7", "0"))
}${row("22", " — a minus and a fraction", sh("echo -3.25", "-3.25", "0"))}${
  row("23", " — zero", sh("echo 0", "0", "0"))
}${row("24", " — exponent spelled out", sh("echo 12345.678", "12345.678", "0"))}${
  row("25", " — tiny", sh("echo 0.00001234", "0.00001234", "0"))
}${row("26", " — rounds up a digit", sh("echo 9.9996", "9.9996", "0"))}${
  row("27", " — rounds into the exponent", sh("echo 99999.5", "99999.5", "0"))
}${row("28", " — four digits", sh("echo 999.95", "999.95", "0"))}${
  row("29", " — big moved", sh("echo 1234568", "1234567", "0"))
}${row("30", " — power of ten", sh("echo 10000", "10000", "0"))}${
  row("31", " — filed spellings", ["kind: shell", "cmd: echo 3", "filed: +.5", "tol: 5."])
}${row("32", " — the python variable", sh('"$PYTHON" -c "print(7)"', "7", "0"))}${
  row("33", " — a duplicate key and a bare key", [
    "kind: shell",
    "cmd: echo 1",
    "filed: 5",
    "filed: 1",
    "tol: 0",
    "stray",
  ])
}${row("34", " — an inclusive share", ["kind: profile-incl", "what: mid", "filed: 62.5", "tol: 0"])}${
  row("35", " — a self share with a suffixed name", [
    "kind: profile-self",
    "what: mid",
    "filed: 30",
    "tol: 1",
  ])
}${row("36", " — the root", ["kind: profile-incl", "what: root", "filed: 87.5", "tol: 0"])}${
  row("37", " — a vanished function", ["kind: profile-self", "what: gone", "filed: 1", "tol: 0"])
}${row("38", " — a share with no what", ["kind: profile-incl", "filed: 1", "tol: 0"])}${
  row("39", " — dir on a share", [
    "kind: profile-self",
    "what: leaf",
    "filed: 80",
    "tol: 0",
    "dir: at-least",
  ])
}
### row 40: not a row heading

Measure:

    kind: shell
    cmd: echo 1
    filed: 1

#### row 41 — four hashes

### row 42x — a word byte after the number

###row 43 — no space

### row 44 — two blocks
Measure:
    kind: shell
    cmd: echo 3
    filed: 3
    tol: 0

Measure:

    kind: shell
    cmd: echo 4
    filed: 9

The block ends at the first line that is neither indented nor blank.
`;

const prof = (strings: Record<string, unknown>, shared?: unknown) =>
  JSON.stringify({
    ...(shared ? { shared } : {}),
    threads: [{
      ...strings,
      funcTable: { name: [0, 1, 2, 3, 4] },
      frameTable: { func: [0, 1, 2, 3, 1, 4] },
      stackTable: {
        frame: [0, 1, 2, 3, 4, 5],
        prefix: [null, 0, 1, 2, 3, 0],
      },
      samples: { stack: [2, 3, 4, 4, 5, null, 0, 2] },
    }],
  });
const NAMES = ["root", "mid", "leaf", "mid$m2", "other"];
const PROFILES: Record<string, string> = {
  "p-array.json": prof({ stringArray: NAMES }),
  "p-table.json": prof({ stringTable: NAMES }),
  "p-shared.json": prof({ stringArray: [] }, { stringArray: NAMES }),
};

const SRC = "export function f(): i32 { return 1 }\n";

Deno.test({
  name: "survey-regrade: the VL port prints the Python's report, byte for byte",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_survey_regrade_port_" });
    const spawn = async (cmd: string, args: string[]): Promise<Out> => {
      const { code, stdout, stderr } = await new Deno.Command(cmd, {
        args,
        cwd: dir,
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({ NO_COLOR: "1" }),
      }).output();
      return { code, out: dec.decode(stdout) + dec.decode(stderr) };
    };
    const py = (argv: string[]) => spawn(pythonBin(), ["scripts/survey-regrade.py", ...argv]);
    const port = (argv: string[]) =>
      spawn(VL, ["run", "scripts/survey-regrade.vl", "--compiler", COMPILER, "--", ...argv]);
    const untemp = (s: string) => s.replace(/\S*\/(profile\.json|survey\.md)/g, "<T>/$1");
    const agree = async (label: string, argv: string[], want?: number) => {
      const p = await py(argv);
      const v = await port(argv);
      if (p.code !== v.code || untemp(p.out) !== untemp(v.out)) {
        throw new Error(
          `${label}: the port disagrees with the Python.\n` +
            `want exit ${p.code}:\n${p.out}\ngot exit ${v.code}:\n${v.out}`,
        );
      }
      if (want !== undefined && p.code !== want) {
        throw new Error(`${label}: want exit ${want} from both, got ${p.code}:\n${p.out}`);
      }
      return p.out;
    };
    const sidecar = (text: string | null) =>
      text === null
        ? Deno.remove(`${dir}/build/vl-compiler.wasm.src`).catch(() => {})
        : Deno.writeTextFile(`${dir}/build/vl-compiler.wasm.src`, text);
    try {
      await Deno.mkdir(`${dir}/scripts`);
      await Deno.mkdir(`${dir}/compiler`);
      await Deno.mkdir(`${dir}/build`);
      for (const f of ["survey-regrade.py", "seed_provenance.py", "survey-regrade.vl"]) {
        await Deno.copyFile(`${ROOT}/scripts/${f}`, `${dir}/scripts/${f}`);
      }
      // Sorted order matters to the fold: a name that sorts before `a.vl` by byte but after it
      // by locale would be hashed differently.
      await Deno.writeTextFile(`${dir}/compiler/b.vl`, SRC);
      await Deno.writeTextFile(`${dir}/compiler/B.vl`, SRC + "// upper\n");
      await Deno.writeTextFile(`${dir}/compiler/a_x.vl`, "// ünï\n" + SRC);
      await Deno.writeTextFile(`${dir}/compiler/notes.txt`, "not a source\n");
      await Deno.writeTextFile(`${dir}/survey.md`, DOC);
      await Deno.writeTextFile(`${dir}/empty.md`, "# nothing here\n");
      await Deno.writeTextFile(`${dir}/second.md`, row("1", " — second doc", sh("echo 5", "5", "0")));
      for (const [n, text] of Object.entries(PROFILES)) {
        await Deno.writeTextFile(`${dir}/${n}`, text);
      }
      const hash = (await spawn(pythonBin(), [
        "-c",
        "import sys; sys.path.insert(0, 'scripts'); import seed_provenance as s; " +
        "print(s.source_identity('.')[0])",
      ])).out.trim();
      if (!/^[0-9a-f]{16}$/.test(hash)) throw new Error(`no source identity: ${hash}`);

      // Provenance: unknown with a MOVED row refuses, match passes, DIFFER refuses.
      const unknown = await agree("unknown seed, rows moved", ["survey.md"], 2);
      for (const v of ["UNKNOWN", "REFUSING to report"]) {
        if (!unknown.includes(v)) throw new Error(`the fixture must reach ${v}:\n${unknown}`);
      }
      await sidecar(`# a comment\n\n${hash} extra words\n`);
      const full = await agree("a matching seed", ["survey.md", "--profile", "p-array.json"], 1);
      if (!full.includes("— match")) throw new Error(`no provenance match:\n${full}`);
      await agree("a matching seed, strict", ["--strict", "survey.md", "--profile", "p-table.json"], 1);
      await agree("a profile in shared.stringArray", ["--profile", "p-shared.json", "survey.md"], 1);
      for (
        const v of [
          "holds",
          "stale-live",
          "stale-closed",
          "not measurable",
          "NOT RE-RUNNABLE",
          "1.235e+04",
          "1.234e-05",
          "1e+05",
          "1.23457e+06",
          "62.5",
          "37.5",
          "87.5",
          "command exited 3: oops",
          "command exited 4: out only",
          "command printed no number: ",
          "no frame named 'gone'",
          "dir is 'sideways'",
          "kind is 'guess'",
        ]
      ) {
        if (!full.includes(v)) throw new Error(`the fixture must reach \`${v}\`:\n${full}`);
      }
      await agree("no profile", ["survey.md"], 1);
      await agree("--require-profile without one", ["--require-profile", "survey.md"], 1);
      await agree("two documents", ["survey.md", "./second.md"], 1);
      await agree("a clean document", ["second.md"], 0);
      await agree("a clean document, strict", ["--strict", "--require-profile", "second.md"], 0);
      await agree("the profile argument is missing", ["survey.md", "--profile"], 2);
      await agree("no headings", ["empty.md"], 2);
      await agree("no headings, two docs", ["empty.md", "empty.md"], 2);
      await agree("--self-test", ["--self-test"], 0);
      // The two documents' JSON must match exactly.
      const pj = await py(["--json", "py.json", "survey.md", "--profile", "p-array.json"]);
      const vj = await port(["--json", "vl.json", "survey.md", "--profile", "p-array.json"]);
      const a = await Deno.readTextFile(`${dir}/py.json`);
      const b = await Deno.readTextFile(`${dir}/vl.json`);
      if (pj.code !== vj.code || pj.out.replace("py.json", "vl.json") !== vj.out || a !== b) {
        throw new Error(`--json disagrees.\npy: ${pj.out}\nvl: ${vj.out}`);
      }

      await sidecar("0123456789abcdef\n");
      const differ = await agree("a DIFFER seed", ["second.md"], 2);
      if (!differ.includes("DIFFER")) throw new Error(`no DIFFER:\n${differ}`);
      await sidecar(null);
      await agree("an unknown seed, nothing moved", ["second.md"], 0);

      // Disagreement 1: no document argument.
      const pu = await py([]);
      const vu = await port([]);
      if (pu.code !== 2 || vu.code !== 2 || !vu.out.startsWith("usage:")) {
        throw new Error(`no-argument usage: got ${pu.code} / ${vu.code}:\n${vu.out}`);
      }
      // Disagreement 2: a loud failure, on stdout in the port.
      for (const bad of [["absent.md"], ["second.md", "--profile", "absent.json"]]) {
        const pb = await py(bad);
        const vb = await port(bad);
        if (pb.code === 0 || vb.code !== 1 || vb.out.trim() === "") {
          throw new Error(`loud failure on ${bad}: got ${pb.code} / ${vb.code}:\n${vb.out}`);
        }
      }

      // The must-red control: one verdict word changed in the port, in place.
      const src = await Deno.readTextFile(`${dir}/scripts/survey-regrade.vl`);
      const mutated = src.replace('verdict = "stale-closed"', 'verdict = "stale-closd"');
      if (mutated === src) throw new Error("the mutation did not apply");
      await Deno.writeTextFile(`${dir}/scripts/survey-regrade.vl`, mutated);
      const m = await port(["survey.md"]);
      await Deno.writeTextFile(`${dir}/scripts/survey-regrade.vl`, src);
      const want = await py(["survey.md"]);
      if (m.out === want.out) {
        throw new Error(`a mutated port must disagree, and printed:\n${m.out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
