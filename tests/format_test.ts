// Tests for the AST-driven formatter (compiler/format.ts, roadmap D4).
//
// The formatter parses source to the typed AST and regenerates canonical source
// from it. These tests assert its three core guarantees over the whole corpus
// (tests/cases/**/*.vl + samples/), plus targeted reflow behavior:
//
//   1. Idempotent:        format(format(s)) === format(s).
//   2. Round-trip (AST):  the AST of format(s) is structurally equivalent to the
//                         AST of s (the shape the printer reads — spans and the
//                         typechecker's resolved type decorations excluded).
//   3. Comment-preserving: every comment text survives in format(s).
//
// Files with intentional SYNTAX errors (the parser can't build a faithful AST
// for them) are excluded from the round-trip/idempotency corpus — a formatter
// only promises fidelity for parseable input; it must still not throw on them.
//
// Run with:  deno test -A --no-check tests/format_test.ts

import { checkOnly } from "../compiler/compile.ts";
import { format } from "../compiler/format.ts";

// Hand-rolled asserts (repo convention — no std import map; see symbols_test.ts).
const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

// --- AST normalization for structural equivalence --------------------------

// The typechecker fully resolves every type it records (a tiny `i32` annotation
// becomes a giant structural Object; a `type` alias body is discarded). Those
// decorations are not what the printer reads, so strip them — along with the
// scope table — and compare only the structural shape the printer reproduces.
const DROP_KEYS = new Set([
  "scope",
  "variableType",
  "functionType",
  "valueType",
  "paramaterType",
  "returnType",
  "checkType",
]);

// deno-lint-ignore no-explicit-any
const normalize = (node: any): any => {
  if (Array.isArray(node)) return node.map(normalize);
  if (node && typeof node === "object") {
    // deno-lint-ignore no-explicit-any
    const out: any = {};
    for (const key of Object.keys(node)) {
      if (DROP_KEYS.has(key)) continue;
      out[key] = normalize(node[key]);
    }
    return out;
  }
  return node;
};

const astShape = (source: string): string => {
  const { ast } = checkOnly(source);
  return JSON.stringify(normalize(ast.statements));
};

// A *structural* syntax error — a malformed token stream the parser couldn't
// shape into an AST. NOT the semantic `Syntax error: undeclared <name>` /
// `redeclared` messages (those also start with "Syntax error:" but mean the AST
// was built fine and a name simply didn't resolve), which are irrelevant to
// whether the formatted text is well-formed.
const SEMANTIC_PREFIXES = ["undeclared", "redeclared", "invalid assignment"];
const hasSyntaxError = (source: string): boolean =>
  checkOnly(source).diagnostics.some((d) => {
    if (d.severity !== "error") return false;
    const m = d.message.replace(/^Syntax error:\s*/, "");
    if (!d.message.startsWith("Syntax error:")) return false;
    return !SEMANTIC_PREFIXES.some((p) => m.startsWith(p));
  });

// --- corpus walk -----------------------------------------------------------

const CORPUS_DIRS = [
  new URL("./cases/", import.meta.url),
  new URL("../samples/", import.meta.url),
];

const walk = async function* (dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walk(child);
    else if (entry.name.endsWith(".vl")) yield child;
  }
};

const corpusFiles = async (): Promise<URL[]> => {
  const files: URL[] = [];
  for (const dir of CORPUS_DIRS) {
    for await (const f of walk(dir)) files.push(f);
  }
  files.sort((a, b) => a.href.localeCompare(b.href));
  return files;
};

// One Deno.test per file keeps failures pinpointed to the offending source.
const files = await corpusFiles();
for (const file of files) {
  const m = file.href.match(/\/(cases|samples)\/.*$/);
  const name = "corpus: " + (m ? m[0].slice(1) : file.href);
  const src = await Deno.readTextFile(file);

  Deno.test(name, () => {
    // A syntax-erroring file must not crash the formatter, but is exempt from
    // the fidelity guarantees (no faithful AST exists for it).
    if (hasSyntaxError(src)) {
      format(src); // must not throw
      return;
    }

    const once = format(src);
    const twice = format(once);

    // 1. Idempotent.
    assertEquals(twice, once, `${name}: not idempotent`);

    // 2. Round-trip: the formatted output parses without NEW syntax errors and
    //    yields a structurally-equivalent AST.
    assert(
      !hasSyntaxError(once),
      `${name}: formatted output introduced a syntax error`,
    );
    assertEquals(
      astShape(once),
      astShape(src),
      `${name}: formatted AST differs structurally from the original`,
    );

    // 3. Every comment text survives somewhere in the output.
    const { comments } = checkOnly(src);
    for (const c of comments) {
      assert(
        once.includes(c.text),
        `${name}: lost comment ${JSON.stringify(c.text)}`,
      );
    }
  });
}

