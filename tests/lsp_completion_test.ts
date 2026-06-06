// Unit tests for the LSP autocomplete helpers (`lsp/src/typeFeatures.ts`,
// roadmap D3): scope-aware identifier completion and structural member
// completion.
//
// As with the other LSP helper tests, the request plumbing in `server.ts` can't
// be imported under Deno (it pulls in the Node-only `vscode-languageserver` and
// opens a connection on load), and the `.vl` corpus runner can't reach LSP
// requests — so these drive the pure helpers directly through
// `parseSymbols` / `compile`. Run with:
//   deno test -A --no-check tests/lsp_completion_test.ts
// (also included in `deno task test`).
//
// Position convention: the helpers (and the symbol table) take 1-based line /
// 0-based column positions, matching `Context`.

import { compile, parseSymbols, stringifyType } from "../compiler/compile.ts";
import {
  type Completion,
  identifierCompletions,
  memberCompletions,
  receiverObjectType,
  typeMarkdown,
} from "../lsp/src/typeFeatures.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

const names = (cs: Completion[]) => cs.map((c) => c.name);
const kindOf = (cs: Completion[], name: string) =>
  cs.find((c) => c.name === name)?.kind;

// ---- (1) scope-aware identifier completion ----------------------------------

Deno.test("identifierCompletions: in-scope locals, params, functions, types", () => {
  // Cursor on line 4 (the `return` line), inside `f`'s body.
  const src = "let a = 1\n" +
    "type Pair = { x: i32 }\n" +
    "function f(p: i32): i32 {\n" +
    "  let b = p\n" +
    "  return b\n" +
    "}\n";
  const table = parseSymbols(src);
  // Use an empty builtins scope to assert purely on user bindings here.
  const cs = identifierCompletions(table, { line: 5, column: 9 }, {}, stringifyType);
  const got = names(cs).sort();
  assertEquals(got, ["Pair", "a", "b", "f", "p"]);
  assertEquals(kindOf(cs, "a"), "variable");
  assertEquals(kindOf(cs, "p"), "parameter");
  assertEquals(kindOf(cs, "f"), "function");
  assertEquals(kindOf(cs, "Pair"), "type");
});

Deno.test("identifierCompletions: a local from another function is NOT in scope", () => {
  // `b` is local to `f`; at top level (line 7) it must not appear.
  const src = "function f(): i32 {\n" +
    "  let b = 1\n" +
    "  return b\n" +
    "}\n" +
    "let c = 2\n" +
    "let d = 3\n" +
    "let e = 4\n";
  const table = parseSymbols(src);
  const cs = identifierCompletions(table, { line: 7, column: 6 }, {}, stringifyType);
  const got = names(cs).sort();
  // `f`, `c`, `d`, `e` are top-level; `b` is hidden inside `f`.
  assertEquals(got, ["c", "d", "e", "f"]);
  if (got.includes("b")) throw new Error("`b` must not be visible at top level");
});

Deno.test("identifierCompletions: detail carries the binding's stringified type", () => {
  const src = "function f(p: i32): i32 {\n  return p\n}\n";
  const table = parseSymbols(src);
  const cs = identifierCompletions(table, { line: 2, column: 9 }, {}, stringifyType);
  assertEquals(cs.find((c) => c.name === "p")?.detail, "i32");
});

