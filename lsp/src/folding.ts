// Folding ranges (D9 slot 9) — the pure half. `foldingRanges(source)` is the
// whole feature; `server.ts` only maps the result onto the protocol's
// `FoldingRange`.
//
// ── WHY THIS NEEDS NO CHECKER ────────────────────────────────────────────────
// The survey (editor-surface-survey.md, "Folding ranges") grades this
// "Syntactic: brace scan + `lexicalTokensAt` comment spans, host-side". The
// comment half needs no seed either: comments are LEXICAL, and `vlLex.ts`
// already reads them from the same grammar `compiler/lexer.vl` does. So folding
// is the one editor surface that keeps working with NO compiler seed loaded —
// which matters, because the no-seed state is this extension's recurring
// operational hazard and every other handler goes silent in it.
//
// ── WHY IT IS A TOKEN SCAN AND NOT A LINE SCAN ───────────────────────────────
// A line scan counting braces opens a region on `let s = "{"` and closes one on
// `// }`. Regions come from the token stream instead, so a brace inside a
// string or a comment is text. (`vlLex.ts` is the same tokenizer the test
// discovery scan uses — one answer to "is this `{` real?", not three.)
//
// ── WHAT A RANGE MEANS ───────────────────────────────────────────────────────
// A client folds lines `startLine + 1 … endLine` inclusive, so a bracketed
// block ends one line ABOVE its closer: collapsing `function f() {` must leave
// the `}` on screen, the way every mainstream editor renders it. A comment run
// and the import block, by contrast, end ON their last line — there is no
// closing token to keep visible.
//
// `startCharacter`/`endCharacter` are deliberately NOT produced. The protocol
// allows them, but `vscode-languageclient` drops both when it converts an LSP
// `FoldingRange` to a `vscode.FoldingRange` (line numbers and kind only), so
// emitting them would be decoration that nothing reads.

import { type LexToken, tokenize } from "./vlLex.ts";

/**
 * The protocol's `FoldingRangeKind` values, restricted to the two VL has a
 * producer for. A plain bracketed block carries NO kind — the protocol's
 * default — because "region" means an explicit `#region` marker, which VL has
 * no syntax for.
 */
export type VlFoldingKind = "comment" | "imports";

export interface VlFoldingRange {
  /** 0-based; the line that stays visible when the range is collapsed. */
  startLine: number;
  /** 0-based, inclusive, and always `> startLine`. */
  endLine: number;
  kind?: VlFoldingKind;
}

const OPENERS: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
const CLOSERS: Record<string, string> = { "}": "{", ")": "(", "]": "[" };

interface OpenBracket {
  ch: string;
  line: number;
}

/**
 * Bracketed blocks: `{…}`, `(…)`, `[…]` spanning more than one line.
 *
 * Recovery is what makes this usable on a buffer mid-edit, where unbalanced is
 * the NORMAL state:
 *   • a closer with no matching opener on the stack is ignored;
 *   • a closer that matches an opener BELOW the top closes that one and
 *     discards the unclosed openers above it (`foo( bar { )`);
 *   • an opener that is never closed yields no range at all, rather than a
 *     region running to the end of the file — a fold to EOF appears on every
 *     keystroke after typing a `{` and is worse than no fold.
 */
const bracketRanges = (toks: readonly LexToken[]): VlFoldingRange[] => {
  const out: VlFoldingRange[] = [];
  const stack: OpenBracket[] = [];
  for (const t of toks) {
    if (t.kind !== "punct") continue;
    if (OPENERS[t.s] !== undefined) {
      stack.push({ ch: t.s, line: t.start.line });
      continue;
    }
    const wants = CLOSERS[t.s];
    if (wants === undefined) continue;
    let at = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].ch === wants) {
        at = i;
        break;
      }
    }
    if (at < 0) continue; // an unmatched closer: ignored, never a region
    const open = stack[at];
    stack.length = at; // drops the matched opener and anything left unclosed
    const endLine = t.start.line - 1;
    if (endLine > open.line) out.push({ startLine: open.line, endLine });
  }
  return out;
};

/**
 * Runs of two or more consecutive OWN-LINE `//` comments (`///` doc comments
 * included — they are the same token). A trailing comment (`let x = 1 // why`)
 * is not part of a run: folding it would hide the code on the line above it.
 */
const commentRanges = (toks: readonly LexToken[]): VlFoldingRange[] => {
  const out: VlFoldingRange[] = [];
  let runStart = -1;
  let runEnd = -1;
  const flush = (): void => {
    if (runStart >= 0 && runEnd > runStart) {
      out.push({ startLine: runStart, endLine: runEnd, kind: "comment" });
    }
    runStart = -1;
    runEnd = -1;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== "comment") continue;
    const prev = toks[i - 1];
    // Anything ending on this line before the comment makes it a trailing one.
    // Two own-line comments can never share a line (a comment eats to the
    // newline), so the immediately preceding token is the whole test.
    const ownLine = prev === undefined || prev.end.line !== t.start.line;
    if (!ownLine) {
      flush();
      continue;
    }
    if (runStart >= 0 && t.start.line === runEnd + 1) {
      runEnd = t.start.line;
    } else {
      flush();
      runStart = t.start.line;
      runEnd = t.start.line;
    }
  }
  flush();
  return out;
};

