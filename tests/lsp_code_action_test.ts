// Unit tests for the LSP quick-fix (code action) edit logic (roadmap B17).
//
// The fixes are computed by PURE functions in `lsp/src/codeActions.ts` (no LSP
// connection needed): given the document text + a lint diagnostic's `code` and
// `range`, they return plain `{ range, newText }` text edits. These tests assert
// the produced edits, and — for the keyword/prefix fixes — APPLY the edit to the
// source and check the resulting text, so a regression in the offset math fails
// loudly.
//
// Run with: deno test -A --no-check tests/lsp_code_action_test.ts

import {
  type FixableDiagnostic,
  fixableDiagnosticsForRange,
  letToConstFix,
  type LspRange,
  type LspTextEdit,
  prefixWithUnderscoreFix,
  quickFixesForDiagnostic,
  removeBindingFix,
  removeImportFix,
} from "../lsp/src/codeActions.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// Apply a text edit to source (test helper). Edits may span multiple lines
// (the removal edit deletes from col 0 of one line to col 0 of the next).
const applyEdit = (source: string, edit: LspTextEdit): string => {
  const lines = source.split("\n");
  const { start, end } = edit.range;
  const prefix = lines.slice(0, start.line).join("\n") +
    (start.line > 0 ? "\n" : "") +
    lines[start.line].slice(0, start.character);
  const suffix = lines[end.line].slice(end.character) +
    (end.line + 1 < lines.length
      ? "\n" + lines.slice(end.line + 1).join("\n")
      : "");
  return prefix + edit.newText + suffix;
};

const rangeOf = (
  line: number,
  startCol: number,
  endCol: number,
): LspRange => ({
  start: { line, character: startCol },
  end: { line, character: endCol },
});

Deno.test("prefixWithUnderscoreFix inserts a leading `_` at the identifier", () => {
  // `let y = 1` — diagnostic range covers `y` (line 0, cols 4..5).
  const src = "let y = 1\n";
  const range = rangeOf(0, 4, 5);
  const fix = prefixWithUnderscoreFix(range);
  assert(fix.title === "Prefix with `_`", `title: ${fix.title}`);
  assert(fix.edits.length === 1, "one edit");
  const edit = fix.edits[0];
  // Zero-width insert at the identifier start.
  assert(
    edit.range.start.character === 4 && edit.range.end.character === 4,
    `expected zero-width insert at col 4, got ${JSON.stringify(edit.range)}`,
  );
  assert(edit.newText === "_", `newText: ${edit.newText}`);
  assert(
    applyEdit(src, edit) === "let _y = 1\n",
    `applied: ${JSON.stringify(applyEdit(src, edit))}`,
  );
});

Deno.test("prefixWithUnderscoreFix is the preferred unused-variable fix", () => {
  // VS Code's "Auto Fix" command applies only the `isPreferred` quick-fix, so
  // the SAFE underscore-prefix fix must be preferred for an unused binding.
  const fix = prefixWithUnderscoreFix(rangeOf(0, 4, 5));
  assert(fix.isPreferred === true, "prefix-with-underscore is preferred");
});

Deno.test("removeBindingFix is NOT preferred (destructive alternative)", () => {
  // The line-deleting fix must stay a non-preferred, manually-chosen quick-fix so
  // "Auto Fix" never silently removes code.
  const fix = removeBindingFix("let b = 2\n", rangeOf(0, 4, 5));
  assert(fix !== null, "fix produced");
  assert(fix!.isPreferred !== true, "remove-binding is not preferred");
});

Deno.test("removeBindingFix deletes the whole declaration line", () => {
  const src = "let a = 1\nlet b = 2\nlet c = 3\n";
  // Diagnostic on `b` (line 1).
  const fix = removeBindingFix(src, rangeOf(1, 4, 5));
  assert(fix !== null, "fix produced");
  const edit = fix!.edits[0];
  // Deletes line 1 entirely (col 0 of line 1 to col 0 of line 2).
  assert(
    applyEdit(src, edit) === "let a = 1\nlet c = 3\n",
    `applied: ${JSON.stringify(applyEdit(src, edit))}`,
  );
});

