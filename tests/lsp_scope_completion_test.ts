// Unit tests for the wasm scope-at-position completion helper
// (`scopeCompletionsFromBindings` in `lsp/src/typeFeatures.ts`), the kill-TS
// counterpart of `identifierCompletions`'s user-binding half.
//
// These drive the PURE helper directly — no wasm seed is touched (the native
// `scopeAt`/`scopeNameLen`/… exports are exercised by the seed-dependent
// integration suite, not here). As with the other LSP helper tests, the request
// plumbing in `server.ts` can't be imported under Deno. Run with:
//   deno test -A --no-check tests/lsp_scope_completion_test.ts
// (also included in `deno task test`).

import {
  type Completion,
  type ScopeBinding,
  scopeCompletionsFromBindings,
} from "../lsp/src/typeFeatures.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

const kindOf = (cs: Completion[], name: string) =>
  cs.find((c) => c.name === name)?.kind;
const detailOf = (cs: Completion[], name: string) =>
  cs.find((c) => c.name === name)?.detail;

Deno.test("scopeCompletionsFromBindings: maps kinds 0/1/2 to variable/parameter/function", () => {
  const bindings: ScopeBinding[] = [
    { name: "a", kind: 0, type: "i32" },
    { name: "p", kind: 1, type: "string" },
    { name: "f", kind: 2, type: "(x: i32) => i32" },
  ];
  const cs = scopeCompletionsFromBindings(bindings);
  assertEquals(kindOf(cs, "a"), "variable");
  assertEquals(kindOf(cs, "p"), "parameter");
  assertEquals(kindOf(cs, "f"), "function");
});

Deno.test("scopeCompletionsFromBindings: an unknown kind degrades to variable", () => {
  // A future/out-of-range kind falls through to the default rather than throwing.
  const cs = scopeCompletionsFromBindings([{ name: "x", kind: 9, type: "" }]);
  assertEquals(kindOf(cs, "x"), "variable");
});

Deno.test("scopeCompletionsFromBindings: a non-empty type becomes the detail", () => {
  const cs = scopeCompletionsFromBindings([{ name: "a", kind: 0, type: "i32" }]);
  assertEquals(detailOf(cs, "a"), "i32");
});

Deno.test("scopeCompletionsFromBindings: an empty type drops detail to undefined", () => {
  const cs = scopeCompletionsFromBindings([{ name: "a", kind: 0, type: "" }]);
  // `detail` is omitted entirely (undefined) so the LSP item shows no type.
  assertEquals(cs[0].detail, undefined);
});

Deno.test("scopeCompletionsFromBindings: de-dups by name, last wins", () => {
  // A shadowing inner binding arrives after the outer one; the later entry wins.
  const cs = scopeCompletionsFromBindings([
    { name: "x", kind: 0, type: "i32" },
    { name: "x", kind: 1, type: "string" },
  ]);
  assertEquals(cs.length, 1);
  assertEquals(kindOf(cs, "x"), "parameter");
  assertEquals(detailOf(cs, "x"), "string");
});

Deno.test("scopeCompletionsFromBindings: empty input yields no completions", () => {
  assertEquals(scopeCompletionsFromBindings([]).length, 0);
});
