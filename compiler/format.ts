// Source formatter for VL — `vl fmt` (ROADMAP D4).
//
// DESIGN: a COMMENT-PRESERVING TOKEN REFORMATTER. It is AST-DRIVEN in the sense
// that matters — the formatter parses the source (the CLI and tests round-trip
// through the real parser) and its output is VALIDATED against the parsed AST
// (see tests/format_test.ts: `parse(format(src))` must yield the same AST as
// `parse(src)` for every corpus file). But it deliberately does *not* RECONSTRUCT
// text from the AST, because doing so loses information the AST does not retain:
//
//   1. Comments. Track G's lexer now retains every comment as trivia (with
//      spans) attached to adjacent tokens, but NO comment is attached to an AST
//      *node* — they live only on tokens. The parser also `record`s spans for
//      expression / declaration / block nodes, yet NOT for the control-flow
//      statements (`if`/`for`/`while`/`return`/`break`/`continue`), so a node→
//      source slice cannot even cover those constructs. Every file in the test
//      corpus — and the harness's own `// @directive` lines — are comments, so a
//      naive AST→source printer would silently delete them: the exact failure
//      the rewrite exists to avoid.
//   2. Surface forms the AST flattens away: a compound assignment (`a += b`)
//      desugars to a `BinaryOperation` `a = a + b`; an annotation-free `let x = 1`
//      stores the *inferred* type, not "no annotation"; literal type-args
//      (`4<u32>`) and generic alias applications don't survive losslessly.
//      Reprinting from the AST would change the source text even where meaning is
//      identical, defeating the minimal-diff and surface-fidelity goals.
//
// So the formatter RE-SCANS the source into a token stream that INCLUDES comments
// and newlines, then reprints it with canonical horizontal spacing and
// indentation. Because it only rewrites whitespace between the very same tokens —
// and preserves every statement-terminating NEWLINE — the re-tokenization of the
// output is identical to the input modulo whitespace, so `parse(format(src))`
// yields the same AST as `parse(src)`. Comments are real tokens here, so they are
// never lost. This makes the formatter idempotent, comment-preserving, and
// semantics-preserving by construction (all three asserted over the corpus).
//
// Pure (no Deno/runtime globals); the CLI owns all I/O.

// ---- scanner -------------------------------------------------------------

// The formatter's own lightweight scanner. It mirrors lexer.ts's lexical rules
// (kept deliberately in sync — see that file) but, unlike the compiler lexer,
// RETAINS comments and newlines as tokens so they can be reprinted. It is
// intentionally permissive: an unterminated string or unknown char is emitted
// verbatim rather than dropped, so formatting never destroys bytes even on input
// the compiler would reject.

type FmtTokenKind =
  | "word" // identifier or keyword
  | "number"
  | "string"
  | "op" // operator / punctuation (incl. brackets)
  | "comment" // `// …` (and `/// …`) line comment, text excludes the newline
  | "newline";

type FmtToken = { kind: FmtTokenKind; text: string };

const isIdStart = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdPart = (c: string) => isIdStart(c) || (c >= "0" && c <= "9");
const isDigit = (c: string) => c >= "0" && c <= "9";

// Multi-char operators, longest-match-first (mirrors lexer's TWO_CHAR).
const TWO_CHAR = new Set([
  "++",
  "--",
  "&&",
  "||",
  "?.",
  "??",
  "==",
  "!=",
  ">=",
  "<=",
]);
const ONE_CHAR = new Set("+-*/%^=!><(){}[],.:|".split(""));

