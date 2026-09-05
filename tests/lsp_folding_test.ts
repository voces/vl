// D9 slot 9 — folding ranges (`lsp/src/folding.ts`) and the static
// language-configuration rules (`lsp/language-configuration.json`).
//
// Both halves of the slot are PURE: folding is a token scan over `vlLex.ts`,
// and the language configuration is JSON the editor reads directly. Neither
// touches the compiler seed, so this file runs in the `ci` job under
// `deno task test` and needs no `ci-native` wiring (`ci_seed_coverage_test.ts`
// classifies a test as seed-backed only if it names `vl-compiler.wasm` AND
// gates on its presence; this one does neither).
//
// The language-configuration half is here rather than in a file of its own
// because the two ship one user-visible behaviour between them — where a block
// begins and ends — and a change to one that contradicts the other (say, an
// indent rule that treats `// {` as an opener while folding does not) is
// exactly what a shared test file catches.
//
// Run: deno test -A --no-check tests/lsp_folding_test.ts

import { ROOT } from "./support/tree.ts";

import {
  type FoldableExtent,
  foldingRanges,
  type VlFoldingRange,
} from "../lsp/src/folding.ts";

const eq = (got: unknown, want: unknown, what: string): void => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

/** `[startLine, endLine, kind?]` per range — the shape the assertions read. */
const compact = (
  ranges: readonly VlFoldingRange[],
): (number | string)[][] =>
  ranges.map((r) =>
    r.kind === undefined
      ? [r.startLine, r.endLine]
      : [r.startLine, r.endLine, r.kind]
  );

const folds = (src: string): (number | string)[][] =>
  compact(foldingRanges(src));

/** The same, with the seed's declaration/block extents supplied. */
const foldsWith = (
  src: string,
  extents: readonly FoldableExtent[],
): (number | string)[][] => compact(foldingRanges(src, extents));

/** `[headerLine, closingBraceLine]` — the two lines an extent contributes. */
const ext = (headerLine: number, endLine: number): FoldableExtent => ({
  headerLine,
  endLine,
});

// ---- bracketed blocks --------------------------------------------------------

Deno.test("folding: a block ends one line ABOVE its closer, so the `}` stays visible", () => {
  const src = [
    "export function main() {",
    "  log(1)",
    "  log(2)",
    "}",
  ].join("\n");
  eq(folds(src), [[0, 2]], "one block, closer visible");
});

Deno.test("folding: nested blocks produce nested ranges, outermost first", () => {
  const src = [
    "function outer() {", // 0
    "  if x {", //           1
    "    inner()", //        2
    "  }", //                3
    "  after()", //          4
    "}", //                  5
  ].join("\n");
  eq(folds(src), [[0, 4], [1, 2]], "outer then inner");
});

Deno.test("folding: a one-line block is not foldable", () => {
  eq(folds("function id(x: i32): i32 { return x }"), [], "nothing to fold");
  eq(folds("if x {\n  y() }"), [], "closer on the body's own line");
});

Deno.test("folding: multi-line paren and bracket groups fold too", () => {
  const src = [
    "const xs = [", //  0
    "  1,", //          1
    "  2,", //          2
    "]", //             3
    "log(", //          4
    "  xs,", //         5
    ")", //             6
  ].join("\n");
  eq(folds(src), [[0, 2], [4, 5]], "array literal and call");
});

Deno.test("folding: a `(` and `{` opened on one line and closed on another are ONE range", () => {
  const src = [
    "run({", //    0
    "  a: 1,", //  1
    "})", //       2
  ].join("\n");
  // Both brackets span lines 0..2, so both produce (0, 1) — deduplicated.
  eq(folds(src), [[0, 1]], "one chevron, not two");
});

// ---- what is NOT structure ---------------------------------------------------

Deno.test("folding: a brace inside a string opens no region", () => {
  const src = [
    'const open = "{"', //   0
    'const close = "}"', //  1
    'const both = "{ }"', // 2
    "log(open)", //          3
  ].join("\n");
  eq(folds(src), [], "string content is text, not structure");
});

Deno.test("folding: a brace inside a string does not swallow a real block", () => {
  const src = [
    'function f() { // the "{" below is text',
    '  const s = "{"',
    "  log(s)",
    "}",
  ].join("\n");
  eq(folds(src), [[0, 2]], "the real block still folds");
});