// --- targeted behavioral tests ---------------------------------------------

Deno.test("preserves a compound assignment operator (`+=`, not `a = a + b`)", () => {
  assertEquals(format("a += 2\n"), "a += 2\n");
  assertEquals(format("a *= b\n"), "a *= b\n");
});

Deno.test("does not synthesize a type annotation on an inferred `let`", () => {
  // `let x = 1` is inferred — the printer must NOT add `: i32`.
  assertEquals(format("let x = 1\n"), "let x = 1\n");
  // An explicit annotation is preserved verbatim.
  assertEquals(format("let x: i32 = 1\n"), "let x: i32 = 1\n");
});

Deno.test("preserves `let` vs `const`", () => {
  assertEquals(format("let x = 1\n"), "let x = 1\n");
  assertEquals(format("const x = 1\n"), "const x = 1\n");
});

Deno.test("preserves doc vs line comments", () => {
  const src = "/// doc comment\nlet x = 1\n// line comment\nlet y = 2\n";
  const out = format(src);
  assert(out.includes("/// doc comment"), "doc comment lost");
  assert(out.includes("// line comment"), "line comment lost");
});

Deno.test("places an own-line comment above and a trailing comment after", () => {
  const src = "// above\nlet x = 1 // trailing\n";
  const out = format(src);
  const lines = out.trimEnd().split("\n");
  assertEquals(lines[0], "// above");
  assertEquals(lines[1], "let x = 1 // trailing");
});

Deno.test("a short call stays on one line", () => {
  assertEquals(format("print(a, b, c)\n"), "print(a, b, c)\n");
});

Deno.test("a long call-argument list wraps onto continuation lines", () => {
  const src =
    "foo(argumentNumberOneHere, argumentNumberTwoHere, argumentNumberThreeHere, argFour)\n";
  assert(src.trimEnd().length > 80, "test input must exceed the 80-col target");
  const out = format(src);
  assert(out.includes("\n"), "long call did not wrap");
  // One argument per continuation line, indented two spaces, a trailing comma
  // after the last argument, and the close paren back at column 0.
  assert(
    out.includes("\n  argumentNumberOneHere,"),
    `unexpected wrap layout:\n${out}`,
  );
  assert(
    /argFour,\n\)/.test(out),
    `wrapped call must carry a trailing comma:\n${out}`,
  );
  // The wrapped form must still parse (only a semantic `undeclared`, no syntax).
  assert(!hasSyntaxError(out), `wrapped call does not re-parse:\n${out}`);
  // And it must be idempotent.
  assertEquals(format(out), out, "wrapped call is not idempotent");
});

Deno.test("a long boolean chain breaks with the operator at line end", () => {
  const src =
    "let r = conditionAlphaValueHere && conditionBetaValueHere && conditionGammaValue && cD\n";
  assert(src.trimEnd().length > 80, "test input must exceed the 80-col target");
  const out = format(src);
  assert(out.includes("&&\n"), `chain did not break at the operator:\n${out}`);
  assert(!hasSyntaxError(out), `wrapped chain does not re-parse:\n${out}`);
  assertEquals(format(out), out, "wrapped chain is not idempotent");
});

Deno.test("a long array literal wraps and collapses back when short", () => {
  // Short array stays on one line.
  assertEquals(format("let a = [1, 2, 3]\n"), "let a = [1, 2, 3]\n");
  const long =
    "let a = [elementOneHere, elementTwoHere, elementThreeHere, elementFourHere, fifth]\n";
  assert(long.trimEnd().length > 80, "test input must exceed the 80-col target");
  const out = format(long);
  assert(out.includes("\n  elementOneHere,"), `long array did not wrap:\n${out}`);
  assert(/fifth,\n\]/.test(out), `wrapped array must carry a trailing comma:\n${out}`);
  assert(!hasSyntaxError(out), "wrapped array does not re-parse");
});