Deno.test("removeBindingFix on the last line deletes its content", () => {
  const src = "let a = 1\nlet b = 2";
  const fix = removeBindingFix(src, rangeOf(1, 4, 5));
  assert(fix !== null, "fix produced");
  assert(
    applyEdit(src, fix!.edits[0]) === "let a = 1\n",
    `applied: ${JSON.stringify(applyEdit(src, fix!.edits[0]))}`,
  );
});

// --- removeImportFix: unused import (remove specifier / whole line) ----------

Deno.test("removeImportFix deletes the whole line for a sole specifier", () => {
  // `import { add } from "./util"` — `add` at cols 9..12; it is the only
  // specifier, so the entire import line (and its trailing newline) is removed.
  const src = 'import { add } from "./util"\nprint(1)\n';
  const fix = removeImportFix(src, rangeOf(0, 9, 12));
  assert(fix !== null, "fix produced");
  assert(fix!.title === "Remove unused import", `title: ${fix!.title}`);
  assert(fix!.isPreferred !== true, "remove-import is not preferred (destructive)");
  assert(
    applyEdit(src, fix!.edits[0]) === "print(1)\n",
    `applied: ${JSON.stringify(applyEdit(src, fix!.edits[0]))}`,
  );
});

Deno.test("removeImportFix on the file's last line deletes its content", () => {
  const src = 'print(1)\nimport { add } from "./util"';
  const fix = removeImportFix(src, rangeOf(1, 9, 12));
  assert(fix !== null, "fix produced");
  assert(
    applyEdit(src, fix!.edits[0]) === "print(1)\n",
    `applied: ${JSON.stringify(applyEdit(src, fix!.edits[0]))}`,
  );
});

Deno.test("removeImportFix removes the FIRST of two specifiers", () => {
  // `import { a, b } from "./x"` — remove `a` (cols 9..10) → `{ b }`.
  const src = 'import { a, b } from "./x"\n';
  const fix = removeImportFix(src, rangeOf(0, 9, 10));
  assert(fix !== null, "fix produced");
  assert(
    applyEdit(src, fix!.edits[0]) === 'import { b } from "./x"\n',
    `applied: ${JSON.stringify(applyEdit(src, fix!.edits[0]))}`,
  );
});

Deno.test("removeImportFix removes the LAST of two specifiers", () => {
  // `import { a, b } from "./x"` — remove `b` (cols 12..13) → `{ a }`.
  const src = 'import { a, b } from "./x"\n';
  const fix = removeImportFix(src, rangeOf(0, 12, 13));
  assert(fix !== null, "fix produced");
  assert(
    applyEdit(src, fix!.edits[0]) === 'import { a } from "./x"\n',
    `applied: ${JSON.stringify(applyEdit(src, fix!.edits[0]))}`,
  );
});

Deno.test("removeImportFix removes a MIDDLE specifier (no dangling comma)", () => {
  // `import { a, b, c } from "./x"` — remove `b` (cols 12..13) → `{ a, c }`.
  const src = 'import { a, b, c } from "./x"\n';
  const fix = removeImportFix(src, rangeOf(0, 12, 13));
  assert(fix !== null, "fix produced");
  assert(
    applyEdit(src, fix!.edits[0]) === 'import { a, c } from "./x"\n',
    `applied: ${JSON.stringify(applyEdit(src, fix!.edits[0]))}`,
  );
});

Deno.test("removeImportFix removes the whole `x as y` alias specifier", () => {
  // `import { add as fn } from "./util"` — `fn` at cols 16..18; the only
  // specifier, so the whole line goes (and the `add as ` prefix with it).
  const src = 'import { add as fn } from "./util"\n';
  const fix = removeImportFix(src, rangeOf(0, 16, 18));
  assert(fix !== null, "fix produced");
  assert(
    applyEdit(src, fix!.edits[0]) === "",
    `applied: ${JSON.stringify(applyEdit(src, fix!.edits[0]))}`,
  );
});

