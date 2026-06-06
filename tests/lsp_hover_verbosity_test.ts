// Hover verbosity stepping (LSP 3.18): the `+`/`-` hover controls peel one
// type-alias layer per step. `server.ts` can't be imported under Deno (it pulls
// in the Node-only `vscode-languageserver` and opens a connection on load), so
// this drives the exact mechanism its `onHover` handler uses: map the requested
// verbosity level to a `stringifyType` `maxDepth` via `verbosityToMaxDepth`
// (the shared helper the server calls), render the binding under the cursor, and
// check the `+`/`-` capability flags via `hoverVerbosityFlags`. Default (level 0)
// must reproduce the pre-verbosity behaviour; a higher level must expand one more
// alias layer (driving the `maxDepth` path). Auto-discovered by `deno task test`.

import { parseSymbols, stringifyType } from "../compiler/compile.ts";
import {
  bindingBaseDepth,
  hoverVerbosityFlags,
  MAX_VERBOSITY_STEPS,
  verbosityToMaxDepth,
} from "../lsp/src/typeFeatures.ts";
import type { Position } from "../compiler/ast.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  if (actual !== expected) {
    throw new Error(
      `${msg ? msg + ": " : ""}expected ${JSON.stringify(expected)}, got ${
        JSON.stringify(actual)
      }`,
    );
  }
};

// Reproduce the server's verbosity-aware binding hover: render `name: <type>` at
// the `maxDepth` derived from the binding kind + requested verbosity level — the
// same `verbosityToMaxDepth` call `onHover` makes. Returns null off a binding.
const hoverAt = (
  src: string,
  pos: Position,
  verbosityLevel: number,
): string | null => {
  const symbols = parseSymbols(src);
  const occ = symbols.occurrenceAt(pos);
  if (!occ?.binding.type) return null;
  const maxDepth = verbosityToMaxDepth(occ.binding.kind, verbosityLevel);
  return `${occ.binding.name}: ${
    stringifyType(occ.binding.type, new Set(), maxDepth)
  }`;
};

// Locate the first occurrence of `needle` on `line1` (1-based) and return the VL
// position of its first character (0-based column).
const posOf = (src: string, line1: number, needle: string): Position => {
  const lineText = src.split("\n")[line1 - 1];
  const col = lineText.indexOf(needle);
  if (col < 0) throw new Error(`'${needle}' not found on line ${line1}`);
  return { line: line1, column: col };
};

Deno.test("hover verbosity: level 0 preserves alias names (default view)", () => {
  // `x: thing` at the default level hovers as `x: thing` — every alias name
  // preserved, exactly as before verbosity was wired.
  const src = "type I32 = i32\n" +
    'type thing = "a" | I32\n' +
    "function f(x: thing): thing {\n  return x\n}\n";
  const hover = hoverAt(src, posOf(src, 3, "x"), 0);
  assertEquals(hover, "x: thing", "level 0 keeps the alias name");
});

Deno.test("hover verbosity: one `+` step peels one alias layer", () => {
  // The same value binding, one verbosity step up: maxDepth goes 0 → 1, so the
  // outer alias `thing` expands to its body, keeping the inner alias `I32`.
  const src = "type I32 = i32\n" +
    'type thing = "a" | I32\n' +
    "function f(x: thing): thing {\n  return x\n}\n";
  const hover = hoverAt(src, posOf(src, 3, "x"), 1);
  assertEquals(hover, 'x: "a" | I32', "one step expands the outer alias");
});

Deno.test("hover verbosity: a second `+` step peels the inner alias too", () => {
  // Two steps: maxDepth 0 → 2, peeling both layers — the inner alias `I32`
  // expands to its primitive `i32`.
  const src = "type I32 = i32\n" +
    'type thing = "a" | I32\n' +
    "function f(x: thing): thing {\n  return x\n}\n";
  const hover = hoverAt(src, posOf(src, 3, "x"), 2);
  assertEquals(hover, 'x: "a" | i32', "two steps expand the inner alias");
});

Deno.test("hover verbosity: a `type` binding starts one layer expanded", () => {
  // A `type` declaration's level-0 base depth is 1 (it shows its body), so its
  // level-0 hover already peels one layer; `+` expands the inner alias.
  const src = "type I32 = i32\n" + 'type thing = "a" | I32\n';
  const base = hoverAt(src, posOf(src, 2, "thing"), 0);
  assertEquals(base, 'thing: "a" | I32', "type binding shows its body at level 0");
  const stepped = hoverAt(src, posOf(src, 2, "thing"), 1);
  assertEquals(stepped, 'thing: "a" | i32', "one step expands the inner alias");
});

Deno.test("verbosityToMaxDepth: level adds to the per-kind base depth", () => {
  // Value bindings base at 0, type bindings at 1; each level adds one.
  assertEquals(bindingBaseDepth("variable"), 0, "value base depth");
  assertEquals(bindingBaseDepth("type"), 1, "type base depth");
  assertEquals(verbosityToMaxDepth("variable", 0), 0, "value level 0");
  assertEquals(verbosityToMaxDepth("variable", 3), 3, "value level 3");
  assertEquals(verbosityToMaxDepth("type", 0), 1, "type level 0");
  assertEquals(verbosityToMaxDepth("type", 2), 3, "type level 2");
});

Deno.test("verbosityToMaxDepth: clamps out-of-range levels", () => {
  // A negative level (a misbehaving client) clamps to the base; a level past the
  // cap clamps to base + cap, so the mapping never runs away.
  assertEquals(verbosityToMaxDepth("variable", -5), 0, "negative clamps to base");
  assertEquals(
    verbosityToMaxDepth("variable", MAX_VERBOSITY_STEPS + 10),
    MAX_VERBOSITY_STEPS,
    "over-cap clamps to base + cap",
  );
});

Deno.test("hoverVerbosityFlags: controls reflect the current level", () => {
  // At level 0 only `+` is offered; in the middle both; at the cap only `-`.
  const atZero = hoverVerbosityFlags(0);
  assertEquals(atZero.canIncrease, true, "level 0 can increase");
  assertEquals(atZero.canDecrease, false, "level 0 cannot decrease");

  const mid = hoverVerbosityFlags(1);
  assertEquals(mid.canIncrease, true, "mid can increase");
  assertEquals(mid.canDecrease, true, "mid can decrease");

  const atCap = hoverVerbosityFlags(MAX_VERBOSITY_STEPS);
  assertEquals(atCap.canIncrease, false, "cap cannot increase");
  assertEquals(atCap.canDecrease, true, "cap can decrease");
});