Deno.test("preserves an `is` / `!is` check type from source", () => {
  const src = 'let x: i32 | string = 1\nlet b = x is i32\nlet c = x !is i32\n';
  const out = format(src);
  assert(out.includes("x is i32"), `\`is\` lost:\n${out}`);
  assert(out.includes("x !is i32"), `\`!is\` lost:\n${out}`);
});

Deno.test("parenthesizes a composite receiver of a member access", () => {
  // `(a + b).c`-style grouping must survive (the postfix binds to the sum).
  const src = 'let s = "ab"\nlet n = (s.slice(0, 1) + "c").length\n';
  const out = format(src);
  assert(out.includes('("c").length') || /\)\.length/.test(out), `grouping lost:\n${out}`);
  assertEquals(astShape(out), astShape(src), "grouping changed the AST");
});

Deno.test("a `type` alias declaration is preserved verbatim", () => {
  const src = "type Pair = { a: i32, b: string }\nlet p: Pair = { a: 1, b: \"x\" }\n";
  const out = format(src);
  assert(out.includes("type Pair = { a: i32, b: string }"), `alias lost:\n${out}`);
  assertEquals(format(out), out, "type alias formatting is not idempotent");
});

Deno.test("a trailing comment on a `type` alias stays on the same line (D4)", () => {
  // A trailing comment on a `type` alias must remain on the alias line — NOT
  // displaced onto its own line before the following statement.
  const src = "type Point = { x: i32, y: i32 } // a struct-like type\nlet p: Point = { x: 1, y: 2 }\n";
  const out = format(src);
  // The comment stays on the `type` line.
  assert(
    out.includes("type Point = { x: i32, y: i32 } // a struct-like type"),
    `trailing comment on type alias was relocated:\n${out}`,
  );
  // The following statement is still on its own line (comment not merged with it).
  assert(out.includes("\nlet p: Point"), `let statement lost:\n${out}`);
  // Multiple type aliases: each alias's trailing comment stays with that alias.
  const src2 = "type A = { x: i32 } // type A\ntype B = { y: i32 }\nlet a: A = { x: 1 }\nlet b: B = { y: 2 }\n";
  const out2 = format(src2);
  const aLine = out2.split("\n").find((l) => l.startsWith("type A"));
  const bLine = out2.split("\n").find((l) => l.startsWith("type B"));
  assert((aLine?.includes("// type A")) ?? false, `type A trailing comment lost:\n${out2}`);
  assert(!bLine?.includes("// type A"), `type A comment leaked onto type B:\n${out2}`);
  // Idempotent: format(format(s)) === format(s).
  assertEquals(format(out), out, "type alias with trailing comment not idempotent");
  assertEquals(format(out2), out2, "multiple type aliases not idempotent");
});

// --- trailing commas in multi-line reflow ----------------------------------

Deno.test("a wrapped call emits a trailing comma; collapsed does not", () => {
  // Collapsed (fits): no trailing comma.
  assertEquals(format("foo(a, b, c)\n"), "foo(a, b, c)\n");
  // Wrapped (exceeds 80 cols): trailing comma after the last argument.
  const long =
    "foo(argumentNumberOneHere, argumentNumberTwoHere, argumentNumberThreeHere, argFour)\n";
  const out = format(long);
  assert(out.includes("\n  argFour,\n)"), `no trailing comma in wrapped call:\n${out}`);
  assert(!hasSyntaxError(out), `wrapped call does not re-parse:\n${out}`);
  assertEquals(format(out), out, "wrapped call is not idempotent");
});

Deno.test("a wrapped array literal emits a trailing comma; collapsed does not", () => {
  assertEquals(format("let a = [1, 2, 3]\n"), "let a = [1, 2, 3]\n");
  const long =
    "let a = [elementOneHere, elementTwoHere, elementThreeHere, elementFourHere, fifth]\n";
  const out = format(long);
  assert(out.includes("\n  fifth,\n]"), `no trailing comma in wrapped array:\n${out}`);
  assert(!hasSyntaxError(out), `wrapped array does not re-parse:\n${out}`);
  assertEquals(format(out), out, "wrapped array is not idempotent");
});

