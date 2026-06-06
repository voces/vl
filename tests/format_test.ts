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
  // One argument per continuation line, indented two spaces, no trailing comma
  // (VL call lists reject one), and the close paren back at column 0.
  assert(
    out.includes("\n  argumentNumberOneHere,"),
    `unexpected wrap layout:\n${out}`,
  );
  assert(!/,\n\)/.test(out), "emitted a trailing comma before the close paren");
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
