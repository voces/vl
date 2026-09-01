// UNBRACED-BODY RECOVERY — one mistake, ONE diagnostic, and the parse continues.
//
// `if` / `while` / `for` bodies require braces. An unbraced one used to CASCADE:
// `expect("LBRACE")` diagnosed and left the cursor put, `parseBlock` swallowed the
// rest of the file as the body, and its `expectClose` reported a second, phantom
// `expected `}` but found end of input` on a line the user never wrote (three
// diagnostics when the body also held an `=`). `parseBracedBody` in
// compiler/parser.vl now takes the one statement as the arm.
//
// Why this file exists ALONGSIDE tests/cases/parser/*-braces-recovers.vl: the
// corpus oracle matches a directive against the diagnostic SET by message, so N
// diagnostics carrying the SAME message are covered by one directive. That is
// exactly the regression this change is about, so the count is asserted here —
// with the exact span, which the corpus tier matches by line only.
//
// GATING: same as tests/vl_check_json_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`)
// AND requires the built binary + seed wasm.

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
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-unbraced-body] skipped — missing vl binary or seed wasm.");
}

type Diag = {
  severity: string;
  line?: number;
  col?: number;
  endCol?: number;
  message: string;
};

const run = async (
  args: string[],
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

// Write `src` to a scratch file and return `vl check --json`'s diagnostics.
const diagsOf = async (dir: string, name: string, src: string) => {
  const file = `${dir}/${name}.vl`;
  await Deno.writeTextFile(file, src);
  const { out, err } = await run(["check", file, "--json"]);
  let parsed: Diag[];
  try {
    parsed = JSON.parse(out.trim()) as Diag[];
  } catch {
    throw new Error(`${name}: --json stdout is not JSON: ${out}\n${err}`);
  }
  return { file, diags: parsed };
};

const withDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_unbraced_body_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const fmtDiags = (ds: Diag[]) =>
  ds.map((d) => `${d.line}:${d.col}-${d.endCol} [${d.severity}] ${d.message}`)
    .join("; ") || "(none)";

// ONE diagnostic, with the exact message and the exact span. The span is the
// OFFENDING STATEMENT'S FIRST TOKEN — `endCol - col` is that token's length, so
// a squiggle under the recovered arm's opening token is asserted, not just a line.
type OneCase = {
  name: string;
  src: string;
  message: string;
  line: number;
  col: number;
  endCol: number;
};

const ONE: OneCase[] = [
  {
    name: "if-statement",
    src: "const c = true\nif c print(1)\n",
    message: "an `if` body requires braces: `if cond { … }`",
    line: 2,
    col: 6,
    endCol: 11,
  },
  {
    name: "else-if", // the `if` after an `else` is just an `if`
    src: "const c = true\nif c { print(1) } else if c print(2)\n",
    message: "an `if` body requires braces: `if cond { … }`",
    line: 2,
    col: 29,
    endCol: 34,
  },
  {
    name: "if-body-assignment", // used to cost THREE (the `=` re-entered as an expression)
    src: "const c = true\nlet x = 0\nif c x = 1\nprint(x)\n",
    message: "an `if` body requires braces: `if cond { … }`",
    line: 3,
    col: 6,
    endCol: 7,
  },
  {
    name: "value-position-if", // `parsePrimary` reaches the same `parseIf`
    src: "const c = true\nconst x = if c 1 else { 2 }\nprint(x)\n",
    message: "an `if` body requires braces: `if cond { … }`",
    line: 2,
    col: 16,
    endCol: 17,
  },
  {
    name: "while",
    src: "let i = 0\nwhile i < 3 i = i + 1\nprint(i)\n",
    message: "a `while` body requires braces: `while cond { … }`",
    line: 2,
    col: 13,
    endCol: 14,
  },
  {
    name: "labelled-while",
    src: "let i = 0\nouter: while i < 3 i = i + 1\nprint(i)\n",
    message: "a `while` body requires braces: `while cond { … }`",
    line: 2,
    col: 20,
    endCol: 21,
  },
  {
    name: "for-range",
    src: "for i in 0 to 3 print(i)\n",
    message: "a `for` body requires braces: `for v in … { … }`",
    line: 1,
    col: 17,
    endCol: 22,
  },
  {
    name: "for-range-step",
    src: "for i in 0 to 6 step 2 print(i)\n",
    message: "a `for` body requires braces: `for v in … { … }`",
    line: 1,
    col: 24,
    endCol: 29,
  },
  {
    name: "for-in",
    src: "const a = [1, 2]\nfor v in a print(v)\n",
    message: "a `for` body requires braces: `for v in … { … }`",
    line: 2,
    col: 12,
    endCol: 17,
  },
];

Deno.test({
  name: "unbraced body: exactly one diagnostic, spanning the arm's first token",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      for (const c of ONE) {
        const { diags } = await diagsOf(dir, c.name, c.src);
        if (diags.length !== 1) {
          throw new Error(
            `${c.name}: want exactly 1 diagnostic, got ${diags.length}: ${
              fmtDiags(diags)
            }`,
          );
        }
        const d = diags[0];
        if (d.message !== c.message) {
          throw new Error(
            `${c.name}: want message ${JSON.stringify(c.message)}, got ${
              JSON.stringify(d.message)
            }`,
          );
        }
        if (d.line !== c.line || d.col !== c.col || d.endCol !== c.endCol) {
          throw new Error(
            `${c.name}: want span ${c.line}:${c.col}-${c.endCol}, got ${d.line}:${d.col}-${d.endCol}`,
          );
        }
      }
    });
  },
});

