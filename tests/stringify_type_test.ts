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
