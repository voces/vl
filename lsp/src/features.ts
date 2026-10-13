// LSP features over the shared `WasmChecker`, as pure functions of (text, checker).
// `server.ts` is transport: it fetches the document, calls in here and returns the
// result. A feature moves here when it has no connection or document-store
// dependency; the playground adapter can then call the same function.
//
// Imports no `vscode-languageserver` runtime values, so the module loads in the
// playground bundle and under plain Deno.

import { foldingRanges, type VlFoldingKind } from "./folding.ts";
import type { WasmChecker } from "./wasmChecker.ts";

/**
 * A protocol `FoldingRange` (lines only; see `folding.ts` for why no columns).
 * `kind` is the protocol's own string: `FoldingRangeKind.Comment` is "comment"
 * and `FoldingRangeKind.Imports` is "imports", which `VlFoldingKind` mirrors.
 */
export type FeatureFoldingRange = {
  startLine: number;
  endLine: number;
  kind?: VlFoldingKind;
};

/**
 * Foldable regions of `text`. `checker` is optional: without a seed the lexical
 * scan alone folds every brace, and the declaration extents (which start at the
 * header line rather than the brace) are simply absent.
 */
export const foldingRangesAt = (
  text: string,
  checker: Pick<WasmChecker, "declExtentsAt"> | undefined,
): FeatureFoldingRange[] => {
  const extents = (checker?.declExtentsAt(text) ?? []).map((e) => ({
    headerLine: e.header.line,
    endLine: e.range.end.line,
  }));
  return foldingRanges(text, extents).map((r) => {
    const range: FeatureFoldingRange = {
      startLine: r.startLine,
      endLine: r.endLine,
    };
    if (r.kind !== undefined) range.kind = r.kind;
    return range;
  });
};
