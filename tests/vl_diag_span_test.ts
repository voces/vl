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
//
// A node written over several LINES spans them: `endLine` rides the report beside `endCol`,
// which counts from it. `endLine` is emitted only where it differs from `line`, so a row
// that declares none is also asserting the field is absent.
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
  endLine?: number;
  endCol?: number;
  message: string;
};

type Row = {
  name: string;
  src: string;
  frag: string; // a fragment of the message this row is about
  sev?: string; // the tier it is raised at; "error" when omitted
  first?: boolean; // this diagnostic must be the FIRST error the report prints
  line: number; // 1-based
  col: number; // 1-based, inclusive
  endLine?: number; // 1-based; omitted when the span ends on `line`
  endCol: number; // 1-based, EXCLUSIVE, a column on `endLine ?? line`
  underlines: string; // the source text the span covers, newlines included
};

// The source text a row's span covers, cut out of the row's own `src`. A one-line span is
// a slice of its line; a multi-line one is the first line from `col`, every whole line
// between, and the last line up to `endCol`. This is what makes `underlines` a second
// statement of the numbers rather than a restatement of them.
const spanText = (row: Row): string => {
  const lines = row.src.split("\n");
  const endLine = row.endLine ?? row.line;
  if (endLine === row.line) {
    return (lines[row.line - 1] ?? "").slice(row.col - 1, row.endCol - 1);
  }
  return [
    (lines[row.line - 1] ?? "").slice(row.col - 1),
    ...lines.slice(row.line, endLine - 1),
    (lines[endLine - 1] ?? "").slice(0, row.endCol - 1),
  ].join("\n");
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
  // -- a node that spans LINES spans them in the report too ------------------
  // `endLine` rides the ABI beside `endCol`, so a multi-line construct underlines whole
  // rather than collapsing to a caret on its opening token. The end column counts from
  // `endLine`, which is why several of these end at column 2 -- the line's closing brace.
  {
    // `{` at 2:14 through the `}` on its own line 4, whose end column is 2.
    name: "multi-line struct literal: the assign error spans the whole literal",
    src: 'type P = { x: i32 }\nconst p: P = {\n  x: "one",\n}\nprint(p.x)\n',
    frag: "cannot assign",
    line: 2,
    col: 14,
    endLine: 4,
    endCol: 2,
    underlines: '{\n  x: "one",\n}',
  },
  {
    // `f` at 2:1 through the `)` alone on line 4.
    name: "multi-line call: the arity error spans the call across its lines",
    src: "function f(a: i32, b: i32) { print(a + b) }\nf(\n  1,\n)\n",
    frag: "wrong number of arguments",
    line: 2,
    col: 1,
    endLine: 4,
    endCol: 2,
    underlines: "f(\n  1,\n)",
  },
  {
    // The condition `1 +` / `  2` -- `1` at 1:4, the `2` at 2:3 ending at 2:4.
    name: "multi-line condition: the if-condition error spans both its lines",
    src: "if 1 +\n  2 {\n  print(1)\n}\n",
    frag: "if-condition must be boolean",
    line: 1,
    col: 4,
    endLine: 2,
    endCol: 4,
    underlines: "1 +\n  2",
  },
  {
    // The whole `if ... { ... } else { ... }` initialiser: `if` at 2:16, its `}` on 6.
    name: "multi-line if-expression: the assign error spans both arms",
    src:
      'const c = true\nconst n: i32 = if c {\n  "yes"\n} else {\n  "no"\n}\nprint(n)\n',
    frag: "cannot assign string to 'n'",
    line: 2,
    col: 16,
    endLine: 6,
    endCol: 2,
    underlines: 'if c {\n  "yes"\n} else {\n  "no"\n}',
  },
  {
    // One TOKEN spanning lines: the string opens at 2:16 and its closing quote ends at
    // 3:11, so the end column is counted from the literal's LAST line, not its first.
    name: "multi-line string: the span follows the lexeme onto its last line",
    src: 'const n = 1\nconst s: i32 = "n is\n${n} here"\nprint(s)\n',
    frag: "cannot assign string to 's'",
    line: 2,
    col: 16,
    endLine: 3,
    endCol: 11,
    underlines: '"n is\n${n} here"',
  },
  {
    // The `match` keyword at 2:3 through the closing `}` on line 5, ending at column 4.
    name: "multi-line match: the exhaustiveness verdict spans the whole match",
    src:
      "function g(k: i32) {\n  match k {\n    1 => print(1)\n    2 => print(2)\n  }\n}\ng(1)\n",
    frag: "non-exhaustive match",
    line: 2,
    col: 3,
    endLine: 5,
    endCol: 4,
    underlines: "match k {\n    1 => print(1)\n    2 => print(2)\n  }",
  },
  // ── a MERGED program: the span is this file's node, not another file's token ──
  // `nodeStartTok` used to binary-search every module's tokens for the node's byte offset,
  // and a merge appends each module's tokens carrying that module's OWN offsets — so the
  // search could answer with a token from `std:` and place the diagnostic anywhere (D1652).
  // Every row here imports a module; an interpolation hole imports `std:fmt` by itself.
  {
    // `print(`v=\{[1]}`)` — the hole is the array literal at 12, its `]` at 14.
    // Before D1652 this underlined the `]` alone.
    name: "merged: a hole on line 1 spans the hole",
    src: 'print("v=\\{[1]}")\n',
    frag: "an interpolation hole is",
    line: 1,
    col: 12,
    endCol: 15,
    underlines: "[1]",
  },
  {
    // The same hole under a preamble. Before D1652 this reported 2:3 — a column inside the
    // COMMENT block, three lines above any code, which is what a wrong module's token gives.
    name: "merged: a hole under a preamble stays on the hole's own line",
    src:
      "// c0\n// c1\n// c2\ntype P = { x: i32 }\nconst p: P = { x: 1 }\nprint(\"v=\\{p}\")\n",
    frag: "an interpolation hole is",
    line: 6,
    col: 12,
    endCol: 13,
    underlines: "p",
  },
  {
    // A hole on the literal's SECOND line: `two \{p} three` puts `p` at column 7.
    name: "merged: a hole on the literal's second line spans that line's hole",
    src:
      "// c0\n// c1\ntype P = { x: i32 }\nconst p: P = { x: 1 }\nprint(\"one\ntwo \\{p} three\")\n",
    frag: "an interpolation hole is",
    line: 6,
    col: 7,
    endCol: 8,
    underlines: "p",
  },
  {
    // The family is the MERGE, not the literal: an ordinary `import` is enough. `xs[0]` at
    // 19, its `]` at 23 — the anchor the raise fell back to when the search found nothing.
    name: "merged: an imported module's file spans its own node",
    src:
      'import { reverse } from "std:array"\nconst xs = reverse([1, 2])\nconst s: string = xs[0]\nprint(s)\n',
    frag: "cannot assign",
    line: 3,
    col: 19,
    endCol: 24,
    underlines: "xs[0]",
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
    // THE ONE RAISE EXEMPT FROM THE NODE-SPAN RULE, and `cascade` below is why: this is
    // a whole-body VERDICT, usually a consequence of an error inside that body, and the
    // report is position-ordered — at the function's name it would print above its own
    // cause. Anchored at the body's closing `}` on line 3, column 1.
    name: "inferred return: the whole-body verdict anchors at the body's end",
    src: "function g(x: i32) {\n  return g(x)\n}\nprint(1)\n",
    frag: "cannot infer a return type for 'g'",
    line: 3,
    col: 1,
    endCol: 2,
    underlines: "}",
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
    frag: "for-in expects an array, a map or a string",
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
  // A CONSEQUENCE IS NOT REPORTED ABOVE ITS CAUSE. `a & b` fails, so the inferred
  // return has no basis — and both are reported. The report is position-ordered, so the
  // row above is what keeps the verdict below the operator error that caused it: a span
  // change must not reorder a file's diagnostics, and `first` is that pin.
  {
    // `  return a & b` — the `&` expression at 10..14.
    name: "cascade: the body's error leads its own inferred-return verdict",
    src: "function g(a: i32[], b: i32[]) {\n  return a & b\n}\nprint(1)\n",
    frag: "operator '&' is not defined",
    line: 2,
    col: 10,
    endCol: 15,
    underlines: "a & b",
    first: true,
  },
  // ── the three findings raised on the CHECKER side with `stage: "type"` ────
  // Not on `T.diags` at all — each is its own side table that `cli.vl` turns into a
  // diagnostic, and all three hard-coded `endCol = col + 1` there.
  {
    // `const n: i32 = 1` — the `:` at 8, the `=` at 14. The span is the range `--fix`
    // deletes, so it carries the space before the `=`.
    name: "redundant-type: the hint spans the annotation the fix removes",
    src: "const n: i32 = 1\nprint(n)\n",
    frag: "redundant type annotation: `n`",
    sev: "hint",
    line: 1,
    col: 8,
    endCol: 14,
    underlines: ": i32 ",
  },
  {
    // `const d = n ?? 99` — the `??` node runs from `n` at 11 to the second `9` at 17.
    name: "dead-coalesce-default: the warning spans the whole `??`",
    src: "const n: i32 = 1\nconst d = n ?? 99\nprint(n + d)\n",
    frag: "this `??` default is never used",
    sev: "warning",
    line: 2,
    col: 11,
    endCol: 18,
    underlines: "n ?? 99",
  },
  {
    // `const isErr = v is "err"` — the `is` node runs from `v` at 15 to the closing
    // quote at 24.
    name: "collapsed-arm-value-test: the hint spans the whole `is`",
    src: 'function pick(): string | "err" {\n  return "err"\n}\n' +
      'const v = pick()\nconst isErr = v is "err"\nprint(isErr)\n',
    frag: "is a value test",
    sev: "hint",
    line: 5,
    col: 15,
    endCol: 25,
    underlines: 'v is "err"',
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

// A MERGED PROGRAM'S ANCHOR IS RESOLVED INSIDE ITS OWN MODULE, and no single two-module
// program can prove it. `tokIndexAt` binary-searches `P.toks` for a byte offset, a merge
// appends each module's tokens carrying that module's own offsets, and whether the search
// still lands on the right token is a coincidence of the shape ahead of it — a one-line
// dependency answers correctly, a fifteen-line one does not. So the SWEEP is the control:
// over every dependency size, `for i in 0 to -1` must anchor at the `to` keyword, which
// `forToKwTok` recovers from the bound's own start token (D1652, D1588).
const TO_ANCHOR_DEPS = 16;

Deno.test({
  name: "diagnostic spans: the `to` anchor survives a merge at every dependency size",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_to_anchor_" });
    try {
      const bad: string[] = [];
      // `for i in 0 to -1 {` — `to` is the 12th column, and the line is the 3rd.
      const entry = 'import { d0 } from "./dep"\n\nfor i in 0 to -1 {\n  print(d0(i))\n}\n';
      for (let n = 1; n <= TO_ANCHOR_DEPS; n++) {
        let dep = "";
        for (let i = 0; i < n; i++) {
          dep += `export function d${i}(a: i32): i32 { a + ${i + 1} }\n`;
        }
        await Deno.writeTextFile(`${dir}/dep.vl`, dep);
        await Deno.writeTextFile(`${dir}/entry.vl`, entry);
        const diags = await jsonDiags(`${dir}/entry.vl`);
        const d = diags.find((x) => x.message.includes("this range never runs"));
        if (!d) {
          bad.push(`dep=${n}: no range diagnostic — got ${diags.length}`);
          continue;
        }
        if (d.line !== 3 || d.col !== 12 || d.endCol !== 14) {
          bad.push(
            `dep=${n}: want 3:[12, 14) (the \`to\`), got ${d.line}:[${d.col}, ${d.endCol})`,
          );
        }
      }
      if (bad.length) {
        throw new Error(
          `${bad.length} of ${TO_ANCHOR_DEPS} dependency sizes mis-anchored:\n  ${
            bad.join("\n  ")
          }`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

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
        const want = row.sev ?? "error";
        const d = diags.find((x) =>
          x.severity === want && x.message.includes(row.frag)
        );
        if (!d) {
          bad.push(
            `${row.name}: no ${want} containing "${row.frag}" — got ${
              diags.map((x) => `${x.severity} ${x.message}`).join("; ") || "none"
            }`,
          );
          continue;
        }
        // `endLine` is present ONLY on a span that ends on a later line, so a row
        // declaring none requires the field to be absent -- that absence is what keeps a
        // single-line diagnostic's JSON byte-identical to what it was before it existed.
        if (
          d.line !== row.line || d.col !== row.col ||
          d.endCol !== row.endCol || d.endLine !== row.endLine
        ) {
          const got = d.endLine === undefined
            ? `${d.line}`
            : `${d.line}-${d.endLine}`;
          const want = row.endLine === undefined
            ? `${row.line}`
            : `${row.line}-${row.endLine}`;
          bad.push(
            `${row.name}: want ${want}:[${row.col}, ${row.endCol}), got ` +
              `${got}:[${d.col}, ${d.endCol})`,
          );
          continue;
        }
        // The numbers and the text must agree: a wrong column that still parses
        // as a plausible span is caught here and nowhere else.
        if (row.first) {
          const errs = diags.filter((x) => x.severity === "error");
          if (errs.length === 0 || !errs[0].message.includes(row.frag)) {
            bad.push(
              `${row.name}: "${row.frag}" must be the FIRST error, got ` +
                `"${errs.length ? errs[0].message.slice(0, 48) : "(none)"}"`,
            );
            continue;
          }
        }
        const under = spanText(row);
        if (under !== row.underlines) {
          bad.push(
            `${row.name}: the span cuts ${JSON.stringify(under)} out of the ` +
              `source, but the row declares ${JSON.stringify(row.underlines)}`,
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
