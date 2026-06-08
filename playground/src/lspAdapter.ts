// Browser-side "language server" adapter for the playground.
//
// VL has no server process: its compiler and LSP feature-helpers are pure TS
// (compile.ts is binaryen-free on the check path; typeFeatures.ts depends only on
// the symbol table + AST). So the same logic the Node LSP (`lsp/src/server.ts`)
// runs per request, we run *client-side* on the current editor text. This module
// is the bridge — it imports ONLY the pure helpers (never `lsp/src/server.ts`,
// which is Node-bound via `vscode-languageserver`) and returns plain, Monaco-free
// data (positions, ranges, token arrays). `main.ts` maps these onto the Monaco
// provider shapes, so this stays a pure transform that mirrors `server.ts`.
//
// Position convention: VL spans / the symbol table use 1-based line / 0-based
// column (`Position`). The helpers here accept and return 0-based line / 0-based
// character (the LSP wire form, which is also what Monaco uses minus a +1 on the
// line — Monaco is 1-based line / 1-based column; `main.ts` bridges that). We
// keep this module in LSP coordinates so it matches `server.ts` exactly.

import {
  checkOnly,
  parseSymbols,
  stringifyType,
  type VLDiagnostic,
} from "../../compiler/compile.ts";
import { tokenize } from "../../compiler/lexer.ts";
import {
  deriveInlayHints,
  type LspRange,
  resolveMemberAt,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensData,
} from "../../lsp/src/typeFeatures.ts";
import {
  fixableDiagnosticsForRange,
  type LspTextEdit,
  type QuickFix,
  quickFixesForDiagnostic,
} from "../../lsp/src/codeActions.ts";

export type { LspTextEdit, QuickFix, VLDiagnostic };
export { SEMANTIC_TOKEN_LEGEND };

/** LSP 0-based line / 0-based character — the wire form `server.ts` speaks. */
export type LspPosition = { line: number; character: number };

// LSP position (0-based line) → VL `Position` (1-based line, 0-based column),
// exactly the `toVLPosition` bridge `server.ts` uses.
const toVLPosition = (p: LspPosition) => ({ line: p.line + 1, column: p.character });

// ---- diagnostics -----------------------------------------------------------

/**
 * Run the codegen-free front end and return its diagnostics (parse + type errors
 * plus the B17 lint, which tags unused/`_`-hint bindings `unnecessary`). This is
 * what drives the editor squiggles; the heavier `compile` (codegen) only runs on
 * Run. `checkOnly` is synchronous and binaryen-free, so it's cheap to call on
 * every (debounced) keystroke.
 */
export const diagnostics = (text: string): VLDiagnostic[] =>
  checkOnly(text).diagnostics;

// ---- semantic tokens -------------------------------------------------------

/**
 * The delta-encoded semantic-token `data` array for the whole document — the same
 * stream `server.ts` returns for `textDocument/semanticTokens/full`. Identifiers
 * are classified by their resolved binding kind via the symbol table, merged with
 * a lexical pass for literals/keywords/operators and recovered comments, plus
 * member names (`o.x`, `xs.get`) typed from the AST.
 */
export const semanticTokens = (text: string): number[] => {
  const { tokens } = tokenize(text);
  const { symbols, ast, spans } = checkOnly(text);
  return semanticTokensData(symbols, tokens, text, ast, spans);
};

// ---- hover -----------------------------------------------------------------

/** A resolved hover: the markdown-ish body plus the source range it covers. */
export type HoverResult = {
  /** `name: type` body, rendered by `main.ts` as a fenced `vital` code block. */
  contents: string;
  /** 0-based range of the hovered identifier/member, for Monaco's hover box. */
  range?: { start: LspPosition; end: LspPosition };
};

// A `Context` (1-based line / 0-based col) → an LSP 0-based range.
const ctxToLspRange = (
  ctx: { start: { line: number; column: number }; stop: { line: number; column: number } },
): { start: LspPosition; end: LspPosition } => ({
  start: { line: ctx.start.line - 1, character: ctx.start.column },
  end: { line: ctx.stop.line - 1, character: ctx.stop.column },
});

/**
 * Resolve the type at `pos`, mirroring `server.ts`'s `onHover` resolution order:
 *   1. the D2 symbol table (locals/params/functions/type aliases carry a type);
 *   2. failing that, a member name in `receiver.member`, typed from the AST;
 *   3. failing that, a top-level scope name (a builtin / declared type).
 * Returns `null` when the cursor isn't on anything typeable.
 */
