// `stringifyType` renders types for hover/diagnostics. Since the lexer now
// decodes string escapes into the literal's value, a string-literal type holds
// real control chars, so stringifyType must re-escape them for display.
// (Follow-up to the lexer string-escape work, PR #39.)

import { stringifyType } from "../compiler/compile.ts";

// Hand-rolled assert (repo convention: no std import map).
const assertEquals = (
  actual: unknown,
  expected: unknown,
  msg?: string,
): void => {
  if (actual !== expected) {
    throw new Error(
      `${msg ? msg + ": " : ""}expected ${JSON.stringify(expected)}, got ${
        JSON.stringify(actual)
      }`,
    );
  }
};

// deno-lint-ignore no-explicit-any
const lit = (value: string): any => ({ type: "StringLiteral", value });

Deno.test("stringifyType re-escapes control/quote/backslash in string-literal types", () => {
  assertEquals(stringifyType(lit("a\nb")), '"a\\nb"', "newline");
  assertEquals(stringifyType(lit("\t")), '"\\t"', "tab");
  assertEquals(stringifyType(lit("\r")), '"\\r"', "cr");
  assertEquals(stringifyType(lit("a\\b")), '"a\\\\b"', "backslash");
  assertEquals(stringifyType(lit('x"y')), '"x\\"y"', "quote");
  assertEquals(stringifyType(lit("plain")), '"plain"', "plain text unchanged");
});

Deno.test("stringifyType renders an UNNAMED Type wrapper as its aliased type, not T<…>", () => {
  // deno-lint-ignore no-explicit-any
  const typeWrap = (sub: any): any => ({ type: "Type", subType: sub });
  // An unnamed `Type` node (the internal/anonymous wrapper) still expands at the
  // default depth — D8 only preserves *named* alias wrappers.
  assertEquals(stringifyType(typeWrap(lit("ab"))), '"ab"', "type foo = \"ab\"");
  assertEquals(
    stringifyType(typeWrap({ type: "Alias", name: "i32" })),
    "i32",
    "type foo = i32",
  );
});

// deno-lint-ignore no-explicit-any
const alias = (name: string): any => ({ type: "Alias", name });
// A named `Type` wrapper standing for a resolved `type` alias (D8).
const named = (
  name: string,
  // deno-lint-ignore no-explicit-any
  subType: any,
  // deno-lint-ignore no-explicit-any
): any => ({ type: "Type", subType, name });

Deno.test("stringifyType (D8): a named alias renders as its NAME at the default depth", () => {
  // `type I32 = i32` referenced somewhere → named Type wrapper. Default cap (0)
  // preserves the name rather than expanding to the body.
  const i32Alias = named("I32", alias("i32"));
  assertEquals(stringifyType(i32Alias), "I32", "default preserves name");
  assertEquals(stringifyType(i32Alias, new Set(), 0), "I32", "maxDepth 0 = name");
});

Deno.test("stringifyType (D8): a named alias expands to its body past the cap", () => {
  const i32Alias = named("I32", alias("i32"));
  assertEquals(
    stringifyType(i32Alias, new Set(), 1),
    "i32",
    "maxDepth 1 peels the one alias layer",
  );
  assertEquals(
    stringifyType(i32Alias, new Set(), Infinity),
    "i32",
    "Infinity fully expands",
  );
});

Deno.test("stringifyType (D8): the inner alias name is kept inside a union (`\"a\" | I32`)", () => {
  // `type thing = "a" | I32` — the union's I32 member is itself a named wrapper.
  const thing = {
    type: "Union",
    subTypes: [lit("a"), named("I32", alias("i32"))],
    // deno-lint-ignore no-explicit-any
  } as any;
  assertEquals(
    stringifyType(thing),
    '"a" | I32',
    "default: inner alias name preserved",
  );
  assertEquals(
    stringifyType(thing, new Set(), Infinity),
    '"a" | i32',
    "Infinity: inner alias expanded",
  );
});

Deno.test("stringifyType (D8): nested aliases peel one layer per depth", () => {
  // type Inner = i32 ; type Outer = Inner — a wrapper around a wrapper.
  const inner = named("Inner", alias("i32"));
  const outer = named("Outer", inner);
  assertEquals(stringifyType(outer, new Set(), 0), "Outer", "depth 0: outermost name");
  assertEquals(
    stringifyType(outer, new Set(), 1),
    "Inner",
    "depth 1: peel outer, show inner name",
  );
  assertEquals(
    stringifyType(outer, new Set(), 2),
    "i32",
    "depth 2: peel both, show body",
  );
});

Deno.test("stringifyType (D8): a non-aliased structural type is unaffected by maxDepth", () => {
  const obj = {
    type: "Object",
    properties: [{ name: lit("x"), type: alias("i32") }],
    // deno-lint-ignore no-explicit-any
  } as any;
  assertEquals(stringifyType(obj, new Set(), 0), "{x: i32}", "depth 0");
  assertEquals(stringifyType(obj, new Set(), 5), "{x: i32}", "depth 5 — unchanged");
});