// Two unbraced bodies are two mistakes and must cost two diagnostics — the
// recovery is per-arm, not a one-shot that suppresses the rest of the parse.
Deno.test({
  name: "unbraced body: one diagnostic PER unbraced arm",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const { diags } = await diagsOf(
        dir,
        "nested",
        "const c = true\nconst d = true\nif c if d print(1)\n",
      );
      if (diags.length !== 2) {
        throw new Error(
          `want 2 diagnostics (outer + inner if), got ${diags.length}: ${
            fmtDiags(diags)
          }`,
        );
      }
      for (const d of diags) {
        if (!d.message.startsWith("an `if` body requires braces")) {
          throw new Error(`unexpected message: ${d.message}`);
        }
      }
      if (diags[0].col !== 6 || diags[1].col !== 11) {
        throw new Error(`want cols 6 and 11, got ${fmtDiags(diags)}`);
      }
    });
  },
});

// The recovered arm is exactly ONE statement — never a scan — so the cursor
// lands back on the statement boundary and later, independent errors still
// report from their own positions. (Typecheck-tier errors after a parse error
// stay suppressed: `checkSrc` in compiler/driver.vl returns at
// `P.diags.length > 0`, a pre-existing gate this change does not touch.)
Deno.test({
  name: "unbraced body: later independent errors still surface",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const { diags } = await diagsOf(
        dir,
        "continues",
        "const c = true\nif c print(1)\nfor x 0 to 3 { print(x) }\nlet o = { x: 1 }\no.x++\n",
      );
      const want = [
        "an `if` body requires braces: `if cond { … }`",
        "expected `in` in for-loop",
        "postfix `++` target must be an identifier",
      ];
      if (diags.length !== want.length) {
        throw new Error(
          `want ${want.length} diagnostics, got ${diags.length}: ${
            fmtDiags(diags)
          }`,
        );
      }
      for (let i = 0; i < want.length; i++) {
        if (diags[i].message !== want[i]) {
          throw new Error(
            `diagnostic ${i}: want ${JSON.stringify(want[i])}, got ${
              JSON.stringify(diags[i].message)
            }`,
          );
        }
      }
      if (diags[0].line !== 2 || diags[1].line !== 3 || diags[2].line !== 5) {
        throw new Error(`want lines 2, 3, 5; got ${fmtDiags(diags)}`);
      }
    });
  },
});

