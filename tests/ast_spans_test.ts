// Slice 2 (Track G): AST node source spans are exposed on the PUBLIC API. The
// parser builds a `NodeSpans` side-table (node identity -> `Context`) and now
// returns it; `checkOnly`/`compile` surface it as `result.spans`, queryable with
// the `spanOf(spans, node)` accessor re-exported from `./toAST.ts`. Spans use the
// 1-based-line / 0-based-column / exclusive-stop convention (see `ast.ts`).

import { checkOnly } from "../compiler/compile.ts";
import { spanOf } from "../compiler/toAST.ts";

// Hand-rolled asserts (repo convention — no std import map; see symbols_test.ts).
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};
const assertExists = <T>(v: T, msg?: string): void => {
  if (v === null || v === undefined) {
    throw new Error(`${msg ? msg + ": " : ""}expected a value, got ${v}`);
  }
};
import type {
  Context,
  VLBinaryOperationNode,
  VLBlockNode,
  VLBreakNode,
  VLContinueNode,
  VLForInNode,
  VLForNode,
  VLFunctionDeclarationNode,
  VLIfNode,
  VLReturnNode,
  VLStringLiteralNode,
  VLVariableDeclarationNode,
  VLWhileNode,
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

// ---- Track G gap 1: control-flow statement spans -------------------------
// `if`/`while`/`for`/`for-in`/`return`/`break`/`continue` are now recorded in
// the span side-table (previously bare nodes with no span), so a node->source
// slice can cover control flow. Each is exercised in the smallest source that
// places it, with the exact [line,col,line,col] extent asserted.

Deno.test("an `if` node spans the whole statement, branches included", () => {
  const src = "if true { return 1 } else { return 2 }\n";
  const { ast, spans } = checkOnly(src);
  const node = ast.statements[0] as VLIfNode;
  assertEquals(node.type, "If");
  const ctx = spanOf(spans, node);
  assertExists(ctx);
  // `if` at column 0 through the closing `}` of the else branch (column 38).
  assertEquals(span(ctx!), [1, 0, 1, 38]);
});

Deno.test("a `while` node spans from `while` through its body close", () => {
  const src = "while false { break }\n";
  const { ast, spans } = checkOnly(src);
  const node = ast.statements[0] as VLWhileNode;
  assertEquals(node.type, "While");
  const ctx = spanOf(spans, node);
  assertExists(ctx);
  assertEquals(span(ctx!), [1, 0, 1, 21]);
});

Deno.test("a labelled `while` span starts at the label", () => {
  const src = "outer: while false { break outer }\n";
  const { ast, spans } = checkOnly(src);
  const node = ast.statements[0] as VLWhileNode;
  assertEquals(node.type, "While");
  assertEquals(node.label, "outer");
  const ctx = spanOf(spans, node);
  assertExists(ctx);
  // Span begins at the label `outer`, not at `while`.
  assertEquals(span(ctx!), [1, 0, 1, 34]);
});

Deno.test("a counted `for` node spans the whole loop", () => {
  const src = "for i in 0 to 10 { break }\n";
  const { ast, spans } = checkOnly(src);
  const node = ast.statements[0] as VLForNode;
  assertEquals(node.type, "For");
  const ctx = spanOf(spans, node);
  assertExists(ctx);
  assertEquals(span(ctx!), [1, 0, 1, 26]);
});

Deno.test("a `for-in` node spans the whole loop", () => {
  const src = "for x in [1, 2, 3] { break }\n";
  const { ast, spans } = checkOnly(src);
  const node = ast.statements[0] as VLForInNode;
  assertEquals(node.type, "ForIn");
  const ctx = spanOf(spans, node);
  assertExists(ctx);
  assertEquals(span(ctx!), [1, 0, 1, 28]);
});

Deno.test("a `return` node spans the keyword and its value", () => {
  const src = "function f() { return 1 + 2 }\n";
  const { ast, spans } = checkOnly(src);
  const fn = ast.statements[0] as VLFunctionDeclarationNode;
  const body = fn.body as VLBlockNode;
  const ret = body.statements[0] as VLReturnNode;
  assertEquals(ret.type, "Return");
  const ctx = spanOf(spans, ret);
  assertExists(ctx);
  // `return 1 + 2` is columns 15..27.
  assertEquals(span(ctx!), [1, 15, 1, 27]);
});

Deno.test("`break` and `continue` nodes carry spans", () => {
  const src = "while true { break\ncontinue }\n";
  const { ast, spans } = checkOnly(src);
  const loop = ast.statements[0] as VLWhileNode;
  const body = loop.statement as VLBlockNode;
  const brk = body.statements[0] as VLBreakNode;
  const cont = body.statements[1] as VLContinueNode;
  assertEquals(brk.type, "Break");
  assertEquals(cont.type, "Continue");
  const brkCtx = spanOf(spans, brk);
  const contCtx = spanOf(spans, cont);
  assertExists(brkCtx);
  assertExists(contCtx);
  // `break` is columns 13..18 on line 1; `continue` columns 0..8 on line 2.
  assertEquals(span(brkCtx!), [1, 13, 1, 18]);
  assertEquals(span(contCtx!), [2, 0, 2, 8]);
});

Deno.test("a labelled `break` span covers the label", () => {
  const src = "outer: for i in 0 to 3 { break outer }\n";
  const { ast, spans } = checkOnly(src);
  const loop = ast.statements[0] as VLForNode;
  const body = loop.statement as VLBlockNode;
  const brk = body.statements[0] as VLBreakNode;
  assertEquals(brk.label, "outer");
  const ctx = spanOf(spans, brk);
  assertExists(ctx);
  // `break outer` is columns 25..36.
  assertEquals(span(ctx!), [1, 25, 1, 36]);
});
