// D9.1 document highlights: same-file occurrences of the symbol under the
// cursor, off the SELF-HOSTED checker — `referencesAt` verbatim for the spans,
// `definitionAt` to classify the declaration as the Write occurrence, and the
// pure `documentHighlightsFromRefs` shaping (typeFeatures.ts) between them.
// The seed-backed tests load the real seed (`build/vl-compiler.wasm`); absent
// (fresh clone, no `refresh-compiler.sh` yet) they self-ignore, the same
// convention as the rest of the wasm suite.

import {
  documentHighlightsFromRefs,
  type LspRange,
} from "../lsp/src/typeFeatures.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;
const log = (_m: string) => {};

const range = (
  line: number,
  start: number,
  end: number,
): LspRange => ({
  start: { line, character: start },
  end: { line, character: end },
});

// ---- pure shaping -----------------------------------------------------------

Deno.test("document-highlight: the declaration occurrence is the write, uses are reads", () => {
  const refs = [range(0, 4, 5), range(1, 6, 7), range(1, 10, 11)];
  const highlights = documentHighlightsFromRefs(refs, range(0, 4, 5));
  if (highlights.length !== 3) {
    throw new Error(`want 3 highlights, got ${highlights.length}`);
  }
  const kinds = highlights.map((h) => h.kind);
  if (kinds[0] !== "write" || kinds[1] !== "read" || kinds[2] !== "read") {
    throw new Error(`want [write, read, read], got ${JSON.stringify(kinds)}`);
  }
  // The spans pass through untouched.
  if (JSON.stringify(highlights.map((h) => h.range)) !== JSON.stringify(refs)) {
    throw new Error("want the reference spans verbatim");
  }
});

Deno.test("document-highlight: no known declaration degrades every occurrence to read", () => {
  const refs = [range(0, 4, 5), range(1, 6, 7)];
  const highlights = documentHighlightsFromRefs(refs, undefined);
  if (highlights.some((h) => h.kind !== "read")) {
    throw new Error(
      `want all reads without a decl, got ${JSON.stringify(highlights)}`,
    );
  }
});

Deno.test("document-highlight: a decl span matching no occurrence marks nothing write", () => {
  const refs = [range(2, 0, 3)];
  const highlights = documentHighlightsFromRefs(refs, range(9, 0, 3));
  if (highlights[0].kind !== "read") {
    throw new Error(`want read, got ${highlights[0].kind}`);
  }
});

// ---- seed-backed: the real reference/definition queries ---------------------

// `n` declared on line 0 col 4, used twice on line 1 (cols 6 and 10).
const src = "let n = 1\nprint(n + n)\n";
const key = "/proj/main.vl";
const read = (k: string): string | undefined => (k === key ? src : undefined);

Deno.test({
  name: "document-highlight(wasm): decl + uses light up, decl classified write",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // Cursor on the USE at line 1 col 6 — highlights still cover the decl.
  const refs = await checker.referencesAt(src, key, read, 1, 6, true);
  if (refs.length !== 3) {
    throw new Error(`want 3 occurrences of n, got ${JSON.stringify(refs)}`);
  }
  const decl = await checker.definitionAt(src, key, read, 1, 6);
  if (decl === undefined) throw new Error("want a declaring span for n");
  const highlights = documentHighlightsFromRefs(refs, decl);
  const writes = highlights.filter((h) => h.kind === "write");
  if (writes.length !== 1) {
    throw new Error(`want exactly one write, got ${JSON.stringify(highlights)}`);
  }
  if (writes[0].range.start.line !== 0 || writes[0].range.start.character !== 4) {
    throw new Error(
      `want the write at 0:4 (the decl), got ${JSON.stringify(writes[0].range)}`,
    );
  }
  if (highlights.filter((h) => h.kind === "read").length !== 2) {
    throw new Error(`want two reads, got ${JSON.stringify(highlights)}`);
  }
});

Deno.test({
  name: "document-highlight(wasm): a cursor off any binding yields no occurrences",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // Line 1 col 0 is `p` of the builtin `print` call — not a tracked user binding.
  const refs = await checker.referencesAt(src, key, read, 1, 0, true);
  if (refs.length !== 0) {
    throw new Error(`want no occurrences, got ${JSON.stringify(refs)}`);
  }
});
