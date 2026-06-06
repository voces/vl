// Unit tests for member-aware hover + semantic tokens (ROADMAP D1/D5 follow-up):
// resolving the `.member` half of a `receiver.member` access. Hover and semantic
// tokens previously resolved only D2 symbol-table *bindings*; a member name in
// `o.x` / `xs.get` / `s.slice` isn't a binding, so it came back empty. The
// `resolveMemberAt` / member-token mechanism (lsp/src/typeFeatures.ts) closes
// that, driven by the public AST node spans + the checker's member typing.
//
// `server.ts` can't be imported under Deno (it pulls in the Node-only
// `vscode-languageserver` and opens a connection on load), so these drive the
// pure helpers directly through `checkOnly` (which exposes the AST + spans).
// Auto-discovered by `deno task test`.

import { checkOnly, stringifyType } from "../compiler/compile.ts";
import { tokenize } from "../compiler/lexer.ts";
import {
  resolveMemberAt,
  SEMANTIC_TOKEN_TYPES,
  semanticTokensData,
} from "../lsp/src/typeFeatures.ts";
import type { Position } from "../compiler/ast.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

// Resolve the member at the (1-based-line) `.<name>` occurrence in `src`. We
// locate the column of `.<name>` in the given source line and point the cursor at
// the first char of `<name>` (just past the dot), matching the VL position
// convention (1-based line, 0-based column).
const memberAt = (src: string, line1: number, dotName: string) => {
  const { ast, spans } = checkOnly(src);
  if (!ast || !spans) throw new Error("checkOnly produced no ast/spans");
  const lineText = src.split("\n")[line1 - 1];
  const dotIdx = lineText.indexOf(dotName);
  if (dotIdx < 0) throw new Error(`'${dotName}' not found on line ${line1}`);
  const pos: Position = { line: line1, column: dotIdx + 1 }; // first char of name
  return resolveMemberAt(ast, spans, pos);
};

// ---- hover: object field ----------------------------------------------------

Deno.test("resolveMemberAt: object field `o.x` resolves to the field type", () => {
  // PR #32 example: hovering `o` gives `{x: i32}`, but hovering `x` gave nothing
  // — it should give at least `i32`.
  const src = "const o = { x: 1 }\nconst v = o.x\n";
  const member = memberAt(src, 2, ".x");
  if (!member) throw new Error("expected a resolved member for `o.x`");
  assertEquals(member.name, "x");
  assertEquals(stringifyType(member.type), "i32");
  assertEquals(member.kind, "property");
});

Deno.test("resolveMemberAt: a function-typed object member is a `method`", () => {
  const src = "const o = { f: function(): i32 { return 1 } }\nconst v = o.f()\n";
  const member = memberAt(src, 2, ".f");
  if (!member) throw new Error("expected a resolved member for `o.f`");
  assertEquals(member.name, "f");
  assertEquals(member.kind, "method");
});

// ---- hover: array / list members --------------------------------------------

Deno.test("resolveMemberAt: array method `xs.get` resolves to its signature", () => {
  const src = "const xs = [1, 2, 3]\nconst g = xs.get(0)\n";
  const member = memberAt(src, 2, ".get");
  if (!member) throw new Error("expected a resolved member for `xs.get`");
  assertEquals(member.name, "get");
  assertEquals(member.kind, "method");
  // The intrinsic list `get(i)` returns `T | null`.
  assertEquals(stringifyType(member.type), "(i: i32): i32 | null");
});

Deno.test("resolveMemberAt: array `.length` resolves to the intrinsic i32", () => {
  const src = "const xs = [1, 2, 3]\nconst n = xs.length\n";
  const member = memberAt(src, 2, ".length");
  if (!member) throw new Error("expected a resolved member for `xs.length`");
  assertEquals(member.name, "length");
  assertEquals(stringifyType(member.type), "i32");
  assertEquals(member.kind, "property");
});

// ---- hover: string members --------------------------------------------------