// The recovery is GATED on the offending token plausibly STARTING a statement.
// A closer or a truncated construct does not, so those keep the plain
// `expected `{`` reading — a body was not written unbraced, it was not written
// at all, and synthesizing an arm out of a `}` would be a guess.
Deno.test({
  name: "unbraced body: a non-statement-start keeps the plain `expected {`",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const cases: { name: string; src: string; want: string }[] = [
        {
          name: "if-rbrace",
          src: "const c = true\nfunction f() {\n  if c }\n}\n",
          want: "expected `{` but found `}`",
        },
        {
          name: "while-rbrace",
          src: "const c = true\nfunction f() {\n  while c }\n}\n",
          want: "expected `{` but found `}`",
        },
        {
          name: "for-rbrace",
          src: "const a = [1]\nfunction f() {\n  for v in a }\n}\n",
          want: "expected `{` but found `}`",
        },
        {
          name: "if-else-no-then-branch",
          src: "const c = true\nif c else { print(1) }\n",
          want: "expected `{` but found `else`",
        },
        {
          name: "if-eof",
          src: "const c = true\nif c\n",
          want: "expected `{` but found end of line",
        },
      ];
      for (const c of cases) {
        const { diags } = await diagsOf(dir, c.name, c.src);
        if (!diags.some((d) => d.message === c.want)) {
          throw new Error(
            `${c.name}: want a diagnostic ${JSON.stringify(c.want)}, got ${
              fmtDiags(diags)
            }`,
          );
        }
        if (diags.some((d) => d.message.includes("requires braces"))) {
          throw new Error(
            `${c.name}: recovered a body it must not: ${fmtDiags(diags)}`,
          );
        }
      }
    });
  },
});

// `else` PERMITS an unbraced statement — legal syntax, not a recovery. It must
// stay diagnostic-free, run correctly, and keep normalizing to braced under
// `vl fmt`. (A design ruling on requiring braces there is the owner's, pending;
// this pins today's behaviour so a change to it is deliberate.)
Deno.test({
  name: "else: an unbraced branch stays legal, runs, and fmt braces it",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const cases: {
        name: string;
        src: string;
        stdout: string;
        formatted: string;
      }[] = [
        {
          name: "else-call",
          src: "const c = false\nif c { print(1) } else print(2)\n",
          stdout: "2\n",
          formatted: "const c = false\nif c { print(1) } else { print(2) }\n",
        },
        {
          name: "else-assign",
          src:
            "const c = false\nlet x = 0\nif c { x = 1 } else x = 2\nprint(x)\n",
          stdout: "2\n",
          formatted:
            "const c = false\nlet x = 0\nif c { x = 1 } else { x = 2 }\nprint(x)\n",
        },
        {
          name: "else-value",
          src: "const c = false\nconst x = if c { 1 } else 2\nprint(x)\n",
          stdout: "2\n",
          formatted:
            "const c = false\nconst x = if c { 1 } else { 2 }\nprint(x)\n",
        },
      ];
      for (const c of cases) {
        const { file, diags } = await diagsOf(dir, c.name, c.src);
        if (diags.length !== 0) {
          throw new Error(
            `${c.name}: want no diagnostics, got ${fmtDiags(diags)}`,
          );
        }
        const ran = await run(["run", file]);
        if (ran.code !== 0 || ran.out !== c.stdout) {
          throw new Error(
            `${c.name}: want stdout ${
              JSON.stringify(c.stdout)
            } at exit 0, got ${
              JSON.stringify(ran.out)
            } at exit ${ran.code}: ${ran.err}`,
          );
        }
        const fmt = await run(["fmt", file]);
        if (fmt.code !== 0 || fmt.out !== c.formatted) {
          throw new Error(
            `${c.name}: want fmt output ${JSON.stringify(c.formatted)}, got ${
              JSON.stringify(fmt.out)
            } at exit ${fmt.code}: ${fmt.err}`,
          );
        }
      }
    });
  },
});
