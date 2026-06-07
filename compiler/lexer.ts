// Hand-written lexer for VL — essentially a token list. This (with parser.ts)
// is the grammar now; it replaced the antlr4-generated lexer.
//
// Significant newlines are handled cleanly downstream: NEWLINE is emitted as a
// real token and the parser treats it as a statement terminator, transparently
// skipping it inside brackets/objects/args where a `NEWLINE*` used to be
// sprinkled in the grammar. WS is dropped here.
//
// Comments are RETAINED as trivia, but kept OUT of the token stream: every `//`
// line comment (doc `///` or plain) is collected into `LexResult.comments` with
// its source span, and also attached to the adjacent real token as
// `leadingComments` / `trailingComments` (a "trailing" comment is one that sits
// on the same source line, after the token, before the next newline). Because
// comments never enter `tokens[]`, the parser's peek/lookahead is untouched —
// they are metadata for the formatter / doc cross-refs, not grammar tokens. The
// pre-existing `///` doc-comment attachment (a markdown run handed to a following
// declaration's token as `docComment`, consumed by the symbol table for LSP
// hover) is preserved unchanged.
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
  | "CHAR"
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
  | "AMPERSAND"
  | "TILDE"
  // Structural
  | "NEWLINE"
  | "EOF";

/**
 * A retained source comment (trivia). Kept out of the token stream; collected
 * into `LexResult.comments` and cross-linked onto adjacent tokens. `kind`
 * distinguishes a doc comment (`///`, but not `////`) from a plain line comment
 * (`//`, or `////+`). `text` is the verbatim comment lexeme including its `//`
 * prefix (no trailing newline). The span follows the token convention: `start`
 * is the first `/`, `stop` is one past the last character on the line.
 */
export type Comment = {
  kind: "line" | "doc";
  text: string;
  start: Position;
  stop: Position;
  /**
   * Source line position relative to code, for an AST→source printer (Track G):
   * `"trailing"` when the comment sits on the SAME line as, and after, a real
   * token (`let x = 1 // count`), `"own-line"` when it stands alone on its line
   * (or is the leading comment of the following token). The same distinction that
   * decides whether the comment is cross-linked as a token's `trailingComments`
   * vs the next token's `leadingComments` — surfaced here so a printer reading the
   * flat `comments` list can place it without re-deriving from spans.
   */
  placement: "own-line" | "trailing";
};

export type Token = {
  kind: TokenKind;
  text: string;
  start: Position;
  stop: Position;
  /**
   * For STRING and CHAR tokens: the decoded literal value, with the surrounding
   * quotes removed and escape sequences (`\n`, `\t`, `\\`, `\"`, `\uXXXX`, …)
   * resolved to their actual characters. `text` keeps the raw source lexeme
   * (quotes + backslashes) so the token span still measures source extent;
   * `value` is what a StringLiteral node should carry. For a CHAR token the
   * value is exactly one character (the code point that `'x'` denotes); the
   * parser lowers it to that char's i32 code. Undefined for other tokens.
   */
  value?: string;
  /**
   * Markdown doc-comment captured from a run of consecutive `///` lines
   * immediately preceding this (real, non-trivia) token. Each line has its `///`
   * prefix and one optional leading space stripped, and the lines are joined
   * with `\n`. Only attached to the first real token following the run; a blank
   * line or any non-`///` content between the run and the token breaks the
   * association. Plain `//` comments never set this. Undefined when absent.
   */
  docComment?: string;
  /**
   * Comments (doc or plain) that immediately precede this token, in source
   * order, since the previous real token / line content. Trivia only — the
   * parser never reads these; they exist for the formatter and doc cross-refs.
   * Undefined when there are none. NEWLINE tokens never carry comments.
   */
  leadingComments?: Comment[];
  /**
   * A comment that sits on the SAME source line as this token, after it, before
   * the next newline (e.g. `let x = 1 // count`). Attached to the preceding real
   * token rather than the next so a formatter can keep it on its line. Trivia
   * only; undefined when absent.
   */
  trailingComments?: Comment[];
};

