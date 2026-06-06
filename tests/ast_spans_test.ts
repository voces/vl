// Slice 2 (Track G): AST node source spans are exposed on the PUBLIC API. The
// parser builds a `NodeSpans` side-table (node identity -> `Context`) and now
// returns it; `checkOnly`/`compile` surface it as `result.spans`, queryable with
// the `spanOf(spans, node)` accessor re-exported from `./toAST.ts`. Spans use the
// 1-based-line / 0-based-column / exclusive-stop convention (see `ast.ts`).

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { checkOnly } from "../compiler/compile.ts";
import { spanOf } from "../compiler/toAST.ts";
import type {
  Context,
  VLBinaryOperationNode,
  VLFunctionDeclarationNode,
  VLStringLiteralNode,
  VLVariableDeclarationNode,
} from "../compiler/ast.ts";

// `start`/`stop` as compact [line, column] pairs for readable assertions.
const span = (ctx: Context): [number, number, number, number] => [
  ctx.start.line,
  ctx.start.column,
  ctx.stop.line,
  ctx.stop.column,
];

Deno.test("a variable declaration node carries its full source span", () => {
  const src = "let x = 1\n";
  const { ast, spans } = checkOnly(src);
  const decl = ast.statements[0] as VLVariableDeclarationNode;
  assertEquals(decl.type, "VariableDeclaration");
  const ctx = spanOf(spans, decl);
  assertExists(ctx);
  // `let x = 1` spans columns 0..9 on line 1 (stop is one past the `1`).
  assertEquals(span(ctx!), [1, 0, 1, 9]);
});

Deno.test("a binary operation and its operands each have spans", () => {
  const src = "let y = 2 + 3\n";
  const { ast, spans } = checkOnly(src);
  const decl = ast.statements[0] as VLVariableDeclarationNode;
  const bin = decl.value as VLBinaryOperationNode;
  assertEquals(bin.type, "BinaryOperation");
  const binCtx = spanOf(spans, bin);
  assertExists(binCtx);
  // `2 + 3` is columns 8..13.
  assertEquals(span(binCtx!), [1, 8, 1, 13]);
  // Operands have their own (tighter) spans.
  const leftCtx = spanOf(spans, bin.left);
  const rightCtx = spanOf(spans, bin.right);
  assertExists(leftCtx);
  assertExists(rightCtx);
  assertEquals(span(leftCtx!), [1, 8, 1, 9]); // `2`
  assertEquals(span(rightCtx!), [1, 12, 1, 13]); // `3`
});

Deno.test("a function declaration node spans from `function` to its body close", () => {
  const src = "function f() { return 1 }\n";
  const { ast, spans } = checkOnly(src);
  const fn = ast.statements[0] as VLFunctionDeclarationNode;
  assertEquals(fn.type, "FunctionDeclaration");
  const ctx = spanOf(spans, fn);
  assertExists(ctx);
  // Whole declaration: column 0 through the closing `}` at column 25.
  assertEquals(span(ctx!), [1, 0, 1, 25]);
});

Deno.test("a string literal node carries its span (quotes included)", () => {
  const src = 'let s = "hi"\n';
  const { ast, spans } = checkOnly(src);
  const decl = ast.statements[0] as VLVariableDeclarationNode;
  const str = decl.value as VLStringLiteralNode;
  assertEquals(str.type, "StringLiteral");
  const ctx = spanOf(spans, str);
  assertExists(ctx);
  // `"hi"` is columns 8..12 (the span covers the surrounding quotes).
  assertEquals(span(ctx!), [1, 8, 1, 12]);
});

Deno.test("the program root node has a span", () => {
  const src = "let x = 1\nlet y = 2\n";
  const { ast, spans } = checkOnly(src);
  const ctx = spanOf(spans, ast);
  assertExists(ctx);
  assertEquals(ctx!.start, { line: 1, column: 0 });
});

Deno.test("spanOf returns undefined for a node with no recorded span", () => {
  const { spans } = checkOnly("let x = 1\n");
  // A foreign object never went through the parser's `record`.
  assertEquals(spanOf(spans, { type: "Name", name: "z" }), undefined);
});

Deno.test("spans are exposed identically across multiple statements", () => {
  const src = "let a = 1\nlet b = 2\n";
  const { ast, spans } = checkOnly(src);
  const first = spanOf(spans, ast.statements[0]);
  const second = spanOf(spans, ast.statements[1]);
  assertExists(first);
  assertExists(second);
  assertEquals(span(first!), [1, 0, 1, 9]);
  assertEquals(span(second!), [2, 0, 2, 9]);
});
