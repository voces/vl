// THE FILED-WITNESS GRADER'S REPORT, PINNED.
//
// `scripts/check-filed-witnesses.vl` re-runs every inventory row's own witness and reports which
// rows no longer behave as filed. This runs it on a small fixture inventory that reaches every
// column of the report — as filed, MOVED, `wrong_output`, a parse-error witness, a negated
// status, two `Want:` blocks, an unparsed row heading, a multi-file witness, a wrapped status —
// in the monolith, split-directory and README-fallback forms, plus `--json` and `--self-test`,
// and requires the exact report and exit code. Grading runs with `JOBS=2`, so the `xargs -P`
// fan-out is what is pinned.
//
// The report was graded beside the Python grader it replaced, byte for byte, before that was
// deleted; these goldens are that agreed output. The one line not pinned is the seed's
// provenance hash, which moves with every compiler change: it is required to say `match`, and a
// stale seed fails here with that sentence rather than as a report diff.
//
// Not exercised in the goldens, by construction: child output that is not UTF-8 (decoded
// lossily), and a non-ASCII letter or digit next to a heading's id or a `Want`/`Repro` label
// (read as punctuation). A witness stopped by its timeout has its own test, last.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";
import { builtScript } from "./support/builtScript.ts";

const SCRIPT = "scripts/check-filed-witnesses.vl";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-check-filed-witnesses] skipped — missing vl binary or seed wasm.",
  );
}

const dec = new TextDecoder();
type Out = { code: number; out: string };

const port = async (
  argv: string[],
  extra: Record<string, string> = {},
): Promise<Out> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["run", await builtScript(SCRIPT, { cwd: ROOT }), "--", ...argv],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1", JOBS: "2", WITNESS_CACHE: "0", ...extra }),
  }).output();
  return { code, out: dec.decode(stdout) };
};

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

${
    ind(
      "The classifier answers only for the kinds it\nknows, and the caller is worse off.",
    )
  }
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

${
    ind(
      '// file: a.vl\nexport function six(): i32 { return 6 }\n// file: main.vl\nimport { six } from "./a"\nprint(six() * 7)',
    )
  }
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

const PROV =
  "seed provenance: <seed> · compiler/*.vl <seed> over <n> files — match";

const TABLE_ALL = [
  "ID    FILED                  TODAY                  VERDICT",
  "D1    runs                   runs                   as filed",
  "D2    check_reject           runs                   ** MOVED **",
  "D5    runs                   runs                   as filed",
  "D6    runs                   wrong_output           ** MOVED **",
  "D8    check_reject           check_reject           as filed",
  "D9-x  silent_wrong_value     silent_wrong_value     as filed",
  "D11   runs                   runs                   as filed",
  "D12   trap_loads             trap_loads             as filed",
  "D3    -                      -                      not graded (no Repro block)",
  "D4    -                      -                      not graded (status line names no known outcome)",
  "D7    -                      -                      not graded (the witness does not PARSE, and the status does not file a parse error as the outcome)",
  "D13   -                      -                      not graded (carries more than one `Want:` block)",
  "D14   -                      -                      not graded (no Repro block)",
  "",
  "8 graded · 6 as filed · 2 MOVED · 5 not graded · 1 UNPARSED",
  "2 output-checked against Want · 1 output mismatch",
  PROV,
  "",
  "Rows whose filed behaviour no longer reproduces — re-grade the doc:",
  "  <DIR>/inventory.md:10  D2 — a check reject that now runs",
  "      filed check_reject, now runs: 2",
  "  <DIR>/inventory.md:42  D6 — Want unmet",
  '      filed runs, now wrong_output: prints "\\u00fc", Want "u"',
];

const UNRECOGNISED = (at: string) => [
  "",
  "Row headings this parser did NOT recognise - they are in no column above:",
  `  ${at}  #### D10 bad heading, no dash`,
  "      fix: widen `SEC`'s id pattern to admit the suffix, or rename the row.",
];

// The monolith, non-strict: every column, no fix advice.
const LENIENT = [...TABLE_ALL, ...UNRECOGNISED("<DIR>/inventory.md:77"), ""]
  .join("\n");

