// VL's lexical grammar, as a host-side tokenizer — the ONE the editor surface
// uses. Extracted from `testDiscovery.ts` (D9 slot 8) when folding (D9 slot 9)
// became its second consumer: a third hand-rolled scanner is how three
// different answers to "is this `{` real?" get shipped.
//
// It mirrors `compiler/lexer.vl` on exactly the parts a lexical feature needs:
//
//   • `//` line comments, and `///` doc comments — there is NO block comment,
//     so a comment always ends at the newline. (`lexer.vl` retains both as
//     trivia with a `doc` flag; here they are ordinary tokens, emitted only
//     when the caller asks.)
//   • `"…"` strings and `'…'` char literals sharing one escape set
//     (`\n \t \r \\ \" \' \0 \b \f \v \xXX \uXXXX \u{…}`, plus
//     backslash-newline line continuation, unknown escapes kept verbatim).
//   • no interpolation, so a string is one opaque token and a brace inside it
//     is text.
//
// Positions are 0-based LSP coordinates (`line` / `character`). `\r` is
// whitespace, so a CRLF document tokenizes identically to an LF one — the
// carriage return is skipped and the `\n` after it advances the line.
//
// Consumers: `testDiscovery.ts` (comments dropped — the `describe`/`it` scan
// wants a token stream where "identifier immediately followed by `(`" means a
// call) and `folding.ts` (comments kept — a comment run is a foldable region
// and a `}` inside one is not a closer).

export interface LexPos {
  line: number;
  character: number;
}

/**
 * `ident` — an identifier or keyword.
 * `str` — a TERMINATED double-quoted string; `s` is its DECODED value.
 * `comment` — a `//` or `///` line comment; `s` is the text as written,
 *   `//` included and any trailing `\r` excluded.
 * `punct` — everything else, one character at a time, EXCEPT a numeric run
 *   (kept whole so `1.0` emits no `.`) and an unterminated string/char
 *   literal (which emits its opening quote, so the scan makes progress).
 */
export type LexTokenKind = "ident" | "str" | "punct" | "comment";

export interface LexToken {
  kind: LexTokenKind;
  s: string;
  start: LexPos;
  end: LexPos;
}

export interface TokenizeOptions {
  /**
   * Emit `comment` tokens. Off by default: a caller reasoning about token
   * ADJACENCY (`it` then `(`) wants comments gone, and turning them on would
   * silently change what "the next token" means for such a caller.
   */
  comments?: boolean;
}

const CH_0 = 48, CH_9 = 57;
const CH_A = 65, CH_Z = 90, CH_a = 97, CH_z = 122;
const CH_UNDERSCORE = 95, CH_DOLLAR = 36;

const isDigit = (c: number): boolean => c >= CH_0 && c <= CH_9;
const isIdentStart = (c: number): boolean =>
  (c >= CH_A && c <= CH_Z) || (c >= CH_a && c <= CH_z) ||
  c === CH_UNDERSCORE || c === CH_DOLLAR;
const isIdentPart = (c: number): boolean => isIdentStart(c) || isDigit(c);

// The single-character escapes, exactly compiler/lexer.vl's set. An escape NOT
// in here keeps the escaped character verbatim (the lexer warns and does the
// same), so `\q` decodes to `q`.
const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "\\": "\\",
  '"': '"',
  "'": "'",
  "0": "\0",
  b: "\b",
  f: "\f",
  v: "\v",
};

const hexValue = (source: string, from: number, count: number): number => {
  let v = 0;
  for (let i = 0; i < count; i++) {
    const d = parseInt(source[from + i] ?? "", 16);
    if (Number.isNaN(d)) return -1;
    v = v * 16 + d;
  }
  return v;
};

