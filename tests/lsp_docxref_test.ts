// Unit tests for D7: rustdoc-style intra-doc cross-references in `///` doc-
// comments. Tests the pure helper `linkifyDocRefs` and the combined rendering
// path `docMarkdown` (both in `lsp/src/typeFeatures.ts`), then an end-to-end
// check that the binding-hover path (mirroring `server.ts`) surfaces links when
// a doc-comment references another top-level symbol.
//
// `server.ts` cannot be imported under Deno (Node-only `vscode-languageserver`),
// so we drive the pure helpers directly, the same way all other lsp_*_test.ts
// files do. Run with:
//   deno test -A --no-check tests/lsp_docxref_test.ts
// (also included in `deno task test`).

import { parseSymbols, stringifyType } from "../compiler/compile.ts";
import {
  docMarkdown,
  linkifyDocRefs,
  type DocRefResolver,
} from "../lsp/src/typeFeatures.ts";
import type { Position } from "../compiler/ast.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

// ---------------------------------------------------------------------------
// Helpers that mirror the server.ts logic (without importing the LSP package)
// ---------------------------------------------------------------------------

/**
 * Build a doc-ref resolver from a symbol table, mirroring `buildDocRefResolver`
 * in `server.ts`. For testing we use a simple "file://test#Lline" URI format
 * so the output is stable and inspectable.
 */
const buildTestResolver = (
  symbols: ReturnType<typeof parseSymbols>,
): DocRefResolver => {
  // Collect all declaration occurrences; prefer the widest scope (top-level).
  const byName = new Map<string, { line: number; scopeLines: number }>();
  for (const occ of symbols.occurrences) {
    if (!occ.isDecl) continue;
    const { binding } = occ;
    const declLine = occ.span.start.line; // 1-based
    const scopeLines = binding.scope
      ? binding.scope.stop.line - binding.scope.start.line
      : 0;
    const existing = byName.get(binding.name);
    if (existing === undefined || scopeLines > existing.scopeLines) {
      byName.set(binding.name, { line: declLine, scopeLines });
    }
  }
  return (name: string): string | undefined => {
    const entry = byName.get(name);
    if (entry === undefined) return undefined;
    return `file://test#L${entry.line}`;
  };
};

/**
 * Reproduce the binding-hover string including D7 linkification.
 * Mirrors the `occ.binding.type` branch in `server.ts`'s `onHover`.
 */
const hoverAt = (
  src: string,
  pos: Position,
): string | null => {
  const symbols = parseSymbols(src);
  const occ = symbols.occurrenceAt(pos);
  if (!occ?.binding.type) return null;
  const aliasDepth = occ.binding.kind === "type" ? 1 : 0;
  const resolver = buildTestResolver(symbols);
  return docMarkdown(
    `${occ.binding.name}: ${stringifyType(occ.binding.type, new Set(), aliasDepth)}`,
    "vital",
    occ.binding.doc,
    resolver,
  );
};

/** Locate the first occurrence of `needle` on `line1` (1-based). */
const posOf = (src: string, line1: number, needle: string): Position => {
  const lineText = src.split("\n")[line1 - 1];
  const col = lineText.indexOf(needle);
  if (col < 0) throw new Error(`'${needle}' not found on line ${line1}`);
  return { line: line1, column: col };
};

// ---------------------------------------------------------------------------
// (1) linkifyDocRefs — pure rewrite helper
// ---------------------------------------------------------------------------

Deno.test("linkifyDocRefs: resolves [`Name`] to a markdown link", () => {
  const resolve: DocRefResolver = (n) =>
    n === "Foo" ? "file://test#L3" : undefined;
  const result = linkifyDocRefs("see [`Foo`]", resolve);
  assertEquals(result, "see [`Foo`](file://test#L3)");
});

Deno.test("linkifyDocRefs: resolves [Name] (no backtick) to a markdown link", () => {
  const resolve: DocRefResolver = (n) =>
    n === "Bar" ? "file://test#L7" : undefined;
  const result = linkifyDocRefs("see [Bar]", resolve);
  assertEquals(result, "see [Bar](file://test#L7)");
});

Deno.test("linkifyDocRefs: unresolved [Name] is left untouched", () => {
  const resolve: DocRefResolver = () => undefined; // nothing resolves
  const result = linkifyDocRefs("see [Unknown]", resolve);
  assertEquals(result, "see [Unknown]");
});

Deno.test("linkifyDocRefs: a full markdown link [text](url) is left untouched", () => {
  const resolve: DocRefResolver = (n) =>
    n === "Foo" ? "file://test#L1" : undefined;
  // [Foo](…) already has a url suffix — must NOT be re-written.
  const result = linkifyDocRefs("see [Foo](https://example.com)", resolve);
  assertEquals(result, "see [Foo](https://example.com)");
});

Deno.test("linkifyDocRefs: a [ref][id] link is left untouched", () => {
  const resolve: DocRefResolver = () => "file://test#L1"; // would match
  // [ref][id] — has a trailing `[…]` suffix so must NOT be rewritten.
  const result = linkifyDocRefs("[Foo][1]", resolve);
  assertEquals(result, "[Foo][1]");
});

Deno.test("linkifyDocRefs: identifiers inside a code fence are left verbatim", () => {
  const resolve: DocRefResolver = (n) =>
    n === "Foo" ? "file://test#L1" : undefined;
  const doc = "prose [`Foo`]\n```vital\n[`Foo`]\n```\nafter [`Foo`]";
  const result = linkifyDocRefs(doc, resolve);
  // Only prose occurrences linkified; the fenced line is untouched.
  assertEquals(
    result,
    "prose [`Foo`](file://test#L1)\n```vital\n[`Foo`]\n```\nafter [`Foo`](file://test#L1)",
  );
});

