// THE TWO COMMENT-RULE IMPLEMENTATIONS MUST AGREE.
//
// `compiler/lint.vl` grades one module at a time from the source the driver hands
// it; `scripts/comment-budget.py` grades the whole tree for the per-file ratchet.
// They carry the same block definition, the same four clauses and the same two
// budgets (4 lines a block, 12 a module header), and nothing else ties them
// together — so a change to either that moves a count silently un-ratchets the
// tree. This runs BOTH over five fixtures and compares the hit LINES, not totals.
// The rules themselves are docs/internals/comment-style.md.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, like the other native `vl_*` suites.

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
const SCRIPT = `${ROOT}/scripts/comment-budget.py`;
const TOO_LONG = "comment-block-too-long";
const UNCITED = "comment-measurement-uncited";
const SHOUTING = "comment-shouting";
const HISTORY = "comment-history";
const CODES = [TOO_LONG, UNCITED, SHOUTING, HISTORY] as const;
type Code = typeof CODES[number];

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-comment-budget] skipped — missing vl binary or seed wasm.");
}

const dull = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `// ${tag} line ${i + 1} of the block`).join("\n");

// Every `dull` line reads "line N of the block" — no unit, no date, no verdict, no
// capitals, no history phrase — so a long run of them trips clause 1 ONLY. That
// separation is the point: it pins that the four clauses are counted independently.
//
// The row id in `dirty.vl` is D1230, a row that EXISTS. An invented one resolves nowhere
// and `tests/vl_inventory_refs_test.ts` reds on it — correctly; a fixture is not an
// exemption from that. The measurement beside it is the fixture's own invention, which is
// why the line says so.
type Fixture = {
  name: string;
  src: string;
  want: Partial<Record<Code, number[]>>;
  /** A substring the ONE too-long message must contain (the budget it applied). */
  says?: string;
};

const FIXTURES: Fixture[] = [
  {
    // Nothing fires: a 2-line header, a short block, no measurement.
    name: "clean.vl",
    src: `// The adder's invariant: both operands are already range-checked by
// the caller, so this never traps.
export function add(a: i32, b: i32): i32 { a + b }

// Scale by a constant; see DECISIONS.md for why the factor is not a parameter.
export function scale(a: i32): i32 { a * 10 }
`,
    want: {},
  },
  {
    // A 3-line header (so the 13-line run below is a plain BLOCK, not the header),
    // a 13-line block, a 40-line block, an uncited measurement, and the same
    // measurement cited two ways — neither citation may fire clause 2, and all
    // three fire clause 3 on their date.
    name: "dirty.vl",
    src: `${dull(3, "head")}
export function hdr(): i32 { 0 }

${dull(13, "thirteen")}
export function a(): i32 { 1 }

${dull(40, "forty")}
export function b(): i32 { 2 }

// Measured 2026-09-02: 48 cells moved loud to silent.
export function c(): i32 { 3 }

// Measured 2026-09-02: 48 cells moved loud to silent (specimen row id D1230).
export function d(): i32 { 4 }

// Measured 2026-09-02: 48 cells moved loud to silent — DECISIONS.md has the shape.
export function e(): i32 { 5 }
`,
    want: { [TOO_LONG]: [6, 21], [UNCITED]: [63], [HISTORY]: [63, 66, 69] },
  },
  {
    // THE HEADER SPLIT, in one file: 10 lines at the top passes on the 12-line
    // header budget, and the SAME 10 lines below code fires on the 4-line one.
    name: "headers.vl",
    src: `${dull(10, "head")}
export function a(): i32 { 1 }

${dull(10, "mid")}
export function b(): i32 { 2 }
`,
    want: { [TOO_LONG]: [13] },
    says: "comment block of 10 lines exceeds the 4-line budget",
  },
  {
    // A header over its own budget, and the message has to name WHICH budget. The
    // multi-line `import` above it is the `format.vl` shape (a header may follow the
    // import region).
    name: "bigheader.vl",
    src: `import {
  dep,
} from "./dep"

${dull(20, "head")}
export function a(): i32 { dep() }
`,
    want: { [TOO_LONG]: [5] },
    says: "module header of 20 lines exceeds the 12-line budget",
  },
  {
    // VOICE: rules 3 and 5. Both are LINE facts reported where they stand, once per
    // block per code — and every negative here is a way the scan could over-fire.
    name: "voice.vl",
    src: `// A quiet first line, so the hit cannot just be the block's start.
// It lands on THE SECOND LINE, where the capitals are.
// A quiet third line, to pin that one block reports once.
export function a(): i32 { 1 }

// The pair WASM ABI is on the allow-list; \`ALPHA BETA\` sits in backticks.
// Neither fires, and one shouted word alone is not a run: ONLY this.
export function b(): i32 { 2 }

// This line used to say something else.
// A second line that was history too, to pin one report per block.
export function c(): i32 { 3 }

// The word \`was\` in backticks names a field, so this line is quiet.
export function d(): i32 { 4 }

// A date is history with no verb: 2026-09-02.
export function e(): i32 { 5 }
`,
    want: { [UNCITED]: [17], [SHOUTING]: [2], [HISTORY]: [10, 17] },
  },
];