Deno.test("folding: a template literal's braces and holes open no region", () => {
  // A template is scanned WHOLE by `vlLex` — text parts, `${…}` holes, nested
  // strings and nested templates included — so nothing inside one is structure.
  // A hole's braces are balanced by construction; a fold region over them would
  // be a region the author cannot see the ends of.
  const src = [
    "const a = `{`", //                      0
    "const b = `${ {x: 1}.x }`", //          1
    'const c = `${ "a ` b" }`', //           2
    "log(a)", //                             3
  ].join("\n");
  eq(folds(src), [], "template content is text, not structure");
});

Deno.test("folding: a multi-line template does not swallow the block around it", () => {
  const src = [
    "function f() {", //   0
    "  const s = `line", // 1
    "  } still text`", //   2
    "  log(s)", //          3
    "}", //                 4
  ].join("\n");
  eq(folds(src), [[0, 3]], "the `}` inside the template closes nothing");
});

Deno.test("folding: a closer inside a comment closes nothing", () => {
  const src = [
    "function f() {", //  0
    "  // } not a closer", // 1
    "  log(1)", //        2
    "}", //               3
  ].join("\n");
  // The comment is a single own-line comment (no run), and its `}` is text.
  eq(folds(src), [[0, 2]], "the block ends at the real `}`");
});

Deno.test("folding: an opener inside a comment opens nothing", () => {
  const src = [
    "// function f() {", // 0
    "log(1)", //            1
    "log(2)", //            2
  ].join("\n");
  eq(folds(src), [], "a commented-out opener is not an opener");
});

// ---- comment runs ------------------------------------------------------------

Deno.test("folding: a run of own-line comments folds with kind `comment`", () => {
  const src = [
    "// one", //  0
    "// two", //  1
    "// three", //2
    "log(1)", //  3
  ].join("\n");
  eq(folds(src), [[0, 2, "comment"]], "the whole run");
});

Deno.test("folding: a single comment line is not a run", () => {
  eq(folds("// lonely\nlog(1)"), [], "one line has nothing to collapse");
});

Deno.test("folding: a trailing comment breaks a run, and so does a blank line", () => {
  const src = [
    "// one", //             0
    "// two", //             1
    "let x = 1 // three", // 2
    "// four", //            3
    "", //                   4
    "// five", //            5
    "// six", //             6
  ].join("\n");
  eq(
    folds(src),
    [[0, 1, "comment"], [5, 6, "comment"]],
    "two runs; the trailing comment joins neither and `// four` is alone",
  );
});

Deno.test("folding: `///` doc comments are the same token, so they run too", () => {
  const src = [
    "/// The answer.", //           0
    "/// Always the same one.", //  1
    "export function answer(): i32 { return 42 }", // 2
  ].join("\n");
  eq(folds(src), [[0, 1, "comment"]], "a doc-comment block folds");
});

// ---- the import block --------------------------------------------------------

Deno.test("folding: the leading import block folds with kind `imports`", () => {
  const src = [
    'import { a } from "./a"', // 0
    'import { b } from "./b"', // 1
    "", //                        2
    "export function main() {", //3
    "  a()", //                   4
    "  b()", //                   5
    "}", //                       6
  ].join("\n");
  eq(folds(src), [[0, 1, "imports"], [3, 5]], "imports, then the function");
});

Deno.test("folding: a single import is not a foldable block", () => {
  eq(folds('import { a } from "./a"\na()'), [], "nothing to collapse");
});

Deno.test("folding: a multi-line import statement is spanned to its path literal", () => {
  const src = [
    "import {", //     0
    "  a,", //         1
    "  b,", //         2
    '} from "./x"', // 3
    "a()", //          4
  ].join("\n");
  eq(
    folds(src),
    [[0, 3, "imports"], [0, 2]],
    "the statement's full extent, plus its brace group",
  );
});

Deno.test("folding: comments between imports stay inside the block", () => {
  const src = [
    'import { a } from "./a"', // 0
    "// b is the slow one", //    1
    'import { b } from "./b"', // 2
    "a()", //                     3
  ].join("\n");
  eq(folds(src), [[0, 2, "imports"]], "the run spans the comment");
});

Deno.test("folding: an import below other code is not the LEADING block", () => {
  const src = [
    "a()", //                     0
    'import { b } from "./b"', // 1
    'import { c } from "./c"', // 2
  ].join("\n");
  eq(folds(src), [], "only a file's own header folds");
});