// Null-prototype so an identifier that collides with an Object.prototype member
// (e.g. `toString`, `constructor`, `hasOwnProperty`) doesn't accidentally
// resolve to the inherited method instead of `undefined` in the lookup below —
// it must lex as a plain `ID`.
const KEYWORDS: Record<string, TokenKind> = Object.assign(Object.create(null), {
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
});

const isIdStart = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdPart = (c: string) => isIdStart(c) || (c >= "0" && c <= "9");
const isDigit = (c: string) => c >= "0" && c <= "9";

export type LexResult = {
  tokens: Token[];
  diagnostics: VLDiagnostic[];
  /**
   * Every comment in the source, in order, with spans. A superset of the
   * per-token `leadingComments`/`trailingComments` (the same `Comment` objects
   * are shared by identity), exposed as a flat list for consumers that want all
   * comments without walking the token stream.
   */
  comments: Comment[];
};

export const tokenize = (source: string): LexResult => {
  const tokens: Token[] = [];
  const diagnostics: VLDiagnostic[] = [];
  const comments: Comment[] = [];
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

  // Accumulated `///` doc lines for the run currently being built. Joined and
  // attached to the next real token (see `push`). `lastLineWasDoc` tracks whether
  // the immediately preceding source line was a `///` line so a blank/code line
  // in between breaks the run (handled in the NEWLINE branch).
  let docLines: string[] = [];
  let lastLineWasDoc = false;

  // Comments lexed since the last real token, awaiting attachment as the next
  // real token's `leadingComments`. (A comment that turns out to be trailing —
  // same line, after a token — is instead attached to that preceding token at
  // lex time and never enters this buffer.) NEWLINE tokens are transparent here.
  let pendingComments: Comment[] = [];
  // Whether a NEWLINE has been emitted since the last real (non-NEWLINE,
  // non-comment) token. Drives the leading-vs-trailing decision for a comment:
  // a comment with no intervening newline since a real token is trailing.
  let newlineSinceToken = true;
  // The most recently pushed real token, so a trailing comment can be hung off
  // it. Reset by EOF handling implicitly (no token follows).
  let lastRealToken: Token | undefined;

  const push = (
    kind: TokenKind,
    text: string,
    start: Position,
    value?: string,
  ) => {
    const token: Token = { kind, text, start, stop: pos() };
    if (value !== undefined) token.value = value;
    // Attach (and consume) a pending `///` run to the first real token after it.
    // NEWLINE is trivia for this purpose — it lets the run span multiple lines —
    // so a run is only handed to a substantive token.
    if (kind !== "NEWLINE" && docLines.length > 0) {
      token.docComment = docLines.join("\n");
      docLines = [];
    }
    // Hand any buffered comments to the first real token after them. NEWLINE is
    // transparent (it never carries comments), so leading comments survive the
    // blank lines between them and the declaration they precede.
    if (kind !== "NEWLINE") {
      if (pendingComments.length > 0) {
        token.leadingComments = pendingComments;
        pendingComments = [];
      }
      lastRealToken = token;
      newlineSinceToken = false;
    } else {
      newlineSinceToken = true;
    }
    tokens.push(token);
  };

  while (i < len) {
    const start = pos();
    const c = source[i];

    // Newline: `\r?\n`.
    if (c === "\r" || c === "\n") {
      if (c === "\r" && source[i + 1] === "\n") advance();
      advance();
      // A line that carried no `///` (blank or code) breaks the doc run, so a
      // non-adjacent `///` doesn't bleed onto a later declaration. We only learn
      // a line "was a doc line" when its `///` was lexed (sets `lastLineWasDoc`);
      // a plain newline here with that flag unset drops any accumulated run.
      if (!lastLineWasDoc) docLines = [];
      lastLineWasDoc = false;
      push("NEWLINE", "\n", start);
      continue;
    }

    // Whitespace (skip).
    if (c === " " || c === "\t") {
      advance();
      continue;
    }

    // Line comment `// …`. A `///` (but not `////`) line is a doc-comment: its
    // text is captured and later attached to the following declaration's token
    // (the `docComment` markdown path). ALL comments — doc and plain — are
    // additionally retained as trivia: collected into `comments` with their span
    // and cross-linked onto the adjacent token (leading, or trailing if on the
    // same line after a token). They stay OUT of `tokens[]`, so parsing is
    // unaffected.
    if (c === "/" && source[i + 1] === "/") {
      let text = "";
      while (i < len && source[i] !== "\n" && source[i] !== "\r") {
        text += advance();
      }
      const isDoc = text.startsWith("///") && text[3] !== "/";
      // Trailing comment: same source line, after a real token, with no NEWLINE
      // between. Attach to that token so a formatter keeps it on its line.
      // Otherwise it's a leading comment for the next real token.
      const trailing = !newlineSinceToken && lastRealToken !== undefined;
      const comment: Comment = {
        kind: isDoc ? "doc" : "line",
        text,
        start,
        stop: pos(),
        placement: trailing ? "trailing" : "own-line",
      };
      comments.push(comment);
      if (trailing) {
        (lastRealToken!.trailingComments ??= []).push(comment);
      } else {
        pendingComments.push(comment);
      }
      if (isDoc) {
        // Strip the `///` and one optional leading space; keep the rest verbatim
        // so authored markdown (lists, code, blank-ish lines) survives.
        let body = text.slice(3);
        if (body.startsWith(" ")) body = body.slice(1);
        docLines.push(body);
        lastLineWasDoc = true;
      }
      // A non-doc comment line does NOT set `lastLineWasDoc`, so the trailing
      // NEWLINE breaks any run — `//` can't sit inside a doc block.
      continue;
    }

    // Identifier / keyword.
    if (isIdStart(c)) {
      let text = "";
      while (i < len && isIdPart(source[i])) text += advance();
      push(KEYWORDS[text] ?? "ID", text, start);
      continue;
    }

    // Number. Three integer bases plus decimal, all with optional `_` digit
    // separators that group digits for readability (`1_000`, `0xFF_FF`):
    //   - hex     `0x`/`0X`  digits `[0-9a-fA-F]`
    //   - octal   `0o`/`0O`  digits `[0-7]`
    //   - binary  `0b`/`0B`  digits `[01]`
    //   - decimal `[0-9]+ ('.' [0-9]+)?` — the fractional part is only taken when
    //     a digit follows the dot, so `a.5` and `p.x` keep `.` as a separate DOT.
    // A `_` is allowed only BETWEEN digits — never leading, trailing, doubled, or
    // adjacent to the `0x`/`0o`/`0b` prefix (mirrors Rust/JS/Java). The NUMBER
    // token's `text` is NORMALIZED to a plain decimal string (separators stripped,
    // any base folded to base-10) so every downstream consumer — the parser's
    // integer/float split, `BigInt(text)` widening, i64 codegen, negation that
    // prepends `-` — keeps working unchanged; the raw source form is still
    // recoverable from the token span (used by the formatter for reprint).
    if (isDigit(c)) {
      const prefix = source[i] === "0" ? (source[i + 1] ?? "") : "";
      let base: 16 | 8 | 2 | undefined;
      let baseName = "";
      if (prefix === "x" || prefix === "X") {
        base = 16;
        baseName = "hex";
      } else if (prefix === "o" || prefix === "O") {
        base = 8;
        baseName = "octal";
      } else if (prefix === "b" || prefix === "B") {
        base = 2;
        baseName = "binary";
      }

      if (base !== undefined) {
        advance(); // '0'
        advance(); // base letter
        const isBaseDigit = (ch: string): boolean => {
          if (base === 16) {
            return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") ||
              (ch >= "A" && ch <= "F");
          }
          if (base === 8) return ch >= "0" && ch <= "7";
          return ch === "0" || ch === "1";
        };
        // Collect digits and separators verbatim, then validate separator
        // placement; `digits` holds the digits with separators stripped.
        let raw = "";
        let digits = "";
        let badSeparator = false;
        // A `_` immediately after the prefix is illegal (`0x_FF`).
        if (source[i] === "_") badSeparator = true;
        while (i < len && (isBaseDigit(source[i]) || source[i] === "_")) {
          const ch = advance();
          raw += ch;
          if (ch === "_") {
            // Doubled (`1__0`) or trailing (`FF_`, checked after the loop) — a
            // `_` must sit strictly between two digits.
            if (raw.length >= 2 && raw[raw.length - 2] === "_") badSeparator = true;
          } else {
            digits += ch;
          }
        }
        if (raw.endsWith("_")) badSeparator = true; // trailing separator
        const stop = pos();
        if (digits.length === 0) {
          diagnostics.push({
            message:
              `Syntax error: ${baseName} literal has no digits after \`0${prefix}\``,
            severity: "error",
            source: "vital",
            range: { start: shift(start), end: shift(stop) },
          });
          // Emit a recoverable `0` so the parser can continue.
          push("NUMBER", "0", start);
          continue;
        }
        if (badSeparator) {
          diagnostics.push({
            message:
              `Syntax error: \`_\` may only separate digits in a numeric literal`,
            severity: "error",
            source: "vital",
            range: { start: shift(start), end: shift(stop) },
          });
        }
        // Normalize to decimal. BigInt parses the prefixed, separator-free form.
        const decimal = BigInt(`0${prefix}${digits}`).toString();
        push("NUMBER", decimal, start);
        continue;
      }

      // Decimal (possibly with a fractional part), with `_` digit separators.
      let raw = "";
      let badSeparator = false;
      const takeDigits = () => {
        while (i < len && (isDigit(source[i]) || source[i] === "_")) {
          const ch = advance();
          raw += ch;
          if (ch === "_" && raw.length >= 2 && raw[raw.length - 2] === "_") {
            badSeparator = true; // doubled `1__0`
          }
        }
      };
      // A decimal literal can't start with `_` (the lexer only enters this branch
      // on a digit), so we only need to guard the integer part's trailing `_` and
      // the fractional part's leading/trailing `_`.
      takeDigits();
      if (raw.endsWith("_")) badSeparator = true; // trailing before `.`/end
      if (source[i] === "." && isDigit(source[i + 1])) {
        raw += advance(); // '.'
        // `_` right after the dot (`1._5`) is illegal — must follow a digit.
        if (source[i] === "_") badSeparator = true;
        takeDigits();
        if (raw.endsWith("_")) badSeparator = true; // trailing fractional `_`
      }
      if (badSeparator) {
        diagnostics.push({
          message:
            `Syntax error: \`_\` may only separate digits in a numeric literal`,
          severity: "error",
          source: "vital",
          range: { start: shift(start), end: shift(pos()) },
        });
      }
      const text = raw.replace(/_/g, "");
      push("NUMBER", text, start);
      continue;
    }

    // String `"…"` or char `'…'`, with backslash escapes. A double-quoted string
    // may span newlines (the grammar's char class excludes only the quote and
    // backslash). A single-quoted CHAR literal denotes one (possibly escaped)
    // character and evaluates to its i32 code point downstream — empty `''` or
    // multi-char `'ab'` is a lex error. Both share the SAME escape grammar,
    // decoded HERE so the token's `value` already holds the logical characters
    // that flow to the AST and codegen; `text` keeps the raw source lexeme
    // (quotes + backslashes) so the token span still measures source extent.
    // Supported escapes: `\n` `\t` `\r` `\\` `\"` `\'` `\0`, `\b` (8) `\f` (12)
    // `\v` (11), `\xXX` (2 hex), `\uXXXX` (4 hex) and `\u{…}` (1-6 hex). An
    // unknown escape (e.g. `\q`) or a malformed numeric escape keeps the
    // character after the backslash verbatim and emits a warning, so authoring
    // mistakes are visible but never fatal.
    if (c === '"' || c === "'") {
      const quote = c;
      let text = advance(); // opening quote
      let value = "";
      let closed = false;
      while (i < len) {
        const ch = source[i];
        if (ch === "\\") {
          const escStart = pos();
          text += advance(); // backslash
          if (i >= len) break; // dangling backslash at EOF; unterminated below
          const e = source[i];
          text += advance(); // escaped char
          switch (e) {
            case "n":
              value += "\n";
              break;
            case "t":
              value += "\t";
              break;
            case "r":
              value += "\r";
              break;
            case "\\":
              value += "\\";
              break;
            case '"':
              value += '"';
              break;
            case "'":
              value += "'";
              break;
            case "0":
              value += "\0";
              break;
            case "b":
              value += "\b";
              break;
            case "f":
              value += "\f";
              break;
            case "v":
              value += "\v";
              break;
            case "\n":
            case "\r":
              // Line continuation: a backslash immediately before a newline
              // drops both. `advance()` already tracked the line; consume a
              // paired `\r\n` so column accounting stays correct.
              if (e === "\r" && source[i] === "\n") text += advance();
              break;
            case "x": {
              const hex = source.slice(i, i + 2);
              if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                text += advance() + advance();
                value += String.fromCharCode(parseInt(hex, 16));
              } else {
                value += "x";
                diagnostics.push({
                  message:
                    "Invalid string escape: \\x must be followed by two hex digits",
                  severity: "warning",
                  source: "vital",
                  range: { start: shift(escStart), end: shift(pos()) },
                });
              }
              break;
            }
            case "u": {
              if (source[i] === "{") {
                const close = source.indexOf("}", i);
                const hex = close === -1 ? "" : source.slice(i + 1, close);
                if (close !== -1 && /^[0-9a-fA-F]{1,6}$/.test(hex)) {
                  const cp = parseInt(hex, 16);
                  if (cp <= 0x10ffff) {
                    while (i <= close) text += advance(); // `{` … `}`
                    value += String.fromCodePoint(cp);
                    break;
                  }
                }
                value += "u";
                diagnostics.push({
                  message:
                    "Invalid string escape: \\u{…} expects 1-6 hex digits for a valid code point",
                  severity: "warning",
                  source: "vital",
                  range: { start: shift(escStart), end: shift(pos()) },
                });
              } else {
                const hex = source.slice(i, i + 4);
                if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                  for (let k = 0; k < 4; k++) text += advance();
                  value += String.fromCharCode(parseInt(hex, 16));
                } else {
                  value += "u";
                  diagnostics.push({
                    message:
                      "Invalid string escape: \\u must be followed by four hex digits or \\u{…}",
                    severity: "warning",
                    source: "vital",
                    range: { start: shift(escStart), end: shift(pos()) },
                  });
                }
              }
              break;
            }
            default:
              // Unknown escape: keep the character after the backslash verbatim
              // (so `\q` → `q`) and warn so the typo is visible.
              value += e;
              diagnostics.push({
                message: `Unknown string escape sequence "\\${e}"`,
                severity: "warning",
                source: "vital",
                range: { start: shift(escStart), end: shift(pos()) },
              });
          }
          continue;
        }
        if (ch === quote) {
          text += advance();
          closed = true;
          break;
        }
        value += advance();
      }
      if (!closed) {
        diagnostics.push({
          message: quote === "'"
            ? "Syntax error: unterminated char literal"
            : "Syntax error: unterminated string literal",
          severity: "error",
          source: "vital",
          range: { start: shift(start), end: shift(pos()) },
        });
      }
      if (quote === "'") {
        // A char literal must decode to exactly one code point. Empty `''` or
        // multi-char `'ab'` is a hard error (still emit a CHAR token carrying the
        // first/zero code point so the parser can recover without cascading).
        const points = [...value];
        if (points.length !== 1) {
          diagnostics.push({
            message: points.length === 0
              ? "Syntax error: empty char literal (expected one character)"
              : "Syntax error: char literal must contain exactly one character",
            severity: "error",
            source: "vital",
            range: { start: shift(start), end: shift(pos()) },
          });
        }
        push("CHAR", text, start, points[0] ?? "");
        continue;
      }
      push("STRING", text, start, value);
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

  const eof: Token = { kind: "EOF", text: "", start: pos(), stop: pos() };
  // A trailing run of comments at end-of-file (no following real token) attaches
  // to EOF so it's reachable as token trivia too — it's already in `comments`.
  if (pendingComments.length > 0) eof.leadingComments = pendingComments;
  tokens.push(eof);
  return { tokens, diagnostics, comments };
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
  "&": "AMPERSAND",
  "~": "TILDE",
};
