// Re-export shim: the reader moved to `compiler/vlSrcSection.ts` (ROADMAP row 22) so the
// browser playground and the test hosts share ONE copy. Existing test imports of
// `./vlSrcSection.ts` keep resolving through here.
export * from "../../compiler/vlSrcSection.ts";
export type { SrcMap, SrcRow } from "../../compiler/vlSrcSection.ts";
