// Signature help (D9 slot 10) — the pure half: WHICH function is being called at
// the cursor, and WHICH of its arguments the cursor is in. `server.ts` and the
// playground adapter hand the answer's callee position to the checker's `sigAt`
// export and shape the resulting parameter table onto the protocol.
//
// ── WHAT THE SURVEY SAID, AND WHAT SHIPPED ───────────────────────────────────
// `docs/internals/editor-surface-survey.md` grades this row *Partial* and sketches
// two grades: BRIDGE — "take the callee's rendered fn type from
// `scopeAt`/`hoverTypeAt`/`memberCompletionsAt` and re-parse `(a: i32, b: string)
// -> T` host-side" — and CLEAN, "one native export (§6) returning the param table
// structurally". The clean grade shipped, so the re-parse the survey called "the
// acknowledged debt" was never incurred: `sigAt` returns the parameters as data.
// This module is only the half the checker cannot answer — the checker is asked
// about a POSITION, and finding the callee's position from a cursor sitting three
// commas deep inside a half-typed argument list is a lexical question.
//
// ── WHY IT IS A TOKEN SCAN AND NOT A REGEX ───────────────────────────────────
// The counter has to be wrong about NOTHING that separates arguments, and the
// separators are the easy part: `f(a, "x, y", 'z', g(1, 2), [3, 4])` has one
// comma at depth 0 and five that are text, nesting, or brackets. `vlLex.ts` — the
// tokenizer `testDiscovery.ts` (slot 8) and `folding.ts` (slot 9) already share —
// decides all of it, so this is the third consumer of ONE answer to "is this `,`
// real?" rather than a third scanner with its own opinion.
//
// ── THE CURSOR IS NOT ALWAYS BETWEEN TOKENS ──────────────────────────────────
// Signature help fires while typing, so the cursor lands INSIDE tokens, and what
// it is inside decides the answer:
//
//   f("a, b|c")        cursor in a STRING → the string is one token, its commas
//                      are not separators: argument 0.
//   f(`v=\{g(1, |2)}`) cursor in an interpolation HOLE → the literal is ALSO one
//                      token, but a hole is expression source. The scan re-enters
//                      the hole (the scanners' hole spans) and answers about `g`,
//                      argument 1 — the call the user is actually inside. BOTH
//                      quoted forms interpolate, so `f("v=\{g(1, |2)}")` answers
//                      identically; the literal's opening delimiter picks the
//                      scanner and nothing else here changes.
//   f(`text \{x}|`)    cursor in literal TEXT, not a hole → nothing is being
//                      called there; the literal is argument 0 of `f`.
//
// ── MID-EDIT INPUT IS THE NORMAL CASE ────────────────────────────────────────
// The scan stops AT the cursor and reads the group stack it has open, rather
// than trying to match brackets across the whole file: text after the cursor
// cannot change which call the cursor is in, and an unclosed `(` is the
// question, not an error. A stray closer with no opener is dropped rather than
// popping something it never opened.
//
// The CHECKER is less forgiving — it needs a parseable program to have a symbol
// table at all — so `repairedSource` offers the closers as a second attempt.
// That is a repair for the checker's benefit, not the counter's; the counter
// never needed one.

import {
  type LexPos,
  type LexToken,
  scanStringLiteral,
  scanTemplate,
  type TemplateHole,
  tokenize,
} from "./vlLex.ts";
import { VL_HARD_KEYWORDS } from "./typeFeatures.ts";

/** A 0-based LSP position. */
export interface SigPosition {
  line: number;
  character: number;
}

/** The call the cursor sits inside. */
export interface CallSite {
  /** The callee identifier as written (`greet`, or the property of `x.greet(…)`). */
  name: string;
  /**
   * 0-based position of the callee name's FIRST character — what the checker's
   * `sigAt(line, col)` is asked about (it takes 1-based lines, so `server.ts`
   * adds the one).
   */
  callee: SigPosition;
  /** 0-based index of the argument the cursor is in (`f(a, |b)` → 1). */
  activeArgument: number;
  /** True for a member spelling `recv.name(…)` — the UFCS/method form. */
  member: boolean;
  /**
   * The closers that would balance the groups open at the cursor, innermost
   * first — "" when the scan opened none it must close. This is NOT a claim that
   * the document is unbalanced: in `f("a"|, 1)` the `)` exists three characters
   * to the right, and the scan stops at the cursor so it cannot see it. It is the
   * repair to try ONLY when the checker refused the buffer as written; see
   * {@link repairedSource}.
   */
  missingClosers: string;
}