Deno.test("a wrapped object literal emits a trailing comma; collapsed does not", () => {
  assertEquals(format("let o = { a: 1, b: 2 }\n"), "let o = { a: 1, b: 2 }\n");
  const long =
    "let o = { firstKeyHere: 111111, secondKeyHere: 222222, thirdKeyHere: 333333, fk: 4 }\n";
  const out = format(long);
  assert(out.includes("\n  fk: 4,\n}"), `no trailing comma in wrapped object:\n${out}`);
  assert(!hasSyntaxError(out), `wrapped object does not re-parse:\n${out}`);
  assertEquals(format(out), out, "wrapped object is not idempotent");
});

Deno.test("a wrapped parameter list emits a trailing comma; collapsed does not", () => {
  assertEquals(
    format("function f(a: i32, b: i32): i32 {\n  return a\n}\n"),
    "function f(a: i32, b: i32): i32 {\n  return a\n}\n",
  );
  const long =
    "function longFunctionNameHere(paramOneHereXX: i32, paramTwoHereXX: i32, p3: i32): i32 {\n  return 1\n}\n";
  const out = format(long);
  assert(out.includes("\n  p3: i32,\n): i32"), `no trailing comma in wrapped params:\n${out}`);
  assert(!hasSyntaxError(out), `wrapped params do not re-parse:\n${out}`);
  assertEquals(format(out), out, "wrapped params are not idempotent");
});

Deno.test("an already-wrapped list with a trailing comma re-formats unchanged", () => {
  // Feeding wrapped trailing-comma source back through the formatter is a no-op
  // (idempotency + round-trip on the new emission), for every list kind.
  const wrapped =
    "foo(\n  argumentNumberOneHere,\n  argumentNumberTwoHere,\n  argumentNumberThreeHere,\n  argFour,\n)\n";
  assertEquals(format(wrapped), wrapped, "wrapped call not stable");
  assertEquals(astShape(format(wrapped)), astShape(wrapped), "wrapped call round-trip");
});

// --- inline-short-ifs (D4) -------------------------------------------------
//
// A plain single `if cond { stmt }` and `if cond { a } else { b }` collapse to
// one line when they fit the 80-col width and each brace body is a single
// simple leaf statement with no overlapping comment. Multi-statement bodies,
// bodies with comments, or anything that exceeds the width keep their
// multi-line block layout. Brace form is preserved (never forced to `then`),
// and `elseif` chains keep their existing `} elseif … {` layout.

// One statement per `if` body lives inside a function so the body is parseable
// (`r` is declared); a semantic `undeclared` would still be fine.
const wrapFn = (body: string): string =>
  `function f() {\n  let r = 0\n${body}}\n`;

Deno.test("a short single `if cond { stmt }` collapses to one line", () => {
  const src = wrapFn("  if r > 0 {\n    r = 1\n  }\n");
  const out = format(src);
  // The whole `if` is on one line.
  assert(
    out.includes("  if r > 0 { r = 1 }\n"),
    `single if did not collapse:\n${out}`,
  );
  // Brace form preserved — never converted to `then`.
  assert(!out.includes("then"), `collapse forced a \`then\`:\n${out}`);
  assert(!hasSyntaxError(out), `collapsed if does not re-parse:\n${out}`);
  assertEquals(format(out), out, "collapsed single if is not idempotent");
  assertEquals(astShape(out), astShape(src), "collapse changed the AST");
});

Deno.test("a short `if cond { a } else { b }` collapses to one line", () => {
  const src = wrapFn("  if r > 0 {\n    r = 1\n  } else {\n    r = 2\n  }\n");
  const out = format(src);
  assert(
    out.includes("  if r > 0 { r = 1 } else { r = 2 }\n"),
    `if/else did not collapse:\n${out}`,
  );
  assert(!hasSyntaxError(out), `collapsed if/else does not re-parse:\n${out}`);
  assertEquals(format(out), out, "collapsed if/else is not idempotent");
  assertEquals(astShape(out), astShape(src), "collapse changed the AST");
});

