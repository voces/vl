// LSP quick-fix (code action) computation for VL lint diagnostics (B17).
//
// PURE logic only — no `vscode-languageserver` runtime types. Each fix is
// derived from a lint diagnostic's stable `code` plus its precise `range`
// (identifier span) and the document text, producing plain `{ range, newText }`
// text edits. `server.ts` wraps these in `CodeAction`/`WorkspaceEdit` envelopes;
// keeping the edit math here makes it Deno-checkable and unit-testable without
// standing up an LSP connection.
//
// LSP ranges are 0-based line / 0-based character (the shape the lint pass
// already emits, via `rangeFromCtx`).

export type LspPosition = { line: number; character: number };
export type LspRange = { start: LspPosition; end: LspPosition };
export type LspTextEdit = { range: LspRange; newText: string };

/** A computed quick-fix: a title plus the edits that apply it. */
export type QuickFix = {
  title: string;
  /** Stable id so the server can pick a `CodeActionKind` / ordering. */
  kind: "quickfix";
  /** True for the diagnostic's "preferred" (default) fix. */
  isPreferred?: boolean;
  edits: LspTextEdit[];
};

/** Split document text into physical lines (LSP line indices index this). */
const splitLines = (source: string): string[] => source.split("\n");

/**
 * Quick-fix for an `unused-variable` diagnostic: insert a leading `_` at the
 * identifier start, marking it intentionally unused. The diagnostic `range`
 * starts at the identifier, so a zero-width insert there is exact and robust.
 */
export const prefixWithUnderscoreFix = (range: LspRange): QuickFix => ({
  title: "Prefix with `_`",
  kind: "quickfix",
  edits: [{
    range: { start: range.start, end: range.start },
    newText: "_",
  }],
});

/**
 * Quick-fix for an `unused-variable` diagnostic: remove the binding's whole
 * declaration line. The diagnostic range covers only the identifier, so we
 * delete the entire physical line it sits on (`let x = …` is a single-line
 * statement in idiomatic VL). Returns `null` when the line is out of range.
 */
export const removeBindingFix = (
  source: string,
  range: LspRange,
): QuickFix | null => {
  const lines = splitLines(source);
  const line = range.start.line;
  if (line < 0 || line >= lines.length) return null;
  // Delete from column 0 of this line to column 0 of the next line (drops the
  // line and its trailing newline). On the last line, delete to its end.
  const end: LspPosition = line + 1 < lines.length
    ? { line: line + 1, character: 0 }
    : { line, character: lines[line].length };
  return {
    title: "Remove unused binding",
    kind: "quickfix",
    edits: [{
      range: { start: { line, character: 0 }, end },
      newText: "",
    }],
  };
};

/**
 * Quick-fix for a `prefer-const` diagnostic: a never-reassigned `let` should be
 * `const`. We find the `let` keyword on the diagnostic's line and replace it with
 * `const`. This works regardless of whether the diagnostic range points at the
 * `let` keyword itself (the lint's current behaviour — the actionable token) or
 * at the variable identifier (its historical position): in both cases the first
 * `let` word on the line is the declaration keyword. Returns `null` if no `let`
 * keyword is found at/before the diagnostic range start.
 */
export const letToConstFix = (
  source: string,
  range: LspRange,
): QuickFix | null => {
  const lines = splitLines(source);
  const line = range.start.line;
  if (line < 0 || line >= lines.length) return null;
  const text = lines[line];
  // Match `let` as a whole word at/before the diagnostic start — the first `let`
  // word on the line is the declaration keyword. `>` (not `>=`) so a range that
  // starts exactly ON the `let` keyword (the lint's current range) is accepted.
  const m = /\blet\b/.exec(text);
  if (!m || m.index > range.start.character) return null;
  return {
    title: "Change `let` to `const`",
    kind: "quickfix",
    isPreferred: true,
    edits: [{
      range: {
        start: { line, character: m.index },
        end: { line, character: m.index + "let".length },
      },
      newText: "const",
    }],
  };
};

/**
 * All quick-fixes offered for one lint diagnostic, dispatched on its `code`.
 * `code`/`range` come straight from the `VLDiagnostic`. Unknown codes yield no
 * fixes (the caller simply offers nothing).
 */
export const quickFixesForDiagnostic = (
  source: string,
  code: string | number | undefined,
  range: LspRange,
): QuickFix[] => {
  switch (code) {
    case "unused-variable": {
      const fixes: QuickFix[] = [];
      const remove = removeBindingFix(source, range);
      if (remove) fixes.push(remove);
      fixes.push(prefixWithUnderscoreFix(range));
      return fixes;
    }
    case "prefer-const": {
      const fix = letToConstFix(source, range);
      return fix ? [fix] : [];
    }
    default:
      return [];
  }
};