/** One parameter of a resolved signature, as the checker reports it. */
export interface SigParam {
  /** "" when the name is not knowable (a function-typed value carries none). */
  name: string;
  type: string;
  /**
   * The parameter's DEFAULT VALUE as source text, "" when it has none.
   *
   * Optional on this interface because a seed predating parameter defaults
   * cannot report it, and every such signature renders exactly as it did before.
   */
  dflt?: string;
}

/** A signature the checker resolved: its parameter table and return type. */
export interface SigParts {
  params: SigParam[];
  ret: string;
}

/** A rendered signature label plus each parameter's slice of it. */
export interface SigLabel {
  label: string;
  /** `[start, end)` offsets into `label`, one per parameter, in order. */
  parameters: [number, number][];
}

const OPENERS = "([{";
const MATCHING: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

interface Group {
  open: string;
  /** Index of the opener's token, so the scan can look at what precedes it. */
  openTok: number;
  /** Commas seen at this group's own depth. */
  args: number;
}

/** A call site inside one slice of source, in that slice's own offsets. */
interface RawSite {
  name: string;
  nameStart: number;
  activeArgument: number;
  member: boolean;
  missingClosers: string;
}

const CLOSER_OF: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

/**
 * The closers that would balance the stack, innermost first, given that the call
 * is the group at index `callAt`.
 *
 * A `{` OUTSIDE the call is left alone, and that asymmetry is the whole rule: it
 * is the enclosing function body, whose `}` is sitting further down the file
 * where the scan — which stops at the cursor — never reached. A `{` at or inside
 * the call is an object literal or a lambda body the user is in the middle of,
 * and it genuinely has no closer yet.
 */
const closersFor = (stack: Group[], callAt: number): string => {
  let out = "";
  for (let j = stack.length - 1; j >= 0; j--) {
    if (stack[j].open === "{" && j < callAt) continue;
    out += CLOSER_OF[stack[j].open];
  }
  return out;
};

/** Byte offsets of each line start, for turning `LexPos` back into an offset. */
const lineStarts = (text: string): number[] => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
};

/**
 * The `\{…}` hole of the interpolated literal at `litStart` that contains
 * `offset`, or undefined when the offset is in the literal's TEXT. Containment is
 * inclusive at both ends: `\{|x}` and `\{x|}` are both inside the hole.
 *
 * The opening delimiter picks the scanner: a `"` string and a `` ` `` template
 * hold the same holes, and both scanners collect the same spans.
 */
const holeAround = (
  text: string,
  litStart: number,
  offset: number,
): TemplateHole | undefined => {
  const holes: TemplateHole[] = [];
  if (text[litStart] === "`") scanTemplate(text, litStart, holes);
  else scanStringLiteral(text, litStart, holes);
  return holes.find((h) => offset >= h.start && offset <= h.end);
};

/**
 * The innermost `(`-group on `stack` that is a CALL — its opener preceded by a
 * plain identifier. A grouping paren (`f(a, (b + |c))`) is not a call, so the
 * walk continues outward and reports the enclosing call instead, which is what
 * every mainstream editor shows there. A keyword before the paren is never a
 * callee: `if (x|)` is syntax, not a call.
 */
const innermostCall = (
  stack: Group[],
  toks: LexToken[],
  offsetOf: (p: LexPos) => number,
): RawSite | undefined => {
  for (let k = stack.length - 1; k >= 0; k--) {
    const g = stack[k];
    if (g.open !== "(") continue;
    const callee = toks[g.openTok - 1];
    if (callee === undefined || callee.kind !== "ident") continue;
    if (VL_HARD_KEYWORDS.includes(callee.s)) continue;
    const before = toks[g.openTok - 2];
    return {
      name: callee.s,
      nameStart: offsetOf(callee.start),
      activeArgument: g.args,
      member: before !== undefined && before.kind === "punct" && before.s === ".",
      missingClosers: closersFor(stack, k),
    };
  }
  return undefined;
};