Deno.test("resolveMemberAt: string member `s.slice` resolves to a method", () => {
  const src = 'const s = "hi"\nconst u = s.slice(0, 1)\n';
  const member = memberAt(src, 2, ".slice");
  if (!member) throw new Error("expected a resolved member for `s.slice`");
  assertEquals(member.name, "slice");
  assertEquals(member.kind, "method");
  assertEquals(stringifyType(member.type), "(start: i32, end: i32): string");
});

// ---- non-members: the receiver / out-of-scope cursors -----------------------

Deno.test("resolveMemberAt: cursor on the receiver (not the member) resolves nothing", () => {
  const src = "const o = { x: 1 }\nconst v = o.x\n";
  // Point at `o` (the receiver), column of `o` on line 2.
  const lineText = src.split("\n")[1];
  const oCol = lineText.lastIndexOf("o."); // the receiver `o`, not `const`
  const { ast, spans } = checkOnly(src);
  const member = resolveMemberAt(ast!, spans!, { line: 2, column: oCol });
  // The receiver is a binding (handled by the symbol-table path in server.ts),
  // not a member — the member resolver should decline it.
  if (member) throw new Error(`expected no member at the receiver, got ${member.name}`);
});

Deno.test("resolveMemberAt: a cursor not on any member resolves nothing", () => {
  const src = "const o = { x: 1 }\nconst v = o.x\n";
  // Line 1, col 0 (`const`) is not inside any `receiver.member` name span.
  const { ast, spans } = checkOnly(src);
  const member = resolveMemberAt(ast!, spans!, { line: 1, column: 0 });
  if (member) throw new Error(`expected no member at line 1 col 0, got ${member.name}`);
});

// ---- semantic tokens: the member-token classification -----------------------

const PROPERTY = SEMANTIC_TOKEN_TYPES.indexOf("property");
const METHOD = SEMANTIC_TOKEN_TYPES.indexOf("method");

// Decode the flat 5-tuple LSP data back into absolute-position tokens so we can
// assert on member tokens regardless of their delta encoding.
const decode = (data: number[]) => {
  const out: { line: number; char: number; length: number; type: number }[] = [];
  let line = 0;
  let char = 0;
  for (let i = 0; i < data.length; i += 5) {
    const dLine = data[i];
    const dChar = data[i + 1];
    line += dLine;
    char = dLine === 0 ? char + dChar : dChar;
    out.push({ line, char, length: data[i + 2], type: data[i + 3] });
  }
  return out;
};

const tokensFor = (src: string) => {
  const { tokens } = tokenize(src);
  const { symbols, ast, spans } = checkOnly(src);
  return decode(semanticTokensData(symbols, tokens, src, ast, spans));
};

Deno.test("semanticTokensData: an object field member gets a `property` token", () => {
  const src = "const o = { x: 1 }\nconst v = o.x\n";
  const tokens = tokensFor(src);
  // The `x` member sits on line 1 (0-based), at the last char of `o.x`.
  const props = tokens.filter((t) => t.type === PROPERTY && t.line === 1);
  if (props.length === 0) {
    throw new Error("expected a `property` token for the `x` member of `o.x`");
  }
});

Deno.test("semanticTokensData: a function-typed member gets a `method` token", () => {
  const src = "const xs = [1, 2, 3]\nconst g = xs.get(0)\n";
  const tokens = tokensFor(src);
  const methods = tokens.filter((t) => t.type === METHOD && t.line === 1);
  if (methods.length === 0) {
    throw new Error("expected a `method` token for the `get` member of `xs.get`");
  }
});

Deno.test("semanticTokensData: member tokens don't disturb identifier tokens", () => {
  // The receiver `o` should still get its binding (variable) token; only the
  // member name is newly classified. Output must remain sorted (encoding rule).
  const src = "const o = { x: 1 }\nconst v = o.x\n";
  const tokens = tokensFor(src);
  for (let i = 1; i < tokens.length; i++) {
    const ordered = tokens[i].line > tokens[i - 1].line ||
      (tokens[i].line === tokens[i - 1].line &&
        tokens[i].char >= tokens[i - 1].char);
    if (!ordered) throw new Error(`tokens not sorted at index ${i}`);
  }
});