Deno.test("folding: a leading comment block does not disqualify the import block", () => {
  const src = [
    "// Header.", //              0
    "// Two lines of it.", //     1
    'import { a } from "./a"', // 2
    'import { b } from "./b"', // 3
  ].join("\n");
  eq(
    folds(src),
    [[0, 1, "comment"], [2, 3, "imports"]],
    "both the header and the imports",
  );
});

// ---- mid-edit buffers --------------------------------------------------------

Deno.test("folding: an unclosed opener yields no range, and the rest still folds", () => {
  const src = [
    "export function outer() {", // 0  never closed
    "  if x {", //                  1
    "    a()", //                   2
    "  }", //                       3
    "  const s = ", //              4  half-typed
  ].join("\n");
  eq(folds(src), [[1, 2]], "the provable region only — no fold to EOF");
});

Deno.test("folding: an unmatched closer is ignored", () => {
  const src = [
    "}", //               0
    "function f() {", //  1
    "  a()", //           2
    "}", //               3
  ].join("\n");
  eq(folds(src), [[1, 2]], "the stray closer closes nothing");
});

Deno.test("folding: a mismatched closer closes the opener below it", () => {
  const src = [
    "foo(", //     0
    "  bar {", //  1
    ")", //        2
    "baz()", //    3
  ].join("\n");
  eq(folds(src), [[0, 1]], "the `(` closes; the unclosed `{` is discarded");
});

Deno.test("folding: an unterminated string does not derail the scan", () => {
  const src = [
    'const s = "oops', // 0
    "function f() {", //  1
    "  a()", //           2
    "}", //               3
  ].join("\n");
  eq(folds(src), [[1, 2]], "the block after the bad literal still folds");
});

Deno.test("folding: an empty document has no ranges", () => {
  eq(folds(""), [], "empty");
  eq(folds("\n\n\n"), [], "blank lines only");
});

// ---- line endings ------------------------------------------------------------

Deno.test("folding: a CRLF document folds identically to its LF twin", () => {
  const lf = [
    "// header", //               0
    "// two lines", //            1
    'import { a } from "./a"', // 2
    'import { b } from "./b"', // 3
    "", //                        4
    "export function main() {", //5
    "  if a {", //                6
    "    b()", //                 7
    "  }", //                     8
    "}", //                       9
  ].join("\n");
  const want = [[0, 1, "comment"], [2, 3, "imports"], [5, 8], [6, 7]];
  eq(folds(lf), want, "LF");
  eq(folds(lf.replace(/\n/g, "\r\n")), want, "CRLF must agree with LF");
  eq(folds(lf.replace(/\n/g, "\r\n") + "\r\n"), want, "CRLF with a final break");
});

Deno.test("folding: a CRLF comment token stops before the carriage return", () => {
  // Not observable in the range itself — this pins that `\r` is line-break
  // trivia, so a comment run on CRLF is still detected as own-line.
  const src = "// a\r\n// b\r\nlog(1)\r\n";
  eq(folds(src), [[0, 1, "comment"]], "the run survives CRLF");
});

// ---- declaration and block extents ------------------------------------------
//
// The seed's `declExtentsAt` reduced to two lines per construct. These are the
// merge's own tests and so pass extents as data; the extents a real compiler
// produces are graded seed-backed, in `lsp_document_symbols_wasm_test.ts`.

Deno.test("folding(extents): a region starts at the HEADER line, not at the brace", () => {
  const src = [
    "function outer(", //  0
    "  x: i32,", //        1
    "): i32 {", //         2
    "  body()", //         3
    "}", //                4
  ].join("\n");
  // Lexically the body opens on line 2 and the parameter list on line 0.
  eq(folds(src), [[0, 1], [2, 3]], "no extents: the brace lines");
  eq(
    foldsWith(src, [ext(0, 4)]),
    [[0, 3], [2, 3]],
    "the function folds from its name line",
  );
});

Deno.test("folding(extents): an extent evicts the bracket region sharing its start", () => {
  // VS Code keeps ONE region per start line, so a parameter-list region starting
  // on the header line would swallow the whole function's.
  const src = [
    "function outer(", //  0
    "  x: i32,", //        1
    ") {", //              2
    "  body()", //         3
    "}", //                4
  ].join("\n");
  const got = foldsWith(src, [ext(0, 4)]);
  if (got.some((r) => r[0] === 0 && r[1] === 1)) {
    throw new Error(`the parameter region must not survive: ${JSON.stringify(got)}`);
  }
});

