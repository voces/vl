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
//   • INTERPOLATION HOLES `\{…}`, legal in a `"…"` string AND in a backtick
//     template — one trigger, one state machine (`scanHole`), reached from both
//     literal scanners. A `"` inside a hole is not the string's terminator, so
//     `scanStringLiteral` HAS to know about holes: without it `"a\{f("x")}b"`
//     ends its scan at the wrong quote and every later token in the file is
//     misread.
//   • backtick TEMPLATE literals, scanned WHOLE — delimiters, text parts, holes
//     and all — and emitted as one `str` token. The whole point is that a brace,
//     quote or backtick anywhere inside one is invisible to the consumers: a
//     hole's `{ … }` is balanced by construction, so folding must not see it as
//     a region, and a hole's `"…"` must not derail the string scan. Interpolated
//     literals NEST (a hole may hold another), which is why the scan is a small
//     state machine and not an `indexOf`.
//   • no interpolation OF THE TEXT: a template's `str` value is its raw inner
//     source, escapes undecoded, since no consumer reads a template's value for
//     anything but a test name.
//
// Positions are 0-based LSP coordinates (`line` / `character`). `\r` is
// whitespace, so a CRLF document tokenizes identically to an LF one — the
// carriage return is skipped and the `\n` after it advances the line.
//
// Consumers: `testDiscovery.ts` (comments dropped — the `describe`/`it` scan
// wants a token stream where "identifier immediately followed by `(`" means a
// call), `folding.ts` (comments kept — a comment run is a foldable region and a
// `}` inside one is not a closer), and `signatureHelp.ts` (comments dropped; it
// counts the commas that separate ARGUMENTS, so a `,` in a string or a comment
// must not be one — and it is the one consumer that looks INSIDE a template,
// via `scanTemplate`'s optional hole spans, because a hole is expression source
// and a call can be written in it).

export interface LexPos {
  line: number;
  character: number;
}

/**
 * `ident` — an identifier or keyword.
 * `str` — a TERMINATED double-quoted string (`s` is its DECODED value), or a
 *   TERMINATED backtick template (`s` is its raw inner source).
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

/**
 * Scans the literal opening at `source[from]` (a `"` or `'`).
 *
 * A `"` literal INTERPOLATES: `\{` opens a hole, which is skipped whole via
 * {@link scanHole} and contributes its raw source to `value`. That is not a
 * nicety — a hole is expression context, so it can contain a `"`, and a scanner
 * that did not know about holes would take that quote as this literal's
 * terminator and misread the rest of the document. A `'` char literal does not
 * interpolate (one code point could not hold a hole), matching `compiler/lexer.vl`.
 *
 * `holes`, when given, collects this literal's OWN hole spans in source order —
 * see {@link scanTemplate} for what a consumer does with them.
 */
export const scanStringLiteral = (
  source: string,
  from: number,
  holes?: TemplateHole[],
): StringScan => {
  const quote = source[from];
  const interpolates = quote === '"';
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
      // A hole's newlines are NOT this rule's business — a hole is an expression
      // and may span lines — and they are consumed by `scanHole` below.
      return { value, next: i, terminated: false, lineBreaks, lastBreak };
    }
    if (c !== "\\") {
      value += c;
      i++;
      continue;
    }
    const e = source[i + 1];
    if (e === undefined) break;
    if (interpolates && e === "{") {
      const hole = scanHole(source, i, holes);
      // A hole may span lines; the caller tracks position from these.
      for (let k = i; k < hole.next; k++) {
        if (source[k] === "\n") {
          lineBreaks++;
          lastBreak = k;
        }
      }
      value += source.slice(i, hole.next);
      i = hole.next;
      continue;
    }
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

/** A `\{…}` hole's CONTENT span — offsets into the source, `\{` and `}` excluded. */
export interface TemplateHole {
  start: number;
  /** Exclusive. The source end for an unterminated hole (mid-edit). */
  end: number;
}

/**
 * Scans the interpolation hole opening at `source[from]` (the backslash of a
 * `\{`), returning the index one past its closing `}`.
 *
 * ONE state machine for BOTH literal forms — a hole in `"…"` and a hole in
 * `` `…` `` are the same construct, so a second copy here would be a second
 * answer to "is this `}` the closer?". Braces nest; `"` / `'` literals are
 * skipped whole (a delimiter inside one is ordinary — the hole is expression
 * context, and a nested string may itself interpolate, which is why the string
 * scanner is the one called rather than an `indexOf`); a nested template
 * recurses. A newline is ordinary inside a hole, so the caller must count line
 * breaks from the consumed slice rather than assume there are none.
 */
export const scanHole = (
  source: string,
  from: number,
  holes?: TemplateHole[],
): { next: number; closed: boolean } => {
  let i = from + 2; // past `\{`
  const holeStart = i;
  let closed = false;
  let depth = 0;
  while (i < source.length) {
    const h = source[i];
    if (h === "}" && depth === 0) {
      i++;
      closed = true;
      break;
    }
    if (h === "{") depth++;
    else if (h === "}") depth--;
    else if (h === '"' || h === "'") i = scanStringLiteral(source, i).next - 1;
    else if (h === "`") i = scanTemplate(source, i).next - 1;
    i++;
  }
  holes?.push({ start: holeStart, end: closed ? i - 1 : source.length });
  return { next: i, closed };
};

/**
 * Scans the backtick template opening at `source[from]`, returning the index one
 * past its closing backtick.
 *
 * The state machine is the lexer's (`compiler/lexer.vl`): in TEXT, a backslash
 * escapes the next character, `` ` `` closes and `\{` opens a hole. `${` is
 * ordinary text — the hole trigger moved into the escape namespace when plain
 * strings learned to interpolate, so that one spelling serves both forms.
 *
 * `holes`, when given, collects this template's OWN hole spans in source order —
 * the state machine already knows where each one begins and ends, and signature
 * help needs exactly that to re-enter a hole as expression source (an
 * interpolated literal is one opaque `str` token to `tokenize`, so a call written
 * inside one is invisible without it). A hole nested in an inner literal is NOT
 * collected: that literal is itself one token of the outer hole's source, so the
 * consumer recurses rather than flattening.
 */
export const scanTemplate = (
  source: string,
  from: number,
  holes?: TemplateHole[],
): { next: number; terminated: boolean } => {
  let i = from + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") {
      // `\{` opens a hole; every other backslash escapes the next character —
      // which is what makes `\\{` an escaped backslash before an ordinary brace.
      if (source[i + 1] === "{") {
        i = scanHole(source, i, holes).next;
        continue;
      }
      i += 2;
      continue;
    }
    if (c === "`") return { next: i + 1, terminated: true };
    i++;
  }
  return { next: source.length, terminated: false };
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
    if (c === "`") {
      const start = posAt(i);
      const scan = scanTemplate(source, i);
      const raw = source.slice(i, scan.next);
      // A template is multiline by design, so its own newlines move the cursor.
      const nl = raw.lastIndexOf("\n");
      if (nl >= 0) {
        for (let k = 0; k < raw.length; k++) if (raw[k] === "\n") line++;
        lineStart = i + nl + 1;
      }
      const end = posAt(scan.next);
      if (scan.terminated) {
        toks.push({
          kind: "str",
          s: source.slice(i + 1, scan.next - 1),
          start,
          end,
        });
      } else {
        // Unterminated: emit the opening backtick so the scan makes progress.
        toks.push({ kind: "punct", s: c, start, end });
      }
      i = scan.next;
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