/**
 * The LEADING import block — the run of `import` statements a file opens with,
 * comments between them included, from the first `import` keyword to the last
 * statement's path literal.
 *
 * Statement extent follows `parseImport` (compiler/parser.vl): an import runs
 * to its `"…"` path literal, and a newline at brace depth 0 ends it early (a
 * half-typed `import { a` is one line, not the rest of the file). Only the
 * leading block folds: an `import` further down is not part of the header a
 * reader wants collapsed, and `vl fmt` does not produce one.
 */
const importRange = (toks: readonly LexToken[]): VlFoldingRange | undefined => {
  const code = toks.filter((t) => t.kind !== "comment");
  let i = 0;
  let startLine = -1;
  let endLine = -1;
  while (i < code.length && code[i].kind === "ident" && code[i].s === "import") {
    if (startLine < 0) startLine = code[i].start.line;
    let depth = 0;
    let lastLine = code[i].end.line;
    let j = i + 1;
    let stmtEnd = -1;
    while (j < code.length) {
      const t = code[j];
      if (depth === 0 && t.start.line > lastLine) break; // NEWLINE ends it
      if (t.kind === "str") {
        stmtEnd = t.end.line; // the path literal — the statement ends here
        j++;
        break;
      }
      if (t.kind === "punct") {
        if (t.s === "{") depth++;
        else if (t.s === "}" && depth > 0) depth--;
      }
      lastLine = t.end.line;
      j++;
    }
    if (stmtEnd < 0) break; // an unfinished import: the block ends before it
    endLine = stmtEnd;
    i = j;
  }
  if (startLine < 0 || endLine <= startLine) return undefined;
  return { startLine, endLine, kind: "imports" };
};

/**
 * A construct's region as the seed's AST reports it: the HEADER line, not the line
 * the brace happens to sit on. The two differ whenever a signature wraps —
 * `function f(\n  a: i32,\n) {` opens its brace three lines below its name — and a
 * region starting at the brace makes VS Code's folding-model sticky scroll pin `) {`
 * instead of the function it belongs to.
 *
 * Same closing convention as a bracket region: the range ends one line ABOVE the
 * closing brace, so collapsing leaves the `}` on screen.
 */
const extentRanges = (
  extents: readonly FoldableExtent[],
): VlFoldingRange[] => {
  const out: VlFoldingRange[] = [];
  for (const e of extents) {
    const endLine = e.endLine - 1;
    if (endLine > e.headerLine) {
      out.push({ startLine: e.headerLine, endLine });
    }
  }
  return out;
};

/**
 * One construct the seed's `declExtentsAt` reported, reduced to the two lines
 * folding needs: where its header starts and where its closing brace sits (both
 * 0-based). `server.ts` maps `WasmExtent` onto this so folding depends on no seed
 * type — it is still the one handler that answers with no seed at all.
 */
export type FoldableExtent = {
  headerLine: number;
  endLine: number;
};

/**
 * Every foldable region of `source`, sorted outermost-first by start line and
 * free of duplicate line pairs (a `({` opened and `})` closed on the same two
 * lines is one chevron, not two).
 *
 * `extents` is the seed's declaration and block walk, and is optional on purpose:
 * with no seed loaded the lexical scan alone still folds every brace, which is why
 * this handler keeps working when every other one goes silent.
 *
 * ONE REGION MAY START ON A LINE, and that is why an extent EVICTS the bracket
 * regions sharing its start rather than joining them. VS Code keeps the first
 * region it sees per start line and silently drops the rest, so a wrapped
 * signature — `function f(` on one line, `) {` three lines down — would otherwise
 * lose the whole function to its own parameter list. Extents are in pre-order, so
 * the outermost construct claims a shared line first.
 */
export const foldingRanges = (
  source: string,
  extents: readonly FoldableExtent[] = [],
): VlFoldingRange[] => {
  const toks = tokenize(source, { comments: true });
  const ast: VlFoldingRange[] = [];
  const astStarts = new Set<number>();
  for (const r of extentRanges(extents)) {
    if (astStarts.has(r.startLine)) continue;
    astStarts.add(r.startLine);
    ast.push(r);
  }
  const all = [
    ...ast,
    ...bracketRanges(toks).filter((r) => !astStarts.has(r.startLine)),
    ...commentRanges(toks),
  ];
  const imports = importRange(toks);
  if (imports !== undefined) all.push(imports);
  all.sort((a, b) =>
    a.startLine - b.startLine ||
    b.endLine - a.endLine ||
    // A kinded range wins a tie so the dedup below never drops the label.
    (a.kind === undefined ? 1 : 0) - (b.kind === undefined ? 1 : 0)
  );
  const seen = new Set<string>();
  return all.filter((r) => {
    const key = `${r.startLine}:${r.endLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