Deno.test("folding(extents): a one-line construct folds nothing", () => {
  const src = "function id(x: i32): i32 { x }";
  eq(foldsWith(src, [ext(0, 0)]), [], "header and closer on one line");
  // A two-line construct is a one-line body once its closer stays visible.
  eq(foldsWith("if x {\n}", [ext(0, 1)]), [], "nothing between header and closer");
});

Deno.test("folding(extents): nested if / for blocks nest, outermost first", () => {
  const src = [
    "function f() {", //   0
    "  if x {", //         1
    "    for i in 0 to 2 {", // 2
    "      g(i)", //       3
    "    }", //            4
    "  }", //              5
    "}", //                6
  ].join("\n");
  eq(
    foldsWith(src, [ext(0, 6), ext(1, 5), ext(2, 4)]),
    [[0, 5], [1, 4], [2, 3]],
    "three nested regions",
  );
});

Deno.test("folding(extents): a match and its braced arm each fold", () => {
  const src = [
    "function f(n: i32) {", // 0
    "  match n {", //          1
    "    0 => {", //           2
    "      g()", //            3
    "    }", //                4
    "    _ => h()", //         5
    "  }", //                  6
    "}", //                    7
  ].join("\n");
  eq(
    foldsWith(src, [ext(0, 7), ext(1, 6), ext(2, 4)]),
    [[0, 6], [1, 5], [2, 3]],
    "function, match, arm",
  );
});

Deno.test("folding(extents): the comment and import kinds are untouched", () => {
  const src = [
    "// one", //                  0
    "// two", //                  1
    'import { a } from "./a"', //  2
    'import { b } from "./b"', //  3
    "", //                        4
    "function f() {", //          5
    "  g()", //                   6
    "}", //                       7
  ].join("\n");
  eq(
    foldsWith(src, [ext(5, 7)]),
    [[0, 1, "comment"], [2, 3, "imports"], [5, 6]],
    "kinds survive the merge",
  );
});

Deno.test("folding(extents): with no extents the lexical answer is unchanged", () => {
  const src = [
    "function f() {", // 0
    "  g()", //          1
    "}", //              2
  ].join("\n");
  eq(foldsWith(src, []), folds(src), "an empty extent list is the no-seed path");
});

// ---- language configuration --------------------------------------------------
//
// The static half of slot 9. VS Code reads these patterns directly; nothing
// else in the repo does, so an unparseable regex or a rule in the wrong order
// would be found only by hand in an editor. The assertions below are the
// editor's own semantics: `indentationRules` are line predicates, and
// `onEnterRules` are tried IN ORDER with the first match winning
// (`OnEnterSupport.onEnter`).

interface EnterAction {
  indent: string;
  appendText?: string;
  removeText?: number;
}
interface OnEnterRule {
  beforeText: string;
  afterText?: string;
  previousLineText?: string;
  action: EnterAction;
}
interface LanguageConfiguration {
  comments: { lineComment?: string; blockComment?: [string, string] };
  brackets: [string, string][];
  autoClosingPairs: { open: string; close: string; notIn?: string[] }[];
  surroundingPairs: { open: string; close: string }[];
  indentationRules: {
    increaseIndentPattern: string;
    decreaseIndentPattern: string;
    indentNextLinePattern?: string;
    unIndentedLinePattern?: string;
  };
  onEnterRules: OnEnterRule[];
}

const config: LanguageConfiguration = JSON.parse(
  Deno.readTextFileSync(`${ROOT}/lsp/language-configuration.json`),
);

Deno.test("language-config: the pairs the extension already shipped are intact", () => {
  eq(config.comments.lineComment, "//", "line comment");
  eq(config.brackets, [["{", "}"], ["[", "]"], ["(", ")"]], "brackets");
  // Six: the three brackets, `"`, `'`, and the backtick a TEMPLATE literal opens.
  eq(config.autoClosingPairs.length, 6, "auto-closing pairs");
  eq(config.surroundingPairs.length, 6, "surrounding pairs");
  for (const p of ["autoClosingPairs", "surroundingPairs"] as const) {
    if (!config[p].some((x) => x.open === "`" && x.close === "`")) {
      throw new Error(`${p} is missing the template-literal backtick pair`);
    }
  }
});

