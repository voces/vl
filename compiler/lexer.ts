// Hand-written lexer for VL — essentially a token list. This (with parser.ts)
// is the grammar now; it replaced the antlr4-generated lexer.
//
// Significant newlines are handled cleanly downstream: NEWLINE is emitted as a
// real token and the parser treats it as a statement terminator, transparently
// skipping it inside brackets/objects/args where a `NEWLINE*` used to be
// sprinkled in the grammar. WS and `//` comments are dropped here.
//
// Positions follow the diagnostics convention: 1-based line, 0-based column.
// Each token carries `start` (first char) and `stop` (one past the last char).
import type { Position } from "./ast.ts";
import type { VLDiagnostic } from "./compile.ts";

export type TokenKind =
  // Keywords
  | "FUNCTION"
  | "IF"
  | "THEN"
  | "ELSE"
  | "ELSEIF"
  | "WHILE"
  | "FOR"
  | "TO"
  | "STEP"
  | "IN"
  | "CONST"
  | "LET"
  | "RETURN"
  | "IS"
  | "AWAIT"
  | "BREAK"
  | "CONTINUE"
  | "FROM"
  | "TYPE"
  // Literal keywords
  | "TRUE"
  | "FALSE"
  | "NULL"
  // Values
  | "NUMBER"
  | "STRING"
  | "ID"
  // Operators / punctuation
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "DIV"
  | "MOD"
  | "CARET"
  | "EQUAL"
  | "PLUSPLUS"
  | "MINUSMINUS"
  | "AND"
  | "OR"
  | "EXCLAMATION"
  | "QUESTION_DOT"
  | "QUESTION_QUESTION"
  | "EQUAL_TO"
  | "NOT_EQUAL_TO"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL_TO"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL_TO"
  | "LPAREN"
  | "RPAREN"
  | "LBRACE"
  | "RBRACE"
  | "LBRACK"
  | "RBRACK"
  | "COMMA"
  | "DOT"
  | "COLON"
  | "PIPE"
  // Structural
  | "NEWLINE"
  | "EOF";

export type Token = {
  kind: TokenKind;
  text: string;
  start: Position;
  stop: Position;
};

const KEYWORDS: Record<string, TokenKind> = {
  function: "FUNCTION",
  if: "IF",
  then: "THEN",
  else: "ELSE",
  elseif: "ELSEIF",
  while: "WHILE",
  for: "FOR",
  to: "TO",
  step: "STEP",
  in: "IN",
  const: "CONST",
  let: "LET",
  return: "RETURN",
  is: "IS",
  await: "AWAIT",
  break: "BREAK",
  continue: "CONTINUE",
  from: "FROM",
  type: "TYPE",
  true: "TRUE",
  false: "FALSE",
  null: "NULL",
};

const isIdStart = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdPart = (c: string) => isIdStart(c) || (c >= "0" && c <= "9");
const isDigit = (c: string) => c >= "0" && c <= "9";

export type LexResult = { tokens: Token[]; diagnostics: VLDiagnostic[] };

