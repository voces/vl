// Slice 1 (Track G): the lexer RETAINS all comments as trivia — collected into
// `LexResult.comments` with source spans and cross-linked onto adjacent tokens
// (leading, or trailing when on the same line after a token) — WITHOUT putting
// them into `tokens[]`, so parsing is unaffected. The pre-existing `///`
// `docComment` attachment (consumed by the LSP symbol table) is unchanged.

import { type Comment, type Token, tokenize } from "../compiler/lexer.ts";

// Hand-rolled assert (repo convention — no std import map; see symbols_test.ts).
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

const real = (tokens: Token[]): Token[] =>
  tokens.filter((t) => t.kind !== "NEWLINE" && t.kind !== "EOF");

Deno.test("comments are never emitted as tokens", () => {
  const { tokens } = tokenize("// a\nlet x = 1 // b\n/// c\nlet y = 2\n");
  // No token kind is a comment — comments stay entirely out of the stream.
  for (const t of tokens) {
    assertEquals(t.text.startsWith("//"), false);
  }
});

Deno.test("a leading line comment attaches to the next real token with its span", () => {
  const src = "// hello\nlet x = 1\n";
  const { tokens, comments } = tokenize(src);
  assertEquals(comments.length, 1);
  const c = comments[0];
  assertEquals(c.kind, "line");
  assertEquals(c.text, "// hello");
  assertEquals(c.start, { line: 1, column: 0 });
  assertEquals(c.stop, { line: 1, column: 8 });
  // Attached as a leading comment of the `let`.
  const letTok = real(tokens)[0];
  assertEquals(letTok.kind, "LET");
  assertEquals(letTok.leadingComments, [c]);
  assertEquals(letTok.trailingComments, undefined);
});

Deno.test("a trailing comment attaches to the preceding token on the same line", () => {
  const src = "let x = 1 // count\nlet y = 2\n";
  const { tokens, comments } = tokenize(src);
  assertEquals(comments.length, 1);
  const c = comments[0];
  assertEquals(c.kind, "line");
  assertEquals(c.text, "// count");
  assertEquals(c.start, { line: 1, column: 10 });
  // The trailing comment hangs off the `1` (the last real token on the line),
  // NOT the next line's `let`.
  const ones = real(tokens).find((t) => t.text === "1")!;
  assertEquals(ones.trailingComments, [c]);
  const secondLet = real(tokens).filter((t) => t.kind === "LET")[1];
  assertEquals(secondLet.leadingComments, undefined);
});

Deno.test("a comment between tokens is leading for the following token", () => {
  // A comment sitting on its own line between two statements is leading for the
  // next statement's first token (the trailing newline of `1` makes it leading).
  const src = "let x = 1\n// in between\nlet y = 2\n";
  const { tokens, comments } = tokenize(src);
  assertEquals(comments.map((c) => c.text), ["// in between"]);
  const secondLet = real(tokens).filter((t) => t.kind === "LET")[1];
  assertEquals(secondLet.leadingComments, [comments[0]]);
});

Deno.test("doc comments are retained as trivia AND still drive docComment", () => {
  const src = "/// my function\nfunction f() { return 1 }\n";
  const { tokens, comments } = tokenize(src);
  assertEquals(comments.length, 1);
  assertEquals(comments[0].kind, "doc");
  assertEquals(comments[0].text, "/// my function");
  const fnTok = real(tokens)[0];
  assertEquals(fnTok.kind, "FUNCTION");
  // The doc-comment markdown path is preserved (LSP hover/symbols depend on it).
  assertEquals(fnTok.docComment, "my function");
  // And it's also retained as ordinary trivia.
  assertEquals(fnTok.leadingComments?.length, 1);
  assertEquals(fnTok.leadingComments?.[0].kind, "doc");
});

Deno.test("the flat comments list is the superset, in source order", () => {
  const src = "// one\nlet x = 1 // two\n/// three\nlet y = 2\n";
  const { comments } = tokenize(src);
  assertEquals(
    comments.map((c: Comment) => [c.kind, c.text]),
    [["line", "// one"], ["line", "// two"], ["doc", "/// three"]],
  );
});

Deno.test("an end-of-file comment is retained and attached to EOF", () => {
  const src = "let x = 1\n// trailing eof\n";
  const { tokens, comments } = tokenize(src);
  assertEquals(comments.map((c) => c.text), ["// trailing eof"]);
  const eof = tokens[tokens.length - 1];
  assertEquals(eof.kind, "EOF");
  assertEquals(eof.leadingComments, [comments[0]]);
});

Deno.test("a `////` line is a plain comment, not a doc comment", () => {
  const { comments } = tokenize("//// not a doc\nlet x = 1\n");
  assertEquals(comments.length, 1);
  assertEquals(comments[0].kind, "line");
});