const DEP = `export function dep(): i32 { 7 }\n`;

type Hits = { lines: Record<string, number[]>; msgs: string[] };

const script = async (path: string): Promise<Hits> => {
  const { code, stdout, stderr } = await new Deno.Command("python3", {
    args: [SCRIPT, "--grade", path],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (code !== 0) {
    throw new Error(
      `comment-budget.py --grade ${path} exited ${code}: ${new TextDecoder().decode(stderr)}`,
    );
  }
  const raw = JSON.parse(new TextDecoder().decode(stdout)) as Record<string, [number, number][]>;
  const lines: Record<string, number[]> = {};
  for (const c of CODES) lines[c] = raw[c].map(([line]) => line).sort((x, y) => x - y);
  return { lines, msgs: [] };
};

const lint = async (path: string, file: string): Promise<Hits> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--severity", "info", "--json", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  if (code > 1) {
    throw new Error(`vl check ${path} exited ${code}: ${new TextDecoder().decode(stderr)}`);
  }
  const all = JSON.parse(new TextDecoder().decode(stdout)) as {
    file: string;
    code?: string;
    line: number;
    message: string;
  }[];
  // A graph target lints its deps too; only the fixture under test is compared.
  const diags = all.filter((d) => d.file.endsWith(`/${file}`) || d.file === file);
  const lines: Record<string, number[]> = {};
  for (const c of CODES) {
    lines[c] = diags.filter((d) => d.code === c).map((d) => d.line).sort((x, y) => x - y);
  }
  return {
    lines,
    msgs: diags.filter((d) => d.code === TOO_LONG).map((d) => d.message),
  };
};

const eq = (a: number[], b: number[]) => JSON.stringify(a) === JSON.stringify(b);

Deno.test({
  name: "comment rules: the lint and the ratchet script agree, all four codes",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_comment_budget_" });
    await Deno.writeTextFile(`${dir}/dep.vl`, DEP);

    for (const f of FIXTURES) {
      const path = `${dir}/${f.name}`;
      await Deno.writeTextFile(path, f.src);
      const s = await script(path);
      const l = await lint(path, f.name);

      for (const c of CODES) {
        if (!eq(s.lines[c], l.lines[c])) {
          throw new Error(
            `${f.name}: ${c} disagrees — comment-budget.py wants lines ` +
              `${JSON.stringify(s.lines[c])}, compiler/lint.vl got ` +
              `${JSON.stringify(l.lines[c])}. The two carry the same block definition ` +
              `and the same budgets; whichever moved has to move back, or both together.`,
          );
        }
        // Pin the fixture's own arithmetic, so an agreeing pair of ZEROS cannot pass.
        const want = f.want[c] ?? [];
        if (!eq(s.lines[c], want)) {
          throw new Error(
            `${f.name}: want ${c} at lines ${JSON.stringify(want)}, got ` +
              `${JSON.stringify(s.lines[c])}`,
          );
        }
      }

      if (f.says !== undefined) {
        if (l.msgs.length !== 1 || !l.msgs[0].includes(f.says)) {
          throw new Error(
            `${f.name}: the ${TOO_LONG} message must name the budget it applied — want ` +
              `one message containing "${f.says}", got ${JSON.stringify(l.msgs)}`,
          );
        }
      }
    }

    await Deno.remove(dir, { recursive: true });
  },
});