export const hover = (text: string, pos: LspPosition): HoverResult | null => {
  const vlPos = toVLPosition(pos);

  // 1. Symbol-table binding.
  const symbols = parseSymbols(text);
  const occ = symbols.occurrenceAt(vlPos);
  if (occ?.binding.type) {
    return {
      contents: `${occ.binding.name}: ${stringifyType(occ.binding.type)}`,
      range: ctxToLspRange(occ.span),
    };
  }

  // 2. Member-aware hover (`o.x`, `xs.get`, `s.length`).
  const { ast, spans } = checkOnly(text);
  if (ast && spans) {
    const member = resolveMemberAt(ast, spans, vlPos);
    if (member) {
      return {
        contents: `${member.name}: ${stringifyType(member.type)}`,
        range: ctxToLspRange(member.span),
      };
    }
  }

  // 3. Top-level scope fallback (builtins / declared types) — the program scope
  // hangs off the AST node, keyed by the bare word under the cursor.
  const word = wordAt(text, pos);
  if (word) {
    const type = ast?.scope?.[word.text];
    if (type) {
      return { contents: `${word.text}: ${stringifyType(type)}`, range: word.range };
    }
  }
  return null;
};

// The identifier straddling the cursor (`[A-Za-z_][A-Za-z0-9_]*`), with its
// 0-based range, or null. Mirrors `server.ts`'s `wordAt` but also returns the
// span so the fallback hover can highlight it.
const wordAt = (
  text: string,
  pos: LspPosition,
): { text: string; range: { start: LspPosition; end: LspPosition } } | null => {
  const line = text.split("\n")[pos.line] ?? "";
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  let start = pos.character;
  let end = pos.character;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  while (end < line.length && isWordChar(line[end])) end++;
  if (start === end) return null;
  const word = line.slice(start, end);
  if (!/^[A-Za-z_]/.test(word)) return null; // reject numeric literals
  return {
    text: word,
    range: {
      start: { line: pos.line, character: start },
      end: { line: pos.line, character: end },
    },
  };
};

// ---- inlay hints (stretch / D6) --------------------------------------------

/** One inferred-type inlay hint, in LSP 0-based coordinates. */
export type InlayHint = { line: number; character: number; label: string };

/**
 * Inferred-type inlay hints for the (visible) range, mirroring `server.ts`'s
 * inlay-hint handler: surface the inferred type after each *unannotated*
 * declaration (`let x` → `x: i32`). Already-annotated declarations are
 * suppressed (the source is passed so `deriveInlayHints` can tell).
 */
export const inlayHints = (text: string, range: LspRange): InlayHint[] =>
  deriveInlayHints(parseSymbols(text), stringifyType, range, text).map((h) => ({
    line: h.line,
    character: h.char,
    label: h.label,
  }));

// ---- go-to-definition (stretch / D2) ---------------------------------------

/**
 * The defining span of the binding under `pos`, in LSP 0-based coordinates, or
 * null — the data behind go-to-definition. Mirrors `server.ts`'s `onDefinition`.
 */
export const definition = (
  text: string,
  pos: LspPosition,
): { start: LspPosition; end: LspPosition } | null => {
  const decl = parseSymbols(text).definitionAt(toVLPosition(pos));
  return decl ? ctxToLspRange(decl) : null;
};

// ---- quick-fixes (code actions / B17) --------------------------------------

/**
 * Quick-fixes for the lint diagnostics overlapping `range`, mirroring
 * `server.ts`'s `onCodeAction` exactly. The editor passes the markers it holds
 * (`contextDiagnostics`) AND we re-derive the current diagnostics (`text`'s own
 * `vital` lints) as the "cached" set — the equivalent of `server.ts`'s
 * `diagnosticsByUri` cache. `fixableDiagnosticsForRange` keeps only `vital`-sourced
 * diagnostics, de-dupes them, and folds in any cached one on an overlapping line
 * (so a fix is still offered when the cursor sits on the binding line but off the
 * diagnostic's exact span — e.g. on the name while `prefer-const` points at `let`).
 * `quickFixesForDiagnostic` then dispatches on each diagnostic's `code`:
 *   - `unused-variable` → remove-binding (alt) + prefix-`_` (preferred)
 *   - `unused-import`   → remove-import
 *   - `prefer-const`    → `let`→`const`
 * Each returned `QuickFix` carries plain 0-based LSP text edits; `main.ts` wraps
 * them into Monaco `CodeAction`s (1-based) with a `WorkspaceEdit`.
 */
export const codeActions = (
  text: string,
  range: LspRange,
  contextDiagnostics: VLDiagnostic[] = [],
): QuickFix[] => {
  const cached = diagnostics(text);
  const fixable = fixableDiagnosticsForRange(contextDiagnostics, cached, range);
  const fixes: QuickFix[] = [];
  for (const d of fixable) {
    fixes.push(...quickFixesForDiagnostic(text, d.code, d.range));
  }
  return fixes;
};