export const tokenize = (source: string): LexResult => {
  const tokens: Token[] = [];
  const diagnostics: VLDiagnostic[] = [];
  let i = 0;
  let line = 1;
  let column = 0;
  const len = source.length;

  const pos = (): Position => ({ line, column });

  // Advance one character, tracking line/column. Returns the consumed char.
  const advance = (): string => {
    const c = source[i++];
    if (c === "\n") {
      line++;
      column = 0;
    } else {
      column++;
    }
    return c;
  };

  const push = (kind: TokenKind, text: string, start: Position) => {
    tokens.push({ kind, text, start, stop: pos() });
  };

  while (i < len) {
    const start = pos();
    const c = source[i];

    // Newline: `\r?\n`.
    if (c === "\r" || c === "\n") {
      if (c === "\r" && source[i + 1] === "\n") advance();
      advance();
      push("NEWLINE", "\n", start);
      continue;
    }

    // Whitespace (skip).
    if (c === " " || c === "\t") {
      advance();
      continue;
    }

    // Line comment `// …` (skip).
    if (c === "/" && source[i + 1] === "/") {
      while (i < len && source[i] !== "\n" && source[i] !== "\r") advance();
      continue;
    }

    // Identifier / keyword.
    if (isIdStart(c)) {
      let text = "";
      while (i < len && isIdPart(source[i])) text += advance();
      push(KEYWORDS[text] ?? "ID", text, start);
      continue;
    }

    // Number: `[0-9]+ ('.' [0-9]+)?`. The fractional part is only taken when a
    // digit follows the dot, so `a.5` and `p.x` keep `.` as a separate DOT.
    if (isDigit(c)) {
      let text = "";
      while (i < len && isDigit(source[i])) text += advance();
      if (source[i] === "." && isDigit(source[i + 1])) {
        text += advance(); // '.'
        while (i < len && isDigit(source[i])) text += advance();
      }
      push("NUMBER", text, start);
      continue;
    }

    // String: `"…"` or `'…'`, with `\<any>` escapes. May span newlines (the
    // grammar's char class excludes only the quote and backslash).
    if (c === '"' || c === "'") {
      const quote = c;
      let text = advance(); // opening quote
      let closed = false;
      while (i < len) {
        const ch = source[i];
        if (ch === "\\") {
          text += advance();
          if (i < len) text += advance();
          continue;
        }
        if (ch === quote) {
          text += advance();
          closed = true;
          break;
        }
        text += advance();
      }
      if (!closed) {
        diagnostics.push({
          message: "Syntax error: unterminated string literal",
          severity: "error",
          source: "vital",
          range: { start: shift(start), end: shift(pos()) },
        });
      }
      push("STRING", text, start);
      continue;
    }

    // Multi/single-char operators and punctuation (longest match first).
    const two = source.slice(i, i + 2);
    const twoKind = TWO_CHAR[two];
    if (twoKind) {
      advance();
      advance();
      push(twoKind, two, start);
      continue;
    }

    const oneKind = ONE_CHAR[c];
    if (oneKind) {
      advance();
      push(oneKind, c, start);
      continue;
    }

    // Unknown character — report and skip so lexing makes progress.
    advance();
    diagnostics.push({
      message: `Syntax error: unexpected character ${JSON.stringify(c)}`,
      severity: "error",
      source: "vital",
      range: { start: shift(start), end: shift(pos()) },
    });
  }

  tokens.push({ kind: "EOF", text: "", start: pos(), stop: pos() });
  return { tokens, diagnostics };
};

// A diagnostic range uses 0-based lines; tokens use 1-based. Shift on emit.
const shift = (p: Position) => ({ line: p.line - 1, character: p.column });

const TWO_CHAR: Record<string, TokenKind> = {
  "++": "PLUSPLUS",
  "--": "MINUSMINUS",
  "&&": "AND",
  "||": "OR",
  "?.": "QUESTION_DOT",
  "??": "QUESTION_QUESTION",
  "==": "EQUAL_TO",
  "!=": "NOT_EQUAL_TO",
  ">=": "GREATER_THAN_OR_EQUAL_TO",
  "<=": "LESS_THAN_OR_EQUAL_TO",
};

const ONE_CHAR: Record<string, TokenKind> = {
  "+": "PLUS",
  "-": "MINUS",
  "*": "STAR",
  "/": "DIV",
  "%": "MOD",
  "^": "CARET",
  "=": "EQUAL",
  "!": "EXCLAMATION",
  ">": "GREATER_THAN",
  "<": "LESS_THAN",
  "(": "LPAREN",
  ")": "RPAREN",
  "{": "LBRACE",
  "}": "RBRACE",
  "[": "LBRACK",
  "]": "RBRACK",
  ",": "COMMA",
  ".": "DOT",
  ":": "COLON",
  "|": "PIPE",
};