Deno.test("language-config: VL has no block comment, so nothing may describe one", () => {
  if (config.comments.blockComment !== undefined) {
    throw new Error(
      "a blockComment is declared, but VL's lexer has only `//` line comments " +
        "(compiler/lexer.vl) — the pair would auto-close into a syntax error",
    );
  }
  // Behavioural, not a substring scan over the patterns: `\s*` alone contains
  // the characters `*/`, so reading the sources for a delimiter reports every
  // rule here. What matters is that no rule FIRES on block-comment-shaped text
  // (which in VL is a syntax error, not a comment) and that none of them
  // inserts one.
  const blockish = ["/* block */", "/**", " * a JSDoc middle line", " */"];
  for (const line of blockish) {
    const action = config.onEnterRules.find((r) =>
      new RegExp(r.beforeText).test(line)
    );
    if (action !== undefined) {
      throw new Error(
        `onEnter rule ${JSON.stringify(action.beforeText)} fires on ` +
          `${JSON.stringify(line)} — VL has no block comment, so that text is ` +
          `a syntax error the editor must not help write`,
      );
    }
  }
  const inserted = config.onEnterRules
    .map((r) => r.action.appendText ?? "")
    .filter((t) => t.includes("*"));
  if (inserted.length > 0) {
    throw new Error(
      `these rules insert block-comment continuation text: ${
        JSON.stringify(inserted)
      }`,
    );
  }
});

Deno.test("language-config: every pattern compiles as a regex", () => {
  const named: [string, string][] = [
    ["increaseIndentPattern", config.indentationRules.increaseIndentPattern],
    ["decreaseIndentPattern", config.indentationRules.decreaseIndentPattern],
  ];
  config.onEnterRules.forEach((r, i) => {
    named.push([`onEnterRules[${i}].beforeText`, r.beforeText]);
    if (r.afterText !== undefined) {
      named.push([`onEnterRules[${i}].afterText`, r.afterText]);
    }
  });
  for (const [what, pattern] of named) {
    try {
      new RegExp(pattern);
    } catch (err) {
      throw new Error(`${what} is not a valid regex: ${pattern}\n  ${err}`);
    }
  }
});

Deno.test("language-config: increaseIndentPattern fires on an unclosed opener only", () => {
  const re = new RegExp(config.indentationRules.increaseIndentPattern);
  const table: [string, boolean][] = [
    ["export function main() {", true],
    ["  if x {", true],
    ["} else {", true],
    ["const xs = [", true],
    ["log(", true],
    ["function f() { // a trailing note", true],
    ["function id(x: i32): i32 { return x }", false],
    ["log(1)", false],
    ['const open = "{"', false],
    ["// function f() {", false],
    ["let a = 1 // see foo(", false],
    ["", false],
  ];
  for (const [line, want] of table) {
    eq(re.test(line), want, `increaseIndentPattern on ${JSON.stringify(line)}`);
  }
});

Deno.test("language-config: decreaseIndentPattern fires on a leading closer", () => {
  const re = new RegExp(config.indentationRules.decreaseIndentPattern);
  const table: [string, boolean][] = [
    ["}", true],
    ["  }", true],
    ["} else {", true],
    ["})", true],
    ["]", true],
    ["  )", true],
    ["log(1)", false],
    ["const x = a[0]", false],
    ["// }", false],
    ["", false],
  ];
  for (const [line, want] of table) {
    eq(re.test(line), want, `decreaseIndentPattern on ${JSON.stringify(line)}`);
  }
});

/** VS Code's own resolution: the FIRST rule whose `beforeText` matches wins. */
const enterAction = (before: string): EnterAction | undefined =>
  config.onEnterRules.find((r) => new RegExp(r.beforeText).test(before))?.action;

Deno.test("language-config: onEnter continues a comment block and stops on an empty one", () => {
  eq(
    enterAction("// the first line"),
    { indent: "none", appendText: "// " },
    "a `//` comment continues",
  );
  eq(
    enterAction("  // indented too"),
    { indent: "none", appendText: "// " },
    "indentation does not matter",
  );
  eq(enterAction("// "), { indent: "none" }, "an empty `//` line ends the run");
  eq(enterAction("//"), { indent: "none" }, "with or without the space");
  eq(
    enterAction("/// a doc comment"),
    { indent: "none", appendText: "/// " },
    "`///` continues as `///`, not as `//` — the rule order carries this",
  );
  eq(enterAction("/// "), { indent: "none" }, "an empty doc line ends the run");
  eq(
    enterAction("let x = 1 // a trailing note"),
    undefined,
    "a trailing comment is not a comment BLOCK — Enter starts plain code",
  );
  eq(enterAction("log(1)"), undefined, "code gets no rule at all");
});