Deno.test("an `if` with a two-statement body stays multi-line", () => {
  const src = wrapFn("  if r > 0 {\n    r = 1\n    r = 2\n  }\n");
  const out = format(src);
  // Stays broken across lines — the opening brace ends its line.
  assert(out.includes("  if r > 0 {\n"), `two-statement if collapsed:\n${out}`);
  assert(!/if r > 0 \{ /.test(out), `two-statement if inlined a body:\n${out}`);
  assert(!hasSyntaxError(out), `multi-line if does not re-parse:\n${out}`);
  assertEquals(format(out), out, "multi-line if is not idempotent");
});

Deno.test("an `if` with an interior comment stays multi-line, comment in place", () => {
  const src = wrapFn("  if r > 0 {\n    // keep me here\n    r = 1\n  }\n");
  const out = format(src);
  // Not collapsed: the opening brace still ends its line.
  assert(out.includes("  if r > 0 {\n"), `commented if collapsed:\n${out}`);
  // The comment is NOT relocated onto the `if` line.
  assert(
    !/if r > 0 \{.*keep me here/.test(out),
    `comment moved onto the if line:\n${out}`,
  );
  // The comment survives, on its own line inside the block.
  assert(out.includes("// keep me here"), `comment lost:\n${out}`);
  assert(!hasSyntaxError(out), `commented if does not re-parse:\n${out}`);
  assertEquals(format(out), out, "commented if is not idempotent");
});

Deno.test("a single `if` that exceeds 80 cols stays multi-line block form", () => {
  const body =
    "  if r > 0 {\n    r = rrrrrrrrrrrrrrr + rrrrrrrrrrrrrrr + rrrrrrrrrrrrrrr + rrrrrrrrrrr\n  }\n";
  const src = `function f() {\n  let rrrrrrrrrrrrrrr = 0\n  let r = 0\n${body}}\n`;
  const out = format(src);
  // Did not collapse onto one `if … { … }` line.
  assert(!/if r > 0 \{ r = /.test(out), `over-width if collapsed:\n${out}`);
  assert(out.includes("  if r > 0 {\n"), `over-width if not block form:\n${out}`);
  assert(!hasSyntaxError(out), `over-width if does not re-parse:\n${out}`);
  assertEquals(format(out), out, "over-width if is not idempotent");
});

Deno.test("an `elseif` chain keeps its `} elseif … {` block layout", () => {
  const src = wrapFn(
    "  if r > 0 {\n    r = 1\n  } elseif r > 5 {\n    r = 2\n  } else {\n    r = 3\n  }\n",
  );
  const out = format(src);
  // The multi-conditional chain is untouched — not routed through the collapse.
  assert(out.includes("  } elseif r > 5 {\n"), `elseif chain reflowed:\n${out}`);
  assert(out.includes("  } else {\n"), `elseif chain else reflowed:\n${out}`);
  assert(!hasSyntaxError(out), `elseif chain does not re-parse:\n${out}`);
  assertEquals(format(out), out, "elseif chain is not idempotent");
  assertEquals(astShape(out), astShape(src), "elseif chain changed the AST");
});

Deno.test("a bare-`then` if is not converted to brace form", () => {
  const src = wrapFn("  if r > 0 then r = 1\n");
  const out = format(src);
  assert(out.includes("if r > 0 then r = 1"), `bare then form changed:\n${out}`);
  assert(!/if r > 0 \{/.test(out), `bare then forced to braces:\n${out}`);
  assertEquals(format(out), out, "bare then if is not idempotent");
  assertEquals(astShape(out), astShape(src), "bare then changed the AST");
});

// --- function with expression-body that encloses an own-line comment (D4) ---
//
// A function whose body is a single expression (e.g. an object literal)
// can span multiple source lines when it is long or multi-keyed.  When the
// body contains an own-line comment the formatter must not displace it to
// after the closing brace — the verbatim-fallback path already used for
// operator-named functions is extended to cover this case too.

Deno.test("a fn with an expression body enclosing an own-line comment is reproduced verbatim (D4)", () => {
  // The body `{ // comment\n  x: x, y: y }` is an ObjectLiteral, not a Block.
  // An interior own-line comment must NOT be displaced to after the closing brace.
  const src =
    "function makeVec(x: i32, y: i32) {\n" +
    "  // The coordinates\n" +
    "  x: x,\n" +
    "  y: y\n" +
    "}\n";
  const out = format(src);
  // Comment is preserved inside the function, not expelled after it.
  assert(
    out.includes("// The coordinates"),
    `interior comment lost:\n${out}`,
  );
  assert(
    !out.endsWith("// The coordinates\n"),
    `interior comment displaced to after the function:\n${out}`,
  );
  // The formatted output must re-parse without new syntax errors.
  assert(!hasSyntaxError(out), `formatted fn does not re-parse:\n${out}`);
  // Idempotent.
  assertEquals(format(out), out, "fn with commented expression body is not idempotent");
  // AST shape preserved.
  assertEquals(astShape(out), astShape(src), "fn expression-body comment changed the AST");
});