Deno.test("identifierCompletions: an inner local shadows an outer same-named one", () => {
  // Two `x`: top-level `let x = 1` and a block-local `let x = ...` inside `f`.
  // Inside the body, exactly one `x` is offered and it's the inner one.
  const src = "let x = 1\n" +
    "function f(): i32 {\n" +
    "  let x = 2\n" +
    "  return x\n" +
    "}\n";
  const table = parseSymbols(src);
  const inside = identifierCompletions(table, { line: 4, column: 9 }, {}, stringifyType);
  const xs = inside.filter((c) => c.name === "x");
  assertEquals(xs.length, 1, "exactly one `x` (inner shadows outer)");

  // Find the two distinct `x` bindings by their scope spans to confirm the inner
  // (tighter) one wins. The inner binding's scope starts on a later line.
  const xBindings = table.occurrences
    .filter((o) => o.isDecl && o.binding.name === "x")
    .map((o) => o.binding);
  assertEquals(xBindings.length, 2, "two `x` declarations exist in the table");
  const innerStart = Math.max(...xBindings.map((b) => b.scope!.start.line));
  // The single offered `x` resolves through `bindingsInScopeAt`, which prefers
  // the tighter scope — assert it's the one whose scope starts deepest.
  const chosen = table
    .bindingsInScopeAt({ line: 4, column: 9 })
    .find((b) => b.name === "x");
  assertEquals(chosen?.scope?.start.line, innerStart, "inner `x` chosen");
});

Deno.test("identifierCompletions: a name declared later is still in scope (whole-block visibility)", () => {
  // VL declarations are visible across their enclosing scope, not only after the
  // textual declaration point (functions especially can be forward-referenced).
  const src = "let a = 1\nlet b = 2\nlet c = 3\n";
  const table = parseSymbols(src);
  // Cursor on line 1 (the first decl): b and c (declared later) are still in the
  // program scope and so are offered.
  const cs = identifierCompletions(table, { line: 1, column: 8 }, {}, stringifyType);
  assertEquals(names(cs).sort(), ["a", "b", "c"]);
});

Deno.test("identifierCompletions: folds in builtins, user bindings shadow them", () => {
  const src = "let myVar = 1\n";
  const table = parseSymbols(src);
  // A tiny stand-in builtins scope: a type (`i32`) and a function (`print`).
  const builtins = {
    i32: { type: "Object", name: "i32", properties: [] } as const,
    print: {
      type: "Function",
      paramaters: [],
      return: { type: "Unknown" },
    } as const,
    myVar: { type: "Alias", name: "string" } as const, // collides with the local
  };
  const cs = identifierCompletions(
    table,
    { line: 1, column: 13 },
    builtins,
    stringifyType,
  );
  if (!names(cs).includes("i32")) throw new Error("builtin `i32` should appear");
  if (!names(cs).includes("print")) throw new Error("builtin `print` should appear");
  assertEquals(kindOf(cs, "i32"), "type", "non-function builtin is a type");
  assertEquals(kindOf(cs, "print"), "function", "function builtin is a function");
  // The local `myVar` (a variable) wins over the same-named builtin alias.
  assertEquals(kindOf(cs, "myVar"), "variable", "user binding shadows builtin");
  // And only one `myVar` entry exists (de-duped by name).
  assertEquals(names(cs).filter((n) => n === "myVar").length, 1);
});

Deno.test("identifierCompletions: skips internal `__name__` intrinsics from the real scope", async () => {
  const src = "let a = 1\n";
  const table = parseSymbols(src);
  const { ast } = await compile(src);
  const cs = identifierCompletions(
    table,
    { line: 1, column: 8 },
    ast?.scope ?? {},
    stringifyType,
  );
  const intrinsics = names(cs).filter((n) => n.startsWith("__"));
  assertEquals(intrinsics, [], "no `__...__` runtime intrinsics offered");
  // But real builtins (e.g. `i32`) and the user local are present.
  if (!names(cs).includes("i32")) throw new Error("expected builtin `i32`");
  if (!names(cs).includes("a")) throw new Error("expected local `a`");
});

// ---- (2) structural member completion ---------------------------------------

