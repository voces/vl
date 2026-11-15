// A RECORD PARAMETER'S ROW SLOT NEVER APPEARS IN WHAT THE EDITOR SHOWS.
//
// The record-width rewrite gives a declared record parameter `p: P` a fresh type parameter bound
// by `P` (`check_row_param.vl`), printed as `P`. A hover over the parameter, a use of it, or the
// function's name shows `P`; never the slot's spelling `__R<decl>_<k>__<record>`, nor the
// rewrite's former `__W<i>`, which these hovers showed before the slot printed as its bound.
// Each function here is called with a wider row, so the rewrite applies to it.

import { filePath } from "./support/filePath.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { seedPresent } from "./support/tree.ts";

const SEED = filePath(new URL("../build/vl-compiler.wasm", import.meta.url));
const ignore = !seedPresent(SEED);

const SRC = [
  /* 0 */ "type P = { y: i32 }",
  /* 1 */ "type W = { x: i32, y: i32 }",
  /* 2 */ "function f(p: P): i32 { p.y }",
  /* 3 */ "function g(self: P): i32 { self.y }",
  /* 4 */ "const w: W = { x: 1, y: 2 }",
  /* 5 */ "print(f(w))",
  /* 6 */ "print(w.g())",
  /* 7 */ "const h = (p: P) => print(p.y)",
  /* 8 */ "h(w)",
  "",
].join("\n");

// [line, col, the hover it must show]
const WANT: [number, number, string][] = [
  [2, 11, "P"], // the parameter at its declaration
  [2, 24, "P"], // a use of it in the body
  [2, 9, "(p: P) => i32"], // the function's name
  [3, 27, "P"], // a UFCS `self`
  [5, 6, "(p: P) => i32"], // the callee at a call that passes the wider row
  [7, 11, "P"], // a lambda's parameter (D16400)
  [8, 0, "(P) => void"], // the lambda's binding at a call that passes the wider row
];

Deno.test({
  name: "row-param: a hover shows the record, never the row slot",
  ignore,
  fn: async () => {
    const checker = loadWasmChecker(SEED, () => {})!;
    const bad: string[] = [];
    for (const [line, col, want] of WANT) {
      const got = await checker.hoverTypeAt(
        SRC,
        "/proj/main.vl",
        () => undefined,
        line,
        col,
      );
      if (got !== want) bad.push(`${line}:${col} want ${want}, got ${got}`);
    }
    if (bad.length > 0) throw new Error(bad.join("\n"));
  },
});
