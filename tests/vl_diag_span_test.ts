// A CHECKER DIAGNOSTIC SPANS THE NODE IT NAMES.
//
// `tErrCodedData` used to position every type diagnostic at `nodeToks[at]` — the node's
// LAST token — and `diagEndCol` returned that one token's width, so "cannot assign f64 to
// i32" on `f(a, b)` underlined the `)` and one on `xs[i]` the `]`. 79% of checker errors
// over a 400-cell corpus sample were one column wide, 82% of those on a closing bracket.
//
// The grid below is the rule, one row per AST node kind that can carry a type error. Every
// `col`/`endCol` here is COUNTED FROM THE SOURCE TEXT on the line beside it, never copied
// from the compiler's output, and `underlines` re-states the same span as text — the two
// disagree the moment a number is wrong. Every row whose span is more than one column is
// also the control: the old closing-bracket anchor cannot satisfy it.
//
// Three exceptions to "span the node", each because the message names something narrower:
// a declaration's declared NAME, a member access's PROPERTY, and the raises re-anchored on
// a sub-node (a condition, an iterable, a subscript, an assignment's RHS).
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;

const exists = (p: string) => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};
const ENABLED = exists(VL) && exists(COMPILER);

type Diag = {
  severity: string;
  line?: number;
  col?: number;
  endCol?: number;
  message: string;
};

type Row = {
  name: string;
  src: string;
  frag: string; // a fragment of the message this row is about
  line: number; // 1-based
  col: number; // 1-based, inclusive
  endCol: number; // 1-based, EXCLUSIVE
  underlines: string; // the source text `[col, endCol)` covers
};

// `col`/`endCol` are 1-based with an exclusive end, so `endCol - col` is the caret width.
const GRID: Row[] = [
  // ── the default: the node, first token through its last on that line ──────
  {
    // `f(1)` — `f` at 1, `)` at 4.
    name: "call: the arity error spans the call",
    src: "function f(a: i32, b: i32) { print(a + b) }\nf(1)\n",
    frag: "wrong number of arguments",
    line: 2,
    col: 1,
    endCol: 5,
    underlines: "f(1)",
  },
  {
    // `const a = 1 + "two"` — `1` at 11, closing quote at 19.
    name: "binary: the operator error spans both operands",
    src: 'const a = 1 + "two"\nprint(a)\n',
    frag: "operator '+' is not defined",
    line: 1,
    col: 11,
    endCol: 20,
    underlines: '1 + "two"',
  },
  {
    // `const a = -s` — `-` at 11, `s` at 12.
    name: "unary: the operand error spans the operator too",
    src: 'const s = "hi"\nconst a = -s\nprint(a)\n',
    frag: "unary '-' expects a numeric type",
    line: 2,
    col: 11,
    endCol: 13,
    underlines: "-s",
  },
  {
    // `const p: P = { x: "one" }` — `{` at 14, `}` at 25.
    name: "struct literal: the assign error spans the literal",
    src: 'type P = { x: i32 }\nconst p: P = { x: "one" }\nprint(p.x)\n',
    frag: "cannot assign",
    line: 2,
    col: 14,
    endCol: 26,
    underlines: '{ x: "one" }',
  },
  {
    // `const xs: i32[] = [1, "two", 3]` — `[` at 19, `]` at 31.
    name: "array literal: the assign error spans the literal",
    src: 'const xs: i32[] = [1, "two", 3]\nprint(xs[0])\n',
    frag: "cannot assign",
    line: 1,
    col: 19,
    endCol: 32,
    underlines: '[1, "two", 3]',
  },
  {
    // `const s = n as string` — `n` at 11, `string`'s last char at 21.
    name: "as: the conversion error spans the whole cast",
    src: "const n = 1\nconst s = n as string\nprint(s)\n",
    frag: "`as` supports numeric conversions only",
    line: 2,
    col: 11,
    endCol: 22,
    underlines: "n as string",
  },
  {
    // `print(n[0])` — `n` at 7, `]` at 10.
    name: "index: the non-array receiver error spans the index expression",
    src: "const n = 5\nprint(n[0])\n",
    frag: "cannot index non-array",
    line: 2,
    col: 7,
    endCol: 11,
    underlines: "n[0]",
  },
  {
    // A node that spans LINES is clamped to its first: `const p: P = {` puts the
    // only token of the literal on that line at column 14.
    name: "multi-line node: the span clamps to the first line",
    src: 'type P = { x: i32 }\nconst p: P = {\n  x: "one",\n}\nprint(p.x)\n',
    frag: "cannot assign",
    line: 2,
    col: 14,
    endCol: 15,
    underlines: "{",
  },
  // ── exception 1: a declaration's own NAME ─────────────────────────────────
  {
    // `function f(a: i32): i32 { a }` — the second `f` at 10.
    name: "declaration: a redeclaration names the declared name",
    src:
      "function f(a: i32): i32 { a }\nfunction f(a: i32): i32 { a }\nprint(f(1))\n",
    frag: "redeclared f",
    line: 2,
    col: 10,
    endCol: 11,
    underlines: "f",
  },
  {
    // `type i32 = { r: f64 }` — `i32` at 6..8.
    name: "declaration: the reserved-name refusal names the type name",
    src: "type i32 = { r: f64 }\nprint(1)\n",
    frag: "may not take the built-in type name",
    line: 1,
    col: 6,
    endCol: 9,
    underlines: "i32",
  },
  {
    // `function g(x: i32) {` — `g` at 10. The message names the FUNCTION, so it
    // anchors at the declaration, not at the body's brace.
    name: "declaration: an uninferable return names the function",
    src: "function g(x: i32) {\n  return g(x)\n}\nprint(1)\n",
    frag: "cannot infer a return type for 'g'",
    line: 1,
    col: 10,
    endCol: 11,
    underlines: "g",
  },
  // ── exception 2: a member access's PROPERTY ───────────────────────────────
  {
    // `print(p.zzz)` — `zzz` at 9..11.
    name: "member: the unknown-field error names the property",
    src: "type P = { x: i32 }\nconst p: P = { x: 1 }\nprint(p.zzz)\n",
    frag: "no field 'zzz'",
    line: 3,
    col: 9,
    endCol: 12,
    underlines: "zzz",
  },
  {
    // `print(xs.nosuchmethod())` — `nosuchmethod` at 10..21.
    name: "method call: the unknown-method error names the method",
    src: "const xs = [1, 2, 3]\nprint(xs.nosuchmethod())\n",
    frag: "no method '.nosuchmethod'",
    line: 2,
    col: 10,
    endCol: 22,
    underlines: "nosuchmethod",
  },
  // ── exception 3: a raise re-anchored on a sub-node ────────────────────────
  {
    // `if 1 + 2 {` — the condition is `1 + 2`, columns 4..8.
    name: "if: the condition error spans the condition, not the statement",
    src: "if 1 + 2 {\n  print(1)\n}\n",
    frag: "if-condition must be boolean",
    line: 1,
    col: 4,
    endCol: 9,
    underlines: "1 + 2",
  },
  {
    // `while "loop" {` — the condition is `"loop"`, columns 7..12.
    name: "while: the condition error spans the condition",
    src: 'while "loop" {\n  print(1)\n}\n',
    frag: "while-condition must be boolean",
    line: 1,
    col: 7,
    endCol: 13,
    underlines: '"loop"',
  },
  {
    // `for x in n {` — the iterable `n` at 10, not the loop variable `x` at 5.
    name: "for-in: the iterable error spans the iterable",
    src: "const n = 5\nfor x in n {\n  print(x)\n}\n",
    frag: "for-in expects an array or map",
    line: 2,
    col: 10,
    endCol: 11,
    underlines: "n",
  },
  {
    // `print(xs["k"])` — the subscript `"k"` at 10..12.
    name: "index: the subscript error spans the subscript",
    src: 'const xs = [1, 2, 3]\nprint(xs["k"])\n',
    frag: "array index must be i32",
    line: 2,
    col: 10,
    endCol: 13,
    underlines: '"k"',
  },
  {
    // `const n: i32 = "text"` — the initialiser at 16..21.
    name: "let: the assign error spans the initialiser, not the binding",
    src: 'const n: i32 = "text"\nprint(n)\n',
    frag: "cannot assign string to 'n'",
    line: 1,
    col: 16,
    endCol: 22,
    underlines: '"text"',
  },
  {
    // `n = "text"` — the RHS at 5..10.
    name: "assignment: the error spans the RHS, not the place",
    src: 'let n: i32 = 0\nn = "text"\nprint(n)\n',
    frag: "cannot assign string to i32",
    line: 2,
    col: 5,
    endCol: 11,
    underlines: '"text"',
  },
  {
    // `  return "text"` — the returned value at 10..15.
    name: "return: the mismatch spans the returned value",
    src: 'function f(): i32 {\n  return "text"\n}\nprint(f())\n',
    frag: "return type mismatch",
    line: 2,
    col: 10,
    endCol: 16,
    underlines: '"text"',
  },
];

