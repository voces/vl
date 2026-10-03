// A cursor query (definition, hover type, effects) answers from the ENTRY file only. The
// merged module graph records every module's identifier occurrences, and an imported
// module's identifier at the same line and column as the cursor, with a narrower span,
// used to win the lookup: definition jumped into the other module and effects went blank
// (D3476's sibling, found when `std/math.vl` grew and an `ax` landed under a fixture's
// cursor). Loads the real seed; self-ignores without one.

import type { ModuleReader } from "../compiler/coreTypes.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const ignore = (() => {
  try {
    Deno.statSync(SEED);
    return false;
  } catch {
    return true;
  }
})();

// util.vl line 3 (0-based 2) holds `a` at column 9, inside main.vl's `farAway` on the same
// line, so the two files' occurrences overlap at (line 3, col 9).
const util = "export function far(a: i32): i32 {\n  const b = a\n  return a + b\n}\n";
const main = 'import { far } from "./util"\nfunction farAway(x: i32): i32 { x }\n' +
  "print(farAway(far(1)))\n";
const read: ModuleReader = (key: string) =>
  ({ "/proj/util.vl": util, "/proj/main.vl": main } as Record<string, string>)[key];

Deno.test({ name: "cursor queries answer from the entry file only", ignore }, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  // LSP coordinates: 0-based line 2, character 9 is inside `farAway` in main.vl.
  const def = await checker.definitionAt!(main, "/proj/main.vl", read, 2, 9);
  const wantDef = '{"start":{"line":1,"character":9},"end":{"line":1,"character":16}}';
  if (JSON.stringify(def) !== wantDef) {
    throw new Error(`definition: want ${wantDef} (farAway's declaration), got ${JSON.stringify(def)}`);
  }
  const eff = await checker.effectsAt!(main, "/proj/main.vl", read, 2, 9);
  const wantEff = "writes: none · reads: none · allocates: no · cost: 0 steps · I/O: none";
  if (eff !== wantEff) throw new Error(`effects: want ${wantEff}, got ${eff}`);
});