Deno.test("removeImportFix removes an alias specifier among others", () => {
  // `import { a, x as y } from "./m"` — remove the alias `y` (cols 14..15) →
  // `{ a }`; the entire `x as y` specifier (cols 11..18) is dropped.
  const src = 'import { a, x as y } from "./m"\n';
  const fix = removeImportFix(src, rangeOf(0, 17, 18));
  assert(fix !== null, "fix produced");
  assert(
    applyEdit(src, fix!.edits[0]) === 'import { a } from "./m"\n',
    `applied: ${JSON.stringify(applyEdit(src, fix!.edits[0]))}`,
  );
});

Deno.test("unused-import dispatches ONLY the remove-import fix (no `_`-prefix)", () => {
  const src = 'import { a } from "./x"\n';
  const fixes = quickFixesForDiagnostic(src, "unused-import", rangeOf(0, 9, 10));
  assert(fixes.length === 1, `expected exactly one import fix, got ${fixes.length}`);
  assert(
    fixes[0].title === "Remove unused import",
    `unexpected fix title: ${fixes[0].title}`,
  );
  // Crucially: no `_`-prefix fix is offered for an import.
  assert(
    !fixes.some((f) => f.title === "Prefix with `_`"),
    "an unused import must NOT offer a `_`-prefix fix",
  );
});

Deno.test("letToConstFix rewrites `let` to `const` before the identifier", () => {
  // `let total = 1` — diagnostic range covers `total` (cols 4..9).
  const src = "let total = 1\n";
  const fix = letToConstFix(src, rangeOf(0, 4, 9));
  assert(fix !== null, "fix produced");
  assert(
    fix!.title === "Change `let` to `const`",
    `title: ${fix!.title}`,
  );
  assert(fix!.isPreferred === true, "preferred");
  const edit = fix!.edits[0];
  // Replaces `let` (cols 0..3) with `const`.
  assert(
    edit.range.start.character === 0 && edit.range.end.character === 3,
    `range: ${JSON.stringify(edit.range)}`,
  );
  assert(
    applyEdit(src, edit) === "const total = 1\n",
    `applied: ${JSON.stringify(applyEdit(src, edit))}`,
  );
});

Deno.test("letToConstFix returns null when there is no `let` keyword", () => {
  // A `const` line should never produce a let->const fix (defensive).
  const src = "const x = 1\n";
  assert(letToConstFix(src, rangeOf(0, 6, 7)) === null, "no fix for const");
});

Deno.test("letToConstFix preserves indentation", () => {
  const src = "function f(): i32 {\n  let v = 1\n  return v\n}\n";
  // `v` on line 1, cols 6..7 (after two-space indent + `let `).
  const fix = letToConstFix(src, rangeOf(1, 6, 7));
  assert(fix !== null, "fix produced");
  assert(
    applyEdit(src, fix!.edits[0]) ===
      "function f(): i32 {\n  const v = 1\n  return v\n}\n",
    `applied: ${JSON.stringify(applyEdit(src, fix!.edits[0]))}`,
  );
});