Deno.test("memberCompletions: surfaces an object type's fields and methods", () => {
  const objectType = {
    type: "Object" as const,
    name: "Point",
    properties: [
      {
        name: { type: "StringLiteral" as const, value: "x" },
        type: { type: "Alias" as const, name: "i32" },
      },
      {
        name: { type: "StringLiteral" as const, value: "y" },
        type: { type: "Alias" as const, name: "i32" },
      },
      {
        name: { type: "StringLiteral" as const, value: "dist" },
        type: {
          type: "Function" as const,
          paramaters: [],
          return: { type: "Alias" as const, name: "f64" },
        },
      },
      // An operator entry (union of operator string literals) — must be skipped.
      {
        name: {
          type: "Union" as const,
          subTypes: [
            { type: "StringLiteral" as const, value: "+" },
            { type: "StringLiteral" as const, value: "==" },
          ],
        },
        type: { type: "Alias" as const, name: "i32" },
      },
    ],
  };
  const cs = memberCompletions(objectType, stringifyType);
  assertEquals(names(cs).sort(), ["dist", "x", "y"]);
  assertEquals(kindOf(cs, "x"), "variable", "a plain field is a variable");
  assertEquals(kindOf(cs, "dist"), "function", "a function-typed field is a method");
  assertEquals(cs.find((c) => c.name === "x")?.detail, "i32");
});

Deno.test("receiverObjectType + memberCompletions: members of a parameter's object type", () => {
  // `p`'s declared type is the object `Point`; member completion after `p.`
  // should offer its fields.
  const src = "type Point = { x: i32, y: i32 }\n" +
    "function f(p: Point): i32 {\n" +
    "  return p.x\n" +
    "}\n";
  const table = parseSymbols(src);
  // Cursor inside the body (line 3), where `p` is in scope. No scope param needed
  // because the parameter binding already carries the resolved object type.
  const obj = receiverObjectType("p", table, { line: 3, column: 9 }, {});
  if (!obj) throw new Error("expected to resolve `p`'s object type");
  assertEquals(names(memberCompletions(obj, stringifyType)).sort(), ["x", "y"]);
});

Deno.test("receiverObjectType: resolves a top-level name's object type via the program scope", async () => {
  const src = "let p = { x: 1, y: 2 }\n";
  const table = parseSymbols(src);
  const { ast } = await compile(src);
  const obj = receiverObjectType("p", table, { line: 2, column: 0 }, ast!.scope);
  if (!obj) throw new Error("expected to resolve `p` via the program scope");
  assertEquals(names(memberCompletions(obj, stringifyType)).sort(), ["x", "y"]);
});

Deno.test("receiverObjectType: an unknown / non-object receiver yields no members", () => {
  const src = "let n = 1\n";
  const table = parseSymbols(src);
  // `nope` isn't declared anywhere → undefined.
  assertEquals(
    receiverObjectType("nope", table, { line: 1, column: 9 }, {}),
    undefined,
  );
});

// ---- (3) syntax-highlighted type documentation ------------------------------

Deno.test("typeMarkdown: wraps the type in a fenced `vital` code block", () => {
  // The `vital` fence info string makes the client render the type highlighted
  // via the same TextMate grammar the hover uses; `detail` (plain text) can't.
  assertEquals(typeMarkdown("i32", "vital"), "```vital\ni32\n```");
});

Deno.test("typeMarkdown: a typed binding's completion detail can render highlighted", () => {
  // A completion for a typed binding (`p: i32`) carries a `detail`; wrapping it
  // through `typeMarkdown` produces markdown with a ```vital fence around the
  // type string. (server.ts sets this as the item's `documentation`.)
  const src = "function f(p: i32): i32 {\n  return p\n}\n";
  const table = parseSymbols(src);
  const cs = identifierCompletions(table, { line: 2, column: 9 }, {}, stringifyType);
  const detail = cs.find((c) => c.name === "p")?.detail;
  assertEquals(detail, "i32", "the typed binding carries an inline type detail");
  const md = typeMarkdown(detail!, "vital");
  if (!md.includes("```vital\n")) {
    throw new Error("documentation markdown must open a `vital` fence");
  }
  if (!md.includes(detail!)) {
    throw new Error("documentation markdown must contain the type string");
  }
});