const scan = (source: string): FmtToken[] => {
  const tokens: FmtToken[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const c = source[i];

    // Newline (`\r?\n` collapses to a single newline token).
    if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      i++;
      tokens.push({ kind: "newline", text: "\n" });
      continue;
    }

    // Whitespace — dropped; spacing is recomputed on output.
    if (c === " " || c === "\t") {
      i++;
      continue;
    }

    // Line comment `// …` (captured, including the `//[/]` prefix verbatim).
    if (c === "/" && source[i + 1] === "/") {
      let text = "";
      while (i < len && source[i] !== "\n" && source[i] !== "\r") {
        text += source[i++];
      }
      tokens.push({ kind: "comment", text: text.replace(/\s+$/, "") });
      continue;
    }

    // Identifier / keyword.
    if (isIdStart(c)) {
      let text = "";
      while (i < len && isIdPart(source[i])) text += source[i++];
      tokens.push({ kind: "word", text });
      continue;
    }

    // Number `[0-9]+ ('.' [0-9]+)?` (fraction only when a digit follows the dot).
    if (isDigit(c)) {
      let text = "";
      while (i < len && isDigit(source[i])) text += source[i++];
      if (source[i] === "." && isDigit(source[i + 1])) {
        text += source[i++];
        while (i < len && isDigit(source[i])) text += source[i++];
      }
      tokens.push({ kind: "number", text });
      continue;
    }

    // String `"…"` / `'…'` with `\<any>` escapes; may span newlines. Emitted
    // verbatim (including an unterminated tail) so bytes are never lost.
    if (c === '"' || c === "'") {
      const quote = c;
      let text = source[i++];
      while (i < len) {
        const ch = source[i];
        if (ch === "\\") {
          text += source[i++];
          if (i < len) text += source[i++];
          continue;
        }
        text += source[i++];
        if (ch === quote) break;
      }
      tokens.push({ kind: "string", text });
      continue;
    }

    // Operators / punctuation (two-char before one-char).
    const two = source.slice(i, i + 2);
    if (TWO_CHAR.has(two)) {
      i += 2;
      tokens.push({ kind: "op", text: two });
      continue;
    }
    if (ONE_CHAR.has(c)) {
      i++;
      tokens.push({ kind: "op", text: c });
      continue;
    }

    // Unknown character — keep it verbatim as an op-ish token (don't drop).
    i++;
    tokens.push({ kind: "op", text: c });
  }

  return tokens;
};

// ---- reprinter -----------------------------------------------------------

const INDENT = "    "; // four spaces, one canonical brace/line style

// Openers raise indent for following lines; closers lower it.
const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);

// Punctuation that never takes a space before it.
const NO_SPACE_BEFORE = new Set([",", ")", "]", ".", "?.", ":"]);
// Tokens after which the next token hugs (no following space).
const NO_SPACE_AFTER = new Set(["(", "[", ".", "?.", "!"]);

// Keywords after which a `(` is a parenthesised sub-expression (space wanted),
// not a call.
const PAREN_SPACE_KEYWORDS = new Set([
  "if",
  "while",
  "for",
  "return",
  "is",
  "then",
  "else",
  "elseif",
  "in",
  "to",
  "step",
  "and",
  "or",
  "not",
  "await",
  "break",
  "continue",
]);

// Is `+`/`-`/`!` at this position a prefix unary? It is unary when the token
// BEFORE it is absent, an opener, a separator, an assignment, or another
// operator — i.e. there is no value to its left to be a binary left operand.
const isUnaryContext = (before: FmtToken | undefined): boolean => {
  if (before === undefined) return true;
  if (before.kind === "op") {
    if (CLOSERS.has(before.text)) return false; // value precedes → binary
    if (before.text === "++" || before.text === "--") return false; // postfix value
    return true; // `=`, `,`, `(`, `+`, `:`, `|` … → unary
  }
  // word/number/string before → there's a value → binary.
  return false;
};

// Decide whether a space goes between two adjacent on-line tokens.
const spaceBetween = (
  prev: FmtToken,
  cur: FmtToken,
  prevPrev: FmtToken | undefined,
): boolean => {
  const a = prev.text;
  const b = cur.text;

  // Comments always get separated from preceding code by one space.
  if (cur.kind === "comment") return true;

  if (NO_SPACE_BEFORE.has(b)) return false;
  if (NO_SPACE_AFTER.has(a)) return false;

  // `(` after a value is a call/group with no space (`f(x)`, `a[0](y)`), unless
  // a keyword that takes a parenthesised head precedes it (`if (x)`).
  if (b === "(") {
    if (prev.kind === "word") return PAREN_SPACE_KEYWORDS.has(a);
    if (a === ")" || a === "]") return false; // chained `f()()`, `a[0]()`
    return true;
  }

  // `[` indexing after a value has no space (`a[0]`, `f()[0]`).
  if (b === "[") {
    if (
      (prev.kind === "word" || prev.kind === "number" ||
        prev.kind === "string" || a === ")" || a === "]") &&
      !PAREN_SPACE_KEYWORDS.has(a)
    ) return false;
  }

  // Prefix unary `+`/`-`/`!` hugs its operand.
  if ((a === "-" || a === "+" || a === "!") && isUnaryContext(prevPrev)) {
    return false;
  }
  // `++`/`--` (prefix or postfix) hug the adjacent value.
  if (a === "++" || a === "--" || b === "++" || b === "--") return false;

  // Default: a single space (binary operators, keyword boundaries, `:` after,
  // `|` unions, etc.).
  return true;
};