Deno.test("quickFixesForDiagnostic dispatches on diagnostic code", () => {
  const src = "let total = 1\n";
  // unused-variable -> remove + prefix (2 fixes).
  const unused = quickFixesForDiagnostic("let y = 1\n", "unused-variable", rangeOf(0, 4, 5));
  assert(unused.length === 2, `expected 2 unused fixes, got ${unused.length}`);
  assert(
    unused.some((f) => f.title === "Remove unused binding") &&
      unused.some((f) => f.title === "Prefix with `_`"),
    `titles: ${unused.map((f) => f.title).join(", ")}`,
  );

  // prefer-const -> let->const (1 fix).
  const preferConst = quickFixesForDiagnostic(src, "prefer-const", rangeOf(0, 4, 9));
  assert(
    preferConst.length === 1 &&
      preferConst[0].title === "Change `let` to `const`",
    `prefer-const fixes: ${JSON.stringify(preferConst.map((f) => f.title))}`,
  );

  // Unknown code -> no fixes.
  const none = quickFixesForDiagnostic(src, "unreachable-code", rangeOf(0, 0, 1));
  assert(none.length === 0, `expected no fixes for unknown code, got ${none.length}`);
});

// `prefer-const`'s diagnostic range sits on the `let` keyword (cols 0..3). A
// natural cursor lands on the variable name instead, so VS Code does not include
// the diagnostic in `context.diagnostics`. The server folds in cached `vital`
// diagnostics whose range line overlaps the request to keep the fix discoverable.
const preferConstDiag = (line: number): FixableDiagnostic => ({
  code: "prefer-const",
  source: "vital",
  range: rangeOf(line, 0, 3), // the `let` keyword
});

Deno.test("fixableDiagnosticsForRange surfaces a cached fix on the cursor's line", () => {
  // `let total = 1` — cursor on `total` (cols 6..6, a collapsed selection), the
  // diagnostic is on `let` (cols 0..3) so VS Code passes no context diagnostics.
  const cursor = rangeOf(0, 6, 6);
  const got = fixableDiagnosticsForRange([], [preferConstDiag(0)], cursor);
  assert(got.length === 1, `expected the cached fix, got ${got.length}`);
  assert(got[0].code === "prefer-const", `code: ${got[0].code}`);
});

Deno.test("fixableDiagnosticsForRange ignores cached diagnostics on other lines", () => {
  // Cursor on line 2; the only cached diagnostic is on line 0 — no overlap.
  const got = fixableDiagnosticsForRange([], [preferConstDiag(0)], rangeOf(2, 0, 0));
  assert(got.length === 0, `expected no fixes off-line, got ${got.length}`);
});

Deno.test("fixableDiagnosticsForRange de-duplicates context vs cached", () => {
  // The same diagnostic in both the editor-supplied and cached sets is offered
  // once (keyed by code + range).
  const diag = preferConstDiag(0);
  const got = fixableDiagnosticsForRange([diag], [diag], rangeOf(0, 0, 0));
  assert(got.length === 1, `expected dedup to one, got ${got.length}`);
});

Deno.test("fixableDiagnosticsForRange only surfaces `vital` diagnostics", () => {
  const foreign: FixableDiagnostic = {
    code: "prefer-const",
    source: "eslint",
    range: rangeOf(0, 0, 3),
  };
  const fromContext = fixableDiagnosticsForRange([foreign], [], rangeOf(0, 0, 0));
  const fromCache = fixableDiagnosticsForRange([], [foreign], rangeOf(0, 0, 0));
  assert(fromContext.length === 0, "non-vital context diagnostic ignored");
  assert(fromCache.length === 0, "non-vital cached diagnostic ignored");
});

Deno.test("cached prefer-const diagnostic yields the let->const fix end to end", () => {
  // The full discoverability path: cursor on the variable name, diagnostic cached
  // on the `let` keyword → the diagnostic surfaces and produces the const fix.
  const src = "let total = 1\n";
  const cursor = rangeOf(0, 6, 6); // on `total`
  const surfaced = fixableDiagnosticsForRange([], [preferConstDiag(0)], cursor);
  assert(surfaced.length === 1, "diagnostic surfaced");
  const fixes = quickFixesForDiagnostic(src, surfaced[0].code, rangeOf(0, 4, 9));
  assert(
    fixes.length === 1 && fixes[0].title === "Change `let` to `const`",
    `fixes: ${JSON.stringify(fixes.map((f) => f.title))}`,
  );
});