// The monolith under --strict: the ungradeable rows are listed with the fix.
const STRICT = [
  ...TABLE_ALL,
  "",
  "Rows this cannot grade - a filed row must carry a witness the checker RUNS:",
  "  <DIR>/inventory.md:17  D3 - no witness at all",
  "      no Repro block",
  "  <DIR>/inventory.md:22  D4 - a negated status",
  "      status line names no known outcome",
  "  <DIR>/inventory.md:53  D7 - prose filed as a program",
  "      the witness does not PARSE, and the status does not file a parse error as the outcome",
  "  <DIR>/inventory.md:100  D13 - two Want blocks",
  "      carries more than one `Want:` block",
  "  <DIR>/inventory.md:115  D14 - a later heading closes the row",
  "      no Repro block",
  "      fix: give it a `Repro:` block and a status line naming one of check_reject, compiler_trap, emit_reject, runs, silent_invalid_wasm, silent_wrong_evalcount, silent_wrong_value, trap_loads.",
  "      a witness that does not PARSE is prose, not a program: write the program, or — where the parse-stage refusal IS the filed outcome — say `parse error` in the status line.",
  "      a defect reachable only under a change that was REFUSED is a refutation pin: file the program that must keep RUNNING, with the status `runs today and must keep running`.",
  ...UNRECOGNISED("<DIR>/inventory.md:77"),
  "",
].join("\n");

// A split directory reads its rows in id order (D9 before D10), one file each.
const SPLIT = [
  "ID    FILED                  TODAY                  VERDICT",
  "D2    check_reject           runs                   ** MOVED **",
  "D9-x  silent_wrong_value     silent_wrong_value     as filed",
  "D11   runs                   runs                   as filed",
  "",
  "3 graded · 2 as filed · 1 MOVED · 0 not graded · 1 UNPARSED",
  "0 output-checked against Want · 0 output mismatch",
  PROV,
  "",
  "Rows whose filed behaviour no longer reproduces — re-grade the doc:",
  "  <DIR>/split/D2.md:1  D2 — a check reject that now runs",
  "      filed check_reject, now runs: 2",
  ...UNRECOGNISED("<DIR>/split/D10.md:1"),
  "",
].join("\n");

const SINGLE = [
  "ID    FILED                  TODAY                  VERDICT",
  "D9-x  silent_wrong_value     silent_wrong_value     as filed",
  "",
  "1 graded · 1 as filed · 0 MOVED · 0 not graded · 0 UNPARSED",
  "0 output-checked against Want · 0 output mismatch",
  PROV,
  "",
].join("\n");

// `--json`'s rows: what each graded row filed, what it did, and whether those agree.
const JSON_ROWS: [string, number, string, string, boolean][] = [
  ["D1", 3, "runs", "runs", true],
  ["D2", 10, "check_reject", "runs", false],
  ["D5", 29, "runs", "runs", true],
  ["D6", 42, "runs", "wrong_output", false],
  ["D8", 61, "check_reject", "check_reject", true],
  ["D9-x", 68, "silent_wrong_value", "silent_wrong_value", true],
  ["D11", 80, "runs", "runs", true],
  ["D12", 91, "trap_loads", "trap_loads", true],
];