// Net indent change contributed by a line's tokens (openers +1, closers -1).
const netDelta = (line: FmtToken[]): number => {
  let d = 0;
  for (const t of line) {
    if (t.kind !== "op") continue;
    if (OPENERS.has(t.text)) d++;
    else if (CLOSERS.has(t.text)) d--;
  }
  return d;
};

// Number of leading closers on a line — these dedent the line itself before its
// content is printed (so a `}` lines up under the opener's statement).
const leadingClosers = (line: FmtToken[]): number => {
  let n = 0;
  for (const t of line) {
    if (t.kind === "op" && CLOSERS.has(t.text)) n++;
    else break;
  }
  return n;
};

// Render one non-blank line's tokens with canonical inter-token spacing.
const renderLine = (line: FmtToken[]): string => {
  let out = "";
  for (let k = 0; k < line.length; k++) {
    const cur = line[k];
    if (k === 0) {
      out = cur.text;
      continue;
    }
    const prev = line[k - 1];
    const prevPrev = k >= 2 ? line[k - 2] : undefined;
    if (spaceBetween(prev, cur, prevPrev)) out += " ";
    out += cur.text;
  }
  return out;
};

/**
 * Format VL source canonically.
 *
 * Style: 4-space indentation by bracket/brace/paren nesting; a single space
 * around binary operators and after `,`/`:`; no space inside call/index/group
 * edges or before punctuation; prefix/postfix unary operators hug their operand;
 * blank lines collapsed to at most one; trailing whitespace stripped; comments
 * preserved verbatim (separated from preceding code by one space); the file ends
 * with exactly one trailing newline.
 *
 * Meaning-preserving by construction: it rewrites ONLY whitespace between the
 * source's own tokens and never moves a statement-terminating newline, so the
 * output re-tokenizes to the same token stream (modulo whitespace) and thus
 * parses to the same AST.
 */
export const format = (source: string): string => {
  const tokens = scan(source);

  // Split into lines on `newline` tokens (the newline itself is not stored).
  const lines: FmtToken[][] = [];
  let cur: FmtToken[] = [];
  for (const t of tokens) {
    if (t.kind === "newline") {
      lines.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  }
  lines.push(cur);

  const outLines: string[] = [];
  let indent = 0;
  let prevBlank = false;

  for (const line of lines) {
    if (line.length === 0) {
      // Collapse runs of blank lines to a single blank line; never emit a
      // leading blank line.
      if (!prevBlank && outLines.length > 0) {
        outLines.push("");
        prevBlank = true;
      }
      continue;
    }
    prevBlank = false;

    // A line beginning with closers is printed at a reduced indent so the closer
    // aligns with the construct that opened it.
    const lead = leadingClosers(line);
    const lineIndent = Math.max(0, indent - lead);
    outLines.push(INDENT.repeat(lineIndent) + renderLine(line));

    // Update running indent by the line's net bracket delta.
    indent = Math.max(0, indent + netDelta(line));
  }

  // Drop trailing blank line(s), then terminate with exactly one newline.
  while (outLines.length > 0 && outLines[outLines.length - 1] === "") {
    outLines.pop();
  }
  if (outLines.length === 0) return "";
  return outLines.join("\n") + "\n";
};

/** True iff `source` is already in canonical form. */
export const isFormatted = (source: string): boolean =>
  format(source) === source;
