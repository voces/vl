// Unit tests for D7: rustdoc-style intra-doc cross-references in `///` doc-
// comments. Tests the pure helper `linkifyDocRefs` and the combined rendering
// path `docMarkdown` (both in `lsp/src/typeFeatures.ts`).
//
// (An earlier end-to-end block drove the TS symbol table — `parseSymbols` +
// `stringifyType` from `compiler/compile.ts` — to prove a doc-comment xref
// surfaces in the binding-hover path. With the TS compiler retired (kill-TS)
// that coupling is gone; the resolver-driven `docMarkdown` test below already
// covers that a resolved ref linkifies, and the seed-backed hover path is
// exercised in `lsp_wasm_checker_test.ts`.)
//
// Run with:
//   deno test -A --no-check tests/lsp_docxref_test.ts
// (also included in `deno task test`).

import {
  docMarkdown,
  linkifyDocRefs,
  type DocRefResolver,
} from "../lsp/src/typeFeatures.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
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
