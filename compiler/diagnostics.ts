// Neutral diagnostic vocabulary — the LSP-facing diagnostic shape, with NO
// dependency on the compiler core (lexer/parser/typecheck/emit). Both the
// compiler (`compile.ts`, which re-exports these for its existing consumers) and
// the LSP host import these types from here, so an LSP module that only needs the
// diagnostic shape does not pull in the whole compiler through `compile.ts` — a
// step toward the LSP depending only on the self-hosted wasm checker (kill-TS).

// `hint` is the lowest tier: VS Code renders it with NO squiggle and keeps it out
// of the warning/error count. Combined with the `unnecessary` tag it greys out the
// span (used for `_`-prefixed intentionally-unused bindings). Hints must never
// count toward the CLI error/warning tally or fail the test harness.
export type VLSeverity = "error" | "warning" | "info" | "hint";

export type VLPosition = { line: number; character: number };
export type VLRange = { start: VLPosition; end: VLPosition };

// LSP diagnostic tags (LSP `DiagnosticTag`): `unnecessary` renders the span
// faded/greyed out (VS Code dims unused/unreachable code rather than only
// squiggling it); `deprecated` strikes it through. The lint pass tags
// unused-variable / unreachable-code as `unnecessary`.
export type VLDiagnosticTag = "unnecessary" | "deprecated";

export type VLDiagnostic = {
  message: string;
  severity: VLSeverity;
  range: VLRange;
  code?: string | number;
  source: "vital";
  tags?: VLDiagnosticTag[];
};