const jsonDiags = async (file: string): Promise<Diag[]> => {
  const { stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", file, "--json", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    // The host resolves `std:` from the BINARY's checkout, and a worktree's
    // binary is a symlink into the main repo — pin std to THIS tree.
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  const out = new TextDecoder().decode(stdout).trim();
  try {
    return JSON.parse(out) as Diag[];
  } catch {
    throw new Error(
      `${file}: --json stdout is not JSON: ${out}\n${
        new TextDecoder().decode(stderr)
      }`,
    );
  }
};

Deno.test({
  name: "diagnostic spans: every node kind's caret covers what its message names",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_diag_span_" });
    try {
      const bad: string[] = [];
      for (const row of GRID) {
        const file = `${dir}/span.vl`;
        await Deno.writeTextFile(file, row.src);
        const diags = await jsonDiags(file);
        const d = diags.find((x) =>
          x.severity === "error" && x.message.includes(row.frag)
        );
        if (!d) {
          bad.push(
            `${row.name}: no error containing "${row.frag}" — got ${
              diags.map((x) => `${x.severity} ${x.message}`).join("; ") || "none"
            }`,
          );
          continue;
        }
        if (d.line !== row.line || d.col !== row.col || d.endCol !== row.endCol) {
          bad.push(
            `${row.name}: want ${row.line}:[${row.col}, ${row.endCol}), got ` +
              `${d.line}:[${d.col}, ${d.endCol})`,
          );
          continue;
        }
        // The numbers and the text must agree: a wrong column that still parses
        // as a plausible span is caught here and nowhere else.
        const srcLine = row.src.split("\n")[row.line - 1] ?? "";
        const under = srcLine.slice(row.col - 1, row.endCol - 1);
        if (under !== row.underlines) {
          bad.push(
            `${row.name}: [${row.col}, ${row.endCol}) on "${srcLine}" is ` +
              `"${under}", but the row declares "${row.underlines}"`,
          );
        }
      }
      if (bad.length) {
        throw new Error(
          `${bad.length} of ${GRID.length} span rows failed:\n  ${
            bad.join("\n  ")
          }`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