Deno.test("linkifyDocRefs: multiple references on one line are all resolved", () => {
  const resolve: DocRefResolver = (n) =>
    n === "A" ? "file://test#L1"
    : n === "B" ? "file://test#L2"
    : undefined;
  const result = linkifyDocRefs("[A] and [B] and [Unknown]", resolve);
  assertEquals(
    result,
    "[A](file://test#L1) and [B](file://test#L2) and [Unknown]",
  );
});

Deno.test("linkifyDocRefs: backtick is preserved in resolved link", () => {
  const resolve: DocRefResolver = (n) =>
    n === "Foo" ? "file://test#L5" : undefined;
  // Input: [`Foo`]  →  output: [`Foo`](url)  (backtick kept).
  assertEquals(
    linkifyDocRefs("[`Foo`]", resolve),
    "[`Foo`](file://test#L5)",
  );
});

// ---------------------------------------------------------------------------
// (2) docMarkdown — combined rendering with D7 resolver
// ---------------------------------------------------------------------------

Deno.test("docMarkdown: with resolver, [`Name`] in doc becomes a link", () => {
  const resolve: DocRefResolver = (n) =>
    n === "Foo" ? "file://test#L2" : undefined;
  const md = docMarkdown("bar: i32", "vital", "see [`Foo`]", resolve);
  // Prose is linked, type fence is still appended.
  if (!md.includes("[`Foo`](file://test#L2)")) {
    throw new Error(`expected linkified Foo, got: ${md}`);
  }
  if (!md.includes("```vital")) {
    throw new Error("expected vital type fence");
  }
});

Deno.test("docMarkdown: without resolver, doc is returned verbatim", () => {
  const md = docMarkdown("bar: i32", "vital", "see [`Foo`]");
  // No resolver — original text unchanged.
  if (!md.includes("[`Foo`]")) {
    throw new Error("expected verbatim [`Foo`] without resolver");
  }
  // But still must not contain a linkified form.
  if (md.includes("[`Foo`](")) {
    throw new Error("unexpected linkified Foo without resolver");
  }
});

Deno.test("docMarkdown: unresolved [Bar] left untouched even with resolver", () => {
  const resolve: DocRefResolver = () => undefined;
  const md = docMarkdown("x: i32", "vital", "see [Bar]", resolve);
  assertEquals(md.includes("[Bar]("), false, "unresolved [Bar] must not be linkified");
  assertEquals(md.includes("[Bar]"), true, "unresolved [Bar] must be present verbatim");
});

// ---------------------------------------------------------------------------
// (3) End-to-end: symbol resolution via parseSymbols + hover rendering
// ---------------------------------------------------------------------------

Deno.test("hover: doc-comment [`Foo`] xref resolves to Foo's definition line", () => {
  // `bar` has a doc-comment that references `Foo`. When hovering `bar`, the
  // doc's [`Foo`] should become a clickable link to Foo's declaration (line 1).
  const src =
    "type Foo = i32\n" +
    "/// see [`Foo`]\n" +
    "let bar: Foo = 1\n";
  const hover = hoverAt(src, posOf(src, 3, "bar"));
  if (!hover) throw new Error("expected hover for `bar`");
  // The linkified form must appear in the hover markdown.
  if (!hover.includes("[`Foo`](")) {
    throw new Error(`expected linkified Foo in hover, got:\n${hover}`);
  }
  // The URL must point to Foo's declaration line (line 1, 1-based).
  if (!hover.includes("#L1")) {
    throw new Error(`expected #L1 in hover URL, got:\n${hover}`);
  }
});

Deno.test("hover: unresolved [Bar] in doc-comment is left untouched", () => {
  const src =
    "type Foo = i32\n" +
    "/// see [Bar]\n" +
    "let x: Foo = 1\n";
  const hover = hoverAt(src, posOf(src, 3, "x"));
  if (!hover) throw new Error("expected hover for `x`");
  // `Bar` is not declared — must remain as plain brackets, no link.
  if (hover.includes("[Bar](")) {
    throw new Error(`unexpected linkified Bar in hover: ${hover}`);
  }
  if (!hover.includes("[Bar]")) {
    throw new Error("unresolved [Bar] should appear verbatim in hover");
  }
});

Deno.test("hover: function xref [`inc`] resolves to the function's definition", () => {
  const src =
    "function inc(n: i32): i32 {\n  return n + 1\n}\n" +
    "/// calls [`inc`]\n" +
    "function double(n: i32): i32 {\n  return inc(n) + inc(n)\n}\n";
  const hover = hoverAt(src, posOf(src, 5, "double"));
  if (!hover) throw new Error("expected hover for `double`");
  if (!hover.includes("[`inc`](")) {
    throw new Error(`expected linkified inc in hover, got:\n${hover}`);
  }
  // `inc` is declared on line 1.
  if (!hover.includes("#L1")) {
    throw new Error(`expected #L1 for inc's declaration, got:\n${hover}`);
  }
});

Deno.test("hover: [Name] without backticks also resolves when symbol exists", () => {
  const src =
    "type Point = { x: i32, y: i32 }\n" +
    "/// a [Point] value\n" +
    "let p: Point = { x: 0, y: 0 }\n";
  const hover = hoverAt(src, posOf(src, 3, "p"));
  if (!hover) throw new Error("expected hover for `p`");
  if (!hover.includes("[Point](")) {
    throw new Error(`expected linkified Point, got:\n${hover}`);
  }
});