const callSiteInSlice = (
  text: string,
  offset: number,
): RawSite | undefined => {
  const toks = tokenize(text);
  const starts = lineStarts(text);
  const offsetOf = (p: LexPos): number => (starts[p.line] ?? 0) + p.character;
  const stack: Group[] = [];

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const start = offsetOf(t.start);
    // Everything from the cursor rightward is the user's future, not their call.
    if (start >= offset) break;
    if (offsetOf(t.end) > offset) {
      // The cursor is strictly INSIDE this token. An interpolated literal's holes
      // are real expression source, so re-enter the one the cursor is in — in
      // EITHER quoted form, since both interpolate. Every other token (a char
      // literal, a comment, a number) is opaque and the answer is whatever group
      // stack was open when it started.
      if (t.kind === "str" && (text[start] === "`" || text[start] === '"')) {
        const hole = holeAround(text, start, offset);
        if (hole !== undefined) {
          const inner = callSiteInSlice(
            text.slice(hole.start, hole.end),
            offset - hole.start,
          );
          // A hole with no call in it (`f(\`\{x|}\`)`) falls back to the call the
          // literal is an argument of — the stack below still has it.
          if (inner !== undefined) {
            return { ...inner, nameStart: inner.nameStart + hole.start };
          }
        }
      }
      break;
    }
    if (t.kind !== "punct" || t.s.length !== 1) continue;
    if (OPENERS.includes(t.s)) {
      stack.push({ open: t.s, openTok: i, args: 0 });
    } else if (t.s in MATCHING) {
      // Pop to the nearest matching opener. A closer with no opener anywhere on
      // the stack closes nothing — mid-edit source is full of them.
      let k = stack.length - 1;
      while (k >= 0 && stack[k].open !== MATCHING[t.s]) k--;
      if (k >= 0) stack.length = k;
    } else if (t.s === "," && stack.length > 0) {
      stack[stack.length - 1].args++;
    }
  }
  return innermostCall(stack, toks, offsetOf);
};

/**
 * The call `(line, character)` sits inside, or undefined when the cursor is not
 * within any argument list. Positions are 0-based (LSP).
 */
export const callSiteAt = (
  source: string,
  line: number,
  character: number,
): CallSite | undefined => {
  const starts = lineStarts(source);
  const lineStart = starts[line];
  if (lineStart === undefined) return undefined;
  const site = callSiteInSlice(source, lineStart + character);
  if (site === undefined) return undefined;
  // Back to a position: the callee name never straddles a newline, so the line
  // is the last line start at or before it.
  let l = 0;
  while (l + 1 < starts.length && starts[l + 1] <= site.nameStart) l++;
  return {
    name: site.name,
    callee: { line: l, character: site.nameStart - starts[l] },
    activeArgument: site.activeArgument,
    member: site.member,
    missingClosers: site.missingClosers,
  };
};

/**
 * `source` with `site.missingClosers` inserted at the cursor, or undefined when
 * there is nothing to close.
 *
 * WHY A REPAIR EXISTS AT ALL. The counter above answers from tokens and does not
 * care that the `)` has not been typed yet; the CHECKER does — it needs a
 * parseable program to have a symbol table at all, so `greet("a", |` yields no
 * signature however well the counter reads it. Measured 2026-09-01: every
 * BALANCED mid-edit shape already worked (an empty argument list, a trailing
 * comma, a wrong-arity call — a check error does not stop the symbol pass), and
 * VS Code auto-closes `(`, so this only bites when auto-close is off or the user
 * deleted the closer. Try it only AFTER the buffer as written came back empty:
 * the closers say nothing about whether the document needs them.
 *
 * The repair only ADDS closers at the cursor, so it cannot move the callee's
 * position or change which binding the name resolves to — the worst case is a
 * buffer that still does not parse, and one more empty answer.
 */
export const repairedSource = (
  source: string,
  line: number,
  character: number,
  site: CallSite,
): string | undefined => {
  if (site.missingClosers === "") return undefined;
  const starts = lineStarts(source);
  const lineStart = starts[line];
  if (lineStart === undefined) return undefined;
  const at = lineStart + character;
  return source.slice(0, at) + site.missingClosers + source.slice(at);
};

/**
 * Render `name(p, …) => ret` and the label offsets of each parameter, which is
 * how the protocol wants a `ParameterInformation` addressed (an offset pair into
 * the signature label, not a repeat of the text). A parameter whose name the
 * checker could not supply renders as its type alone.
 *
 * A DEFAULTED parameter renders `b: i32 = 10`, and the default is INSIDE that
 * parameter's offset pair — the client highlights the whole `b: i32 = 10` when
 * the cursor is on argument 1, which is what the reader needs to see: the value
 * that lands if they stop typing. There is no per-parameter "optional" flag in
 * the protocol, so the rendered default IS how optionality is communicated.
 */
export const signatureLabel = (name: string, sig: SigParts): SigLabel => {
  const parameters: [number, number][] = [];
  let label = `${name}(`;
  sig.params.forEach((p, i) => {
    if (i > 0) label += ", ";
    const head = p.name === "" ? p.type : `${p.name}: ${p.type}`;
    const text = p.dflt ? `${head} = ${p.dflt}` : head;
    parameters.push([label.length, label.length + text.length]);
    label += text;
  });
  label += ")";
  if (sig.ret !== "") label += ` => ${sig.ret}`;
  return { label, parameters };
};
