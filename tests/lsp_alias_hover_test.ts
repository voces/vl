// Hover rendering for D8 — type-alias names preserved in display.
//
// `server.ts` can't be imported under Deno (it pulls in the Node-only
// `vscode-languageserver` and opens a connection on load), so this drives the
// same mechanism the hover handler uses: the D2 symbol table's `occurrenceAt`
// → `binding.type`, rendered with `stringifyType` exactly as the binding-hover
// path in `server.ts` does. The point of D8 is that an aliased binding hovers
// with the *alias name* (`thing`, `I32`) rather than its expanded body.
// Auto-discovered by `deno task test`.

import { parseSymbols, stringifyType } from "../compiler/compile.ts";
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

// Reproduce the binding-hover string the server renders: `name: <type>` for the
// binding under the cursor. `pos` is VL-native (1-based line, 0-based column).
// Mirrors server.ts's per-kind alias depth: a value binding preserves all alias
// names (maxDepth 0); a `type` binding peels one layer (maxDepth 1) so the alias
// shows its body while keeping inner alias names.
const hoverAt = (src: string, pos: Position): string | null => {
  const symbols = parseSymbols(src);
  const occ = symbols.occurrenceAt(pos);
  if (!occ?.binding.type) return null;
  const aliasDepth = occ.binding.kind === "type" ? 1 : 0;
  return `${occ.binding.name}: ${
    stringifyType(occ.binding.type, new Set(), aliasDepth)
  }`;
};

// Locate the first occurrence of `needle` on `line1` (1-based) and return the
// VL position of its first character (0-based column).
const posOf = (src: string, line1: number, needle: string): Position => {
  const lineText = src.split("\n")[line1 - 1];
  const col = lineText.indexOf(needle);
  if (col < 0) throw new Error(`'${needle}' not found on line ${line1}`);
  return { line: line1, column: col };
};

Deno.test("hover: a value bound to an aliased type keeps the alias name", () => {
  // `x: thing` should hover as `x: thing` (the alias), not `x: "a" | i32`
  // (the expanded body) — the D8 owner ask. `I32` is declared first so the
  // `thing` body resolves it (forward type refs aren't the subject here).
  const src = "type I32 = i32\n" +
    'type thing = "a" | I32\n' +
    "function f(x: thing): thing {\n  return x\n}\n";
  // Cursor on the parameter `x` in the signature (line 3).
  const hover = hoverAt(src, posOf(src, 3, "x"));
  assertEquals(hover, "x: thing", "parameter hover preserves the alias name");
});

Deno.test("hover: a type-alias declaration shows its body, inner alias names kept", () => {
  // Hovering `type thing` peels one layer: shows the body `"a" | I32`, keeping
  // the inner alias `I32` rather than expanding it to `i32`.
  const src = "type I32 = i32\n" + 'type thing = "a" | I32\n';
  const hover = hoverAt(src, posOf(src, 2, "thing"));
  assertEquals(hover, 'thing: "a" | I32', "alias body keeps inner alias name");
});