Deno.test({
  name: "check-filed-witnesses: the report is pinned in every input form",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_cfw_" });
    try {
      // The provenance line names the seed's hash and the tree's; only its verdict is pinned.
      const norm = (out: string) =>
        out.replaceAll(dir, "<DIR>").replace(
          /^seed provenance: [0-9a-f]+ · compiler\/\*\.vl [0-9a-f]+ over \d+ files — match$/m,
          PROV,
        );
      const expect = async (
        label: string,
        argv: string[],
        code: number,
        want: string,
      ) => {
        const got = await port(argv);
        if (
          /^seed provenance: .* — (DIFFER|UNKNOWN)/m.test(got.out) ||
          got.out.includes("UNKNOWN")
        ) {
          throw new Error(
            `${label}: the seed's provenance does not match compiler/*.vl — run ` +
              `scripts/refresh-compiler.sh first.\n${got.out}`,
          );
        }
        const out = norm(got.out);
        if (got.code !== code || out !== want) {
          const a = want.split("\n");
          const b = out.split("\n");
          const at = a.findIndex((l, i) => l !== b[i]);
          throw new Error(
            `${label}: want exit ${code}, got ${got.code}; first differing line ${
              at + 1
            }:\n` +
              `want: ${a[at]}\ngot:  ${b[at]}\nfull output:\n${got.out}`,
          );
        }
      };

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

      await expect("--strict on the monolith", ["--strict", mono], 1, STRICT);
      await expect("the monolith, non-strict", [mono], 1, LENIENT);
      await expect("a README fallback directory", [fallback], 1, LENIENT);
      await expect(
        "a split directory, in id order",
        ["--strict", `${split}/`],
        1,
        SPLIT,
      );
      await expect("a single row file", [`${split}/D9.md`], 0, SINGLE);
      await expect(
        "--json",
        ["--json", `${dir}/out.json`, mono],
        1,
        `${LENIENT}\nwrote <DIR>/out.json\n`,
      );

      const rows = JSON.parse(await Deno.readTextFile(`${dir}/out.json`));
      const got = rows.map((r: Record<string, unknown>) =>
        JSON.stringify([r.id, r.line, r.declared, r.actual, r.agrees])
      );
      const want = JSON_ROWS.map((r) => JSON.stringify(r));
      if (got.join("\n") !== want.join("\n")) {
        throw new Error(
          `--json rows:\nwant:\n${want.join("\n")}\ngot:\n${got.join("\n")}`,
        );
      }
      const d6 = rows.find((r: Record<string, unknown>) => r.id === "D6");
      if (
        d6.detail !== 'prints "\\u00fc", Want "u"' || d6.want !== "u\n" ||
        d6.doc !== mono
      ) {
        throw new Error(
          `--json D6: want the Want mismatch detail, got ${JSON.stringify(d6)}`,
        );
      }

      const st = await port(["--self-test"]);
      if (
        st.code !== 0 ||
        !st.out.includes("14 specimens · 14 routed correctly · 0 wrong")
      ) {
        throw new Error(
          `--self-test: want exit 0 and 14 of 14 routed, got ${st.code}:\n${st.out}`,
        );
      }

      const usage = await port([]);
      if (usage.code !== 2 || !usage.out.startsWith("usage:")) {
        throw new Error(
          `no argument: want exit 2 and the usage text, got ${usage.code}:\n${usage.out}`,
        );
      }
      // A loud failure is one line on stdout (VL has no stderr sink) and exit 1.
      const loud: [string, string][] = [
        [
          `${dir}/absent.md`,
          `check-filed-witnesses: cannot read ${dir}/absent.md`,
        ],
        [
          `${dir}/split/../fallback/..`,
          `${dir}/split/../fallback/..: holds no \`D*.md\` rows, and ` +
          `${dir}/split/../fallback/../README.md carries no ` +
          "`<!-- inventory-split: source ... -->` line to fall back to",
        ],
      ];
      for (const [bad, line] of loud) {
        const b = await port([bad]);
        if (b.code !== 1 || !b.out.startsWith(line)) {
          throw new Error(
            `loud failure on ${bad}: want exit 1 and\n  ${line}\ngot ${b.code}:\n${b.out}`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// `--shard K/N` is what CI's two ci-witnesses jobs run: each row lands in exactly one shard,
// and the shards together grade every row exactly as one unsharded run does.
Deno.test({
  name:
    "check-filed-witnesses: --shard K/N partitions the rows and grades each as a whole run does",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_cfw_shard_" });
    try {
      const docs = `${dir}/rows`;
      await Deno.mkdir(docs);
      for (const [id, body] of Object.entries(ROWS)) {
        await Deno.writeTextFile(`${docs}/${id}.md`, body);
      }
      const graded = async (extra: string[], out: string) => {
        await port(["--json", out, ...extra, docs]);
        const rows = JSON.parse(await Deno.readTextFile(out));
        return new Map<string, string>(
          rows.map((
            r: Record<string, string>,
          ) => [r.id, `${r.declared}/${r.actual}`]),
        );
      };
      const whole = await graded([], `${dir}/whole.json`);
      const a = await graded(["--shard", "1/2"], `${dir}/a.json`);
      const b = await graded(["--shard", "2/2"], `${dir}/b.json`);
      const both = [...a.keys()].filter((id) => b.has(id));
      if (both.length > 0 || a.size === 0 || b.size === 0) {
        throw new Error(
          `want two non-empty disjoint shards, got ${a.size} and ${b.size} sharing ${
            both.join(", ")
          }`,
        );
      }
      const union = new Map([...a, ...b]);
      const bad = [...whole].filter(([id, v]) => union.get(id) !== v).map((
        [id],
      ) => id);
      if (union.size !== whole.size || bad.length > 0) {
        throw new Error(
          `want the shards to grade the ${whole.size} rows a whole run does, got ${union.size}, differing on ${
            bad.join(", ")
          }`,
        );
      }
      for (const spec of ["0/2", "3/2", "2", "a/b"]) {
        const r = await port(["--shard", spec, docs]);
        if (r.code !== 2 || !r.out.includes("--shard needs K/N")) {
          throw new Error(
            `--shard ${spec}: want exit 2 and the K/N message, got ${r.code}:\n${r.out}`,
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
  name:
    "check-filed-witnesses: a witness stopped by its timeout is not graded, never a filed outcome",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_cfw_timeout_" });
    try {
      const doc = `${dir}/rows.md`;
      // The witness blocks opening a FIFO nothing writes, so each wait costs no CPU.
      const fifo = `${dir}/never-written`;
      const mk = await new Deno.Command("mkfifo", { args: [fifo] }).output();
      if (mk.code !== 0) throw new Error(`mkfifo ${fifo}: exit ${mk.code}`);
      const src = `import { readTextFile } from "std:fs"\n` +
        `const t = readTextFile("${fifo}")\nprint(t is string)`;
      await Deno.writeTextFile(
        doc,
        `### D1 — a witness that never finishes\n**check-clean invalid wasm**\n\nRepro:\n\n` +
          `${ind(src)}\n`,
      );
      const grader = await builtScript(SCRIPT, { cwd: ROOT });
      const t0 = performance.now();
      const { code, stdout } = await new Deno.Command(VL, {
        args: ["run", grader, "--", doc],
        cwd: ROOT,
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({
          NO_COLOR: "1",
          JOBS: "1",
          WITNESS_TIMEOUT: "2",
          WITNESS_CACHE: "0",
        }),
      }).output();
      const out = dec.decode(stdout);
      const want = "0 graded · 0 as filed · 0 MOVED · 1 not graded";
      if (
        code !== 0 || !out.includes(want) ||
        !out.includes("`vl run` was stopped after 2 s twice")
      ) {
        throw new Error(
          `want exit 0, "${want}" and the timeout reason, got exit ${code}:\n${out}`,
        );
      }
      // The batch run and both solo tries each wait out the 2 s bound, so a grader that
      // dropped the retry finishes in two bounds; load can only add to this, never take away.
      const secs = (performance.now() - t0) / 1000;
      if (secs < 5.5) {
        throw new Error(
          `want three 2 s waits (the retry included), the grader took ${
            secs.toFixed(1)
          } s`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// The outcome cache (`$WITNESS_CACHE`): a warm run prints the cold run's report, a witness
// that touches the file system is never kept, the cached answer is what the warm run grades
// (a poisoned record moves its row), a `VL_*` setting is part of the key, and a witness
// routed past the run batch by a stale hint is still graded by what it does.
Deno.test({
  name:
    "check-filed-witnesses: the outcome cache answers exactly what a fresh run would",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_cfw_cache_" });
    try {
      const enc = new TextEncoder();
      const field = (s: string) => `${enc.encode(s).length}:${s}`;
      const fields = (b: Uint8Array): string[] => {
        const out: string[] = [];
        let i = 0;
        while (i < b.length) {
          let j = i;
          while (b[j] !== 58) j++;
          const n = Number(dec.decode(b.slice(i, j)));
          out.push(dec.decode(b.slice(j + 1, j + 1 + n)));
          i = j + 1 + n;
        }
        return out;
      };
      const doc = `${dir}/rows.md`;
      await Deno.writeTextFile(
        doc,
        [
          `### D1 — runs\n**closed**\n\nRepro:\n\n${ind("print(6 * 7)")}\n`,
          `### D2 — a check reject\n**loud check reject**\n\nRepro:\n\n${
            ind('const x: i32 = "nope"\nprint(x)')
          }\n`,
          `### D3 — reads the file system\n**closed**\n\nRepro:\n\n${
            ind(
              'import { fileSize } from "std:fs"\nprint(fileSize("/") is i64)',
            )
          }\n`,
        ].join("\n"),
      );
      const cache = `${dir}/cache`;
      const recs = () =>
        [...Deno.readDirSync(cache)].map((e) => e.name).filter((n) =>
          /^[0-9a-f]{16}\.rec$/.test(n)
        ).sort();
      // A check reject's detail is cut at 200 code points and names its row directory, so
      // under a long $TMPDIR the cut lands inside that path and the record is rightly not kept.
      const short = { TMPDIR: "/tmp" };
      const run = (env: Record<string, string>) =>
        port(["--strict", doc], { WITNESS_CACHE: cache, ...short, ...env });

      const cold = await run({});
      if (
        cold.code !== 0 || !cold.out.includes("3 graded · 3 as filed · 0 MOVED")
      ) {
        throw new Error(
          `cold: want exit 0 and 3 as filed, got ${cold.code}:\n${cold.out}`,
        );
      }
      const keys = recs();
      if (keys.length !== 1) {
        throw new Error(`cold: want one record file, got ${keys}`);
      }
      const rec = Deno.readFileSync(`${cache}/${keys[0]}`);
      const kept = fields(rec).filter((_, i) => i > 0 && (i - 1) % 5 === 0);
      if (
        kept.length !== 2 || !kept.some((w) => w.includes("6 * 7")) ||
        !kept.some((w) => w.includes("nope")) ||
        dec.decode(rec).includes("std:fs")
      ) {
        throw new Error(
          `cold: want D1 and D2 kept and D3 not, got ${JSON.stringify(kept)}`,
        );
      }
      const hints = dec.decode(Deno.readFileSync(`${cache}/hints.rec`));
      if (!hints.includes("nope") || hints.includes("6 * 7")) {
        throw new Error(`cold: want D2 hinted and D1 not, got ${hints}`);
      }

      const warm = await run({});
      if (warm.code !== cold.code || warm.out !== cold.out) {
        throw new Error(
          `warm: want the cold report, got ${warm.code}:\n${warm.out}`,
        );
      }

      const poisoned = dec.decode(rec).replace("12:check_reject", "4:runs");
      if (poisoned === dec.decode(rec)) {
        throw new Error("the record holds no check_reject");
      }
      Deno.writeTextFileSync(`${cache}/${keys[0]}`, poisoned);
      const hit = await run({});
      if (
        hit.code !== 1 ||
        !/^D2 +check_reject +runs +\*\* MOVED \*\*/m.test(hit.out)
      ) {
        throw new Error(
          `poisoned: want D2 MOVED, so the record was read, got ${hit.code}:\n${hit.out}`,
        );
      }
      const rekeyed = await run({ VL_CFW_CACHE_PROBE: "1" });
      if (rekeyed.out !== cold.out || recs().length !== 2) {
        throw new Error(
          `another VL_* setting: want a fresh key and the cold report, got ${recs()}:\n${rekeyed.out}`,
        );
      }

      const fresh = `${dir}/hinted`;
      Deno.mkdirSync(fresh);
      Deno.writeTextFileSync(
        `${fresh}/hints.rec`,
        field("check-filed-witnesses hints 1") +
          kept.map((w) =>
            field(w) + field("check_reject") + field("") + field("") +
            field("0")
          )
            .join(""),
      );
      const routed = await port(["--strict", doc], {
        WITNESS_CACHE: fresh,
        ...short,
      });
      if (routed.out !== cold.out) {
        throw new Error(
          `a stale hint: want the cold report, got:\n${routed.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
