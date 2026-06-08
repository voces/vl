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
 *
 * This is the SAFE default for an unused binding (it never deletes code), so it
 * is the `isPreferred` fix — the one VS Code's "Auto Fix" command applies — while
 * `removeBindingFix` stays a non-preferred, manually-chosen alternative.
 */
export const prefixWithUnderscoreFix = (range: LspRange): QuickFix => ({
  title: "Prefix with `_`",
  kind: "quickfix",
  isPreferred: true,
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

/** One `import` specifier located on the line: its content's [start, end) cols. */
type ImportSpecifierSpan = { contentStart: number; contentEnd: number };

/**
 * Parse the specifier list of an `import { … } from "…"` line into the content
 * span (leading/trailing whitespace trimmed) of each comma-separated specifier.
 * Returns `null` if the line has no `{ … }` clause. A trailing comma yields no
 * extra (empty) specifier. Columns are 0-based offsets into `line`.
 *
 * Specifiers are simple (`name` or `name as local`) with no nesting, so a flat
 * comma split is exact — there are no commas inside a specifier to escape.
 */
const importSpecifierSpans = (line: string): ImportSpecifierSpan[] | null => {
  const lbrace = line.indexOf("{");
  const rbrace = line.indexOf("}", lbrace + 1);
  if (lbrace < 0 || rbrace < 0) return null;
  const spans: ImportSpecifierSpan[] = [];
  // Walk each comma-delimited segment in (lbrace, rbrace), trimming whitespace to
  // get the actual content span. An all-whitespace segment (e.g. after a trailing
  // comma) is skipped so it never becomes a phantom specifier.
  let segStart = lbrace + 1;
  const pushSeg = (from: number, to: number): void => {
    let s = from;
    let e = to;
    while (s < e && /\s/.test(line[s])) s++;
    while (e > s && /\s/.test(line[e - 1])) e--;
    if (e > s) spans.push({ contentStart: s, contentEnd: e });
  };
  for (let i = lbrace + 1; i < rbrace; i++) {
    if (line[i] === ",") {
      pushSeg(segStart, i);
      segStart = i + 1;
    }
  }
  pushSeg(segStart, rbrace);
  return spans;
};

/**
 * Quick-fix for an `unused-import` diagnostic: remove the unused import. The
 * diagnostic range starts at the imported LOCAL name (`a`, or the `as`-alias `y`
 * in `{ x as y }`), which sits inside exactly one specifier of the `import { … }`
 * clause on that line.
 *
 *   - Only specifier (`import { a } from "./x"`) → delete the ENTIRE import line,
 *     including its trailing newline (nothing is left to import).
 *   - Otherwise delete just that specifier and one adjacent comma so no dangling
 *     or leading comma remains:
 *       · not the last specifier → delete from its content start up to the next
 *         specifier's content start (drops `a, ` → `{ b }` from `{ a, b }`).
 *       · the last specifier      → delete from the previous specifier's content
 *         end through this one's end (drops `, b` → `{ a }` from `{ a, b }`).
 *     For `{ x as y }` the whole `x as y` specifier is the content span, so the
 *     entire alias clause is removed.
 *
 * Returns `null` when the line is out of range or has no `{ … }` clause / no
 * specifier under the diagnostic range (defensive — the lint always points at a
 * real import local).
 *
 * Like `removeBindingFix` this DELETES code, so it is not `isPreferred` (Auto Fix
 * never silently removes an import); but it is the ONLY fix offered for an unused
 * import — there is no `_`-prefix alternative (prefixing would require aliasing).
 */
export const removeImportFix = (
  source: string,
  range: LspRange,
): QuickFix | null => {
  const lines = splitLines(source);
  const lineIdx = range.start.line;
  if (lineIdx < 0 || lineIdx >= lines.length) return null;
  const line = lines[lineIdx];
  const specs = importSpecifierSpans(line);
  if (!specs || specs.length === 0) return null;

  // The target specifier is the one whose content span covers the diagnostic
  // start column (the local-identifier position).
  const col = range.start.character;
  const target = specs.findIndex(
    (s) => col >= s.contentStart && col <= s.contentEnd,
  );
  if (target < 0) return null;

  // Only specifier → remove the whole import line (incl. its trailing newline,
  // or to end-of-line when it is the last line of the file).
  if (specs.length === 1) {
    const end: LspPosition = lineIdx + 1 < lines.length
      ? { line: lineIdx + 1, character: 0 }
      : { line: lineIdx, character: line.length };
    return {
      title: "Remove unused import",
      kind: "quickfix",
      edits: [{
        range: { start: { line: lineIdx, character: 0 }, end },
        newText: "",
      }],
    };
  }

  // Multi-specifier: drop this specifier plus exactly one neighbouring comma.
  let delStart: number;
  let delEnd: number;
  if (target < specs.length - 1) {
    // Not the last: delete up to the next specifier's content start (its comma
    // and the whitespace after it go too).
    delStart = specs[target].contentStart;
    delEnd = specs[target + 1].contentStart;
  } else {
    // Last specifier: delete back from the previous specifier's content end
    // (taking the comma before this one and the whitespace around it).
    delStart = specs[target - 1].contentEnd;
    delEnd = specs[target].contentEnd;
  }
  return {
    title: "Remove unused import",
    kind: "quickfix",
    edits: [{
      range: {
        start: { line: lineIdx, character: delStart },
        end: { line: lineIdx, character: delEnd },
      },
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
 * A lint diagnostic reduced to the fields code-action discovery needs: its
 * stable `code`, `source`, and `range`. Both the editor-supplied diagnostics and
 * the server's cached `VLDiagnostic`s structurally satisfy this shape.
 */
export type FixableDiagnostic = {
  code?: string | number;
  source?: string;
  range: LspRange;
};

/** Whether two ranges share any physical line. */
const rangeLinesOverlap = (a: LspRange, b: LspRange): boolean =>
  a.start.line <= b.end.line && a.end.line >= b.start.line;

/**
 * The set of `vital` lint diagnostics to offer fixes for in `onCodeAction`,
 * given the editor-supplied diagnostics (pre-filtered to the requested range)
 * and the server's most-recently-cached diagnostics for the document.
 *
 * The editor-supplied set is primary; we additionally surface any cached `vital`
 * diagnostic whose range line overlaps `requestRange`, so a fix is still offered
 * when the cursor sits on the binding's line but off the diagnostic's exact range
 * (e.g. on the variable name while `prefer-const` points at the `let` keyword).
 * De-duplicated by `code` + range so a diagnostic in both sources is offered once.
 */
export const fixableDiagnosticsForRange = <D extends FixableDiagnostic>(
  contextDiagnostics: D[],
  cachedDiagnostics: D[],
  requestRange: LspRange,
): D[] => {
  const result: D[] = [];
  const seen = new Set<string>();
  const key = (d: D) =>
    `${d.code}:${d.range.start.line}:${d.range.start.character}:` +
    `${d.range.end.line}:${d.range.end.character}`;
  const add = (d: D) => {
    if (d.source !== "vital") return;
    const k = key(d);
    if (seen.has(k)) return;
    seen.add(k);
    result.push(d);
  };
  for (const d of contextDiagnostics) add(d);
  for (const d of cachedDiagnostics) {
    if (rangeLinesOverlap(d.range, requestRange)) add(d);
  }
  return result;
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
    case "unused-import": {
      // Imports get ONLY the remove-import fix — no `_`-prefix (that would need
      // aliasing, not a bare `_`-insert). Removes the specifier, or the whole
      // `import` line when it was the only one.
      const remove = removeImportFix(source, range);
      return remove ? [remove] : [];
    }
    case "prefer-const": {
      const fix = letToConstFix(source, range);
      return fix ? [fix] : [];
    }
    default:
      return [];
  }
};
