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
  letToConstFix,
  type LspRange,
  type LspTextEdit,
  prefixWithUnderscoreFix,
  quickFixesForDiagnostic,
  removeBindingFix,
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