const fromCode = (code: number): string => {
  if (code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
};

export interface StringScan {
  /** Decoded value; meaningless when `terminated` is false. */
  value: string;
  /** Index one past the closing quote (or past where the scan gave up). */
  next: number;
  terminated: boolean;
  /** Newlines consumed by line continuations, for position tracking. */
  lineBreaks: number;
  /** Index of the last newline consumed, or -1. */
  lastBreak: number;
}

/** Scans the literal opening at `source[from]` (a `"` or `'`). */
export const scanStringLiteral = (source: string, from: number): StringScan => {
  const quote = source[from];
  let value = "";
  let i = from + 1;
  let lineBreaks = 0;
  let lastBreak = -1;
  while (i < source.length) {
    const c = source[i];
    if (c === quote) {
      return { value, next: i + 1, terminated: true, lineBreaks, lastBreak };
    }
    if (c === "\n") {
      // An unescaped newline ends the literal in the lexer too (unterminated).
      return { value, next: i, terminated: false, lineBreaks, lastBreak };
    }
    if (c !== "\\") {
      value += c;
      i++;
      continue;
    }
    const e = source[i + 1];
    if (e === undefined) break;
    if (e === "\n") {
      // Line continuation: the backslash and the newline both disappear.
      lineBreaks++;
      lastBreak = i + 1;
      i += 2;
      continue;
    }
    if (e === "x") {
      const v = hexValue(source, i + 2, 2);
      if (v >= 0) {
        value += fromCode(v);
        i += 4;
        continue;
      }
    } else if (e === "u") {
      if (source[i + 2] === "{") {
        const close = source.indexOf("}", i + 3);
        if (close > i + 2 && close - (i + 3) <= 6) {
          const v = hexValue(source, i + 3, close - (i + 3));
          if (v >= 0) {
            value += fromCode(v);
            i = close + 1;
            continue;
          }
        }
      } else {
        const v = hexValue(source, i + 2, 4);
        if (v >= 0) {
          value += fromCode(v);
          i += 6;
          continue;
        }
      }
    }
    // A simple escape, or an unknown one kept verbatim.
    value += SIMPLE_ESCAPES[e] ?? e;
    i += 2;
  }
  return { value, next: source.length, terminated: false, lineBreaks, lastBreak };
};

/**
 * Every token that matters, in order. Whitespace is dropped; comments are
 * dropped unless `opts.comments`. A TERMINATED char literal is dropped too (it
 * can never be a name and it can hold a `"` that would otherwise derail the
 * string scan). EVERY other character becomes a punct token — a cheap way to
 * guarantee that "identifier immediately followed by `(`" really means a call,
 * so `xs[it]("x")` cannot be mistaken for one.
 */
export const tokenize = (
  source: string,
  opts: TokenizeOptions = {},
): LexToken[] => {
  const toks: LexToken[] = [];
  let i = 0;
  let line = 0;
  let lineStart = 0;
  const posAt = (idx: number): LexPos => ({
    line,
    character: idx - lineStart,
  });
  while (i < source.length) {
    const c = source[i];
    if (c === "\n") {
      line++;
      i++;
      lineStart = i;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v") {
      i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      const stop = nl < 0 ? source.length : nl;
      if (opts.comments === true) {
        // A CRLF document's `\r` belongs to the line break, not the comment.
        const textEnd = stop > i && source[stop - 1] === "\r" ? stop - 1 : stop;
        toks.push({
          kind: "comment",
          s: source.slice(i, textEnd),
          start: posAt(i),
          end: posAt(textEnd),
        });
      }
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = posAt(i);
      const scan = scanStringLiteral(source, i);
      if (scan.lineBreaks > 0) {
        line += scan.lineBreaks;
        lineStart = scan.lastBreak + 1;
      }
      const end = posAt(scan.next);
      if (c === '"' && scan.terminated) {
        toks.push({ kind: "str", s: scan.value, start, end });
      } else if (!scan.terminated) {
        // Unterminated: emit nothing, but do not rescan the same characters.
        toks.push({ kind: "punct", s: c, start, end });
      }
      i = scan.next;
      continue;
    }
    const code = source.charCodeAt(i);
    if (isIdentStart(code)) {
      const from = i;
      while (i < source.length && isIdentPart(source.charCodeAt(i))) i++;
      toks.push({
        kind: "ident",
        s: source.slice(from, i),
        start: posAt(from),
        end: posAt(i),
      });
      continue;
    }
    if (isDigit(code)) {
      // A numeric run is one opaque token — never a call target, and keeping it
      // whole stops `1.0` from emitting a `.` that would gate a later ident.
      const from = i;
      while (i < source.length) {
        const cc = source.charCodeAt(i);
        if (isIdentPart(cc)) i++;
        else if (source[i] === "." && isDigit(source.charCodeAt(i + 1))) i++;
        else break;
      }
      toks.push({
        kind: "punct",
        s: source.slice(from, i),
        start: posAt(from),
        end: posAt(i),
      });
      continue;
    }
    toks.push({ kind: "punct", s: c, start: posAt(i), end: posAt(i + 1) });
    i++;
  }
  return toks;
};
