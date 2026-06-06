// Track G (reprint readiness): the additive AST/lexer fields that let an
// AST->source printer (the #51 successor) reprint faithfully without guessing.
// Covers three gaps the prior formatter attempt hit:
//   - gap 2: comments are retrievable for placement (kind + own-line/trailing).
//   - gap 3: `a += b` is distinguishable from `a = a + b` (`compoundOperator`).
//   - gap 4: an annotated `let x: T = …` is distinguishable from an inferred
//            `let x = …` (`annotated` boolean).
// Semantics are unchanged — these are extra fields the type/codegen passes
// ignore. Hand-rolled asserts (repo convention; no std import map).

import { checkOnly } from "../compiler/compile.ts";
import type {
  VLBinaryOperationNode,
  VLVariableDeclarationNode,
} from "../compiler/ast.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};
const assertExists = <T>(v: T, msg?: string): void => {
  if (v === null || v === undefined) {
    throw new Error(`${msg ? msg + ": " : ""}expected a value, got ${v}`);
  }
};

// ---- gap 4: annotated vs inferred `let`/`const` --------------------------

Deno.test("an un-annotated `let` is marked not annotated", () => {
  const { ast } = checkOnly("let x = 1\n");
  const decl = ast.statements[0] as VLVariableDeclarationNode;
  assertEquals(decl.type, "VariableDeclaration");
  assertEquals(decl.annotated, false);
  // The inferred type is still present — but `annotated` records that the user
  // did NOT write it, so a printer won't synthesize a `: i32`.
  assertEquals(decl.variableType.type, "Object");
});

Deno.test("an annotated `let` is marked annotated", () => {
  const { ast } = checkOnly("let x: i32 = 1\n");
  const decl = ast.statements[0] as VLVariableDeclarationNode;
  assertEquals(decl.annotated, true);
});

Deno.test("annotated/inferred is distinguishable for identical inferred types", () => {
  // Both bindings end up with the same `variableType`; only `annotated`
  // separates the source spellings.
  const { ast } = checkOnly("let a = 1\nlet b: i32 = 1\n");
  const a = ast.statements[0] as VLVariableDeclarationNode;
  const b = ast.statements[1] as VLVariableDeclarationNode;
  assertEquals(a.variableType, b.variableType, "same inferred type");
  assertEquals(a.annotated, false);
  assertEquals(b.annotated, true);
});

Deno.test("a `const` records its annotation flag too", () => {
  const { ast } = checkOnly("const c: boolean = true\n");
  const decl = ast.statements[0] as VLVariableDeclarationNode;
  assertEquals(decl.annotated, true);
});

// ---- gap 3: compound-assignment fidelity ---------------------------------

Deno.test("`a += b` records its compound operator", () => {
  const { ast } = checkOnly("let x = 0\nx += 5\n");
  const assign = ast.statements[1] as VLBinaryOperationNode;
  assertEquals(assign.type, "BinaryOperation");
  // Desugared form: an `=` whose right is `x + 5`.
  assertEquals(assign.operator, "=");
  // The original `+=` spelling is preserved so a printer reprints `x += 5`.
  assertEquals(assign.compoundOperator, "+");
});

Deno.test("`a = a + b` is NOT a compound assignment", () => {
  const { ast } = checkOnly("let x = 0\nx = x + 5\n");
  const assign = ast.statements[1] as VLBinaryOperationNode;
  assertEquals(assign.operator, "=");
  // No compound operator: the user wrote the long form.
  assertEquals(assign.compoundOperator, undefined);
});

Deno.test("each compound operator form is recorded distinctly", () => {
  const ops = [
    ["+=", "+"],
    ["-=", "-"],
    ["*=", "*"],
    ["/=", "/"],
    ["%=", "%"],
    ["^=", "^"],
  ] as const;
  for (const [surface, op] of ops) {
    const { ast } = checkOnly(`let x = 8\nx ${surface} 2\n`);
    const assign = ast.statements[1] as VLBinaryOperationNode;
    assertEquals(assign.compoundOperator, op, `for ${surface}`);
  }
});

Deno.test("compound assignment to a property records its operator", () => {
  const { ast } = checkOnly(
    "let o = { n: 0 }\no.n += 3\n",
  );
  const assign = ast.statements[1] as VLBinaryOperationNode;
  assertEquals(assign.operator, "=");
  assertEquals(assign.compoundOperator, "+");
});

// ---- gap 2: comment attachment / retrieval -------------------------------

Deno.test("comments are exposed with kind, text and position", () => {
  const src = "// a plain line\nlet x = 1\n";
  const { comments } = checkOnly(src);
  assertEquals(comments.length, 1);
  assertEquals(comments[0].kind, "line");
  assertEquals(comments[0].text, "// a plain line");
  assertEquals(comments[0].placement, "own-line");
  // Span: line 1, columns 0..15.
  assertEquals(comments[0].start, { line: 1, column: 0 });
});

Deno.test("a trailing comment is marked trailing", () => {
  const src = "let x = 1 // count\n";
  const { comments } = checkOnly(src);
  assertEquals(comments.length, 1);
  assertEquals(comments[0].placement, "trailing");
  assertEquals(comments[0].text, "// count");
});

Deno.test("a doc comment is distinguished from a plain line comment", () => {
  const src = "/// docs\n// plain\nlet x = 1\n";
  const { comments } = checkOnly(src);
  assertEquals(comments.length, 2);
  assertEquals(comments[0].kind, "doc");
  assertEquals(comments[1].kind, "line");
});

Deno.test("a comment is locatable relative to a node via spans", () => {
  // A printer attaches a comment to a node by comparing the comment's span to
  // node spans. Here the trailing comment sits on the same line as the decl,
  // after its span, so it trails the decl.
  const src = "let x = 1 // count\n";
  const { ast, spans, comments } = checkOnly(src);
  const decl = ast.statements[0];
  const declSpan = spans.get(decl);
  assertExists(declSpan);
  const c = comments[0];
  // Same line, comment starts after the declaration's stop column.
  assertEquals(c.start.line, declSpan!.stop.line);
  assertEquals(c.start.column > declSpan!.stop.column, true);
  assertEquals(c.placement, "trailing");
});

Deno.test("comments are retained even when the AST has no diagnostics", () => {
  // The flat list is a full superset; the same objects are cross-linked onto
  // tokens, but a printer can read them straight off `comments`.
  const src = "// header\nlet x = 1\nlet y = 2 // tail\n";
  const { comments } = checkOnly(src);
  assertEquals(comments.length, 2);
  assertEquals(comments[0].placement, "own-line");
  assertEquals(comments[1].placement, "trailing");
});
