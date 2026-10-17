// `literal-byte-write` names a wasm encoding byte written as a bare integer through
// `wU8(...)` in a compiler module, so the residue can be ratcheted down per file
// (`scripts/byte-budget-baseline.json`). It fires on a decimal or `0x` literal call
// at a word boundary; a computed argument, a comment, a string, `emit_bytes.vl` (where
// the names live) and any file outside `compiler/` are silent.
//
// Needs only the seed: it lints through `wasmChecker.lint` with the path staged.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { COMPILER, exists } from "./support/tree.ts";

const CODE = "literal-byte-write";

const SRC = `function wU8(b: i32) { b }
function fb(n: i32) { n }
function go(n: i32) {
  wU8(127)
  wU8(0x7f)
  wU8(n)
  fb(wU8(n + 1))
  // wU8(9) in a comment
  const s = "wU8(10) in a string"
  myWU8(3)
  s.length
}
function myWU8(b: i32) { b }
go(1)
`;

/** 1-based lines carrying the code, for `src` linted at `path`. */
const linesAt = (path: string, src = SRC): number[] => {
  const checker = loadWasmChecker(COMPILER, () => {})!;
  return checker.lint(src, path)
    .filter((d) => d.code === CODE)
    .map((d) => d.range.start.line + 1)
    .sort((a, b) => a - b);
};

const SEED = exists(COMPILER);

Deno.test({
  name:
    "literal-byte-write: fires on a decimal and a hex literal, not on a computed byte, comment or string",
  ignore: !SEED,
  fn: () => {
    const got = linesAt("compiler/x.vl");
    if (JSON.stringify(got) !== JSON.stringify([4, 5])) {
      throw new Error(
        `compiler/x.vl: want lines [4,5], got ${JSON.stringify(got)}`,
      );
    }
  },
});

Deno.test({
  name:
    "literal-byte-write: the span covers the call and the message quotes it",
  ignore: !SEED,
  fn: () => {
    const checker = loadWasmChecker(COMPILER, () => {})!;
    const d = checker.lint(SRC, "compiler/x.vl").find((x) =>
      x.code === CODE && x.range.start.line === 4
    );
    if (d === undefined) throw new Error("want a finding on line 5");
    if (!d.message.startsWith("`wU8(0x7f)` writes a wasm encoding byte")) {
      throw new Error(`message: got ${d.message}`);
    }
    if (d.severity !== "warning") {
      throw new Error(`severity: want warning, got ${d.severity}`);
    }
    const span = [d.range.start.character, d.range.end.character];
    if (JSON.stringify(span) !== JSON.stringify([2, 11])) {
      throw new Error(
        `span: want columns [2,11] (the call), got ${JSON.stringify(span)}`,
      );
    }
  },
});

Deno.test({
  name:
    "literal-byte-write: silent in emit_bytes.vl, outside compiler/, and with no path",
  ignore: !SEED,
  fn: () => {
    for (
      const path of [
        "compiler/emit_bytes.vl",
        "scripts/x.vl",
        "src/compiler/x.vl",
        "",
      ]
    ) {
      const got = linesAt(path);
      if (got.length !== 0) {
        throw new Error(
          `${path || "(no path)"}: want silent, got lines ${
            JSON.stringify(got)
          }`,
        );
      }
    }
  },
});
