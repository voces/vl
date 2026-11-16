// `walk-limit` names a walk counter compared with a fixed bound in a compiler module, so the
// residue can be ratcheted down per file (`scripts/walk-limit-budget-baseline.json`). It fires on
// a literal bound of 3 to 1000, a constant bound, a depth countdown's `<= 0`, `< 0` or `< 1` on a
// parameter of the enclosing function, a camel-case `…Depth` counter at a real bound and a walk
// list's length. A camel-case counter's `<= 0` (a nesting test), a local holding a computed depth
// at its floor, a mode flag (a bound over 1000), a bound arithmetic continues, a `while` whose
// counter the function sets to the bound (a sentinel exit), a name that is no counter, a comment,
// a string and any file outside `compiler/` are silent.
//
// Needs only the seed: it lints through `wasmChecker.lint` with the path staged.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { COMPILER, exists } from "./support/tree.ts";

const CODE = "walk-limit";

const SRC = `const WALK_MAX = 8
let walkDepth = 0
function a(depth: i32, n: i32): i32 {
  if depth > 8 { return 0 }
  if depth <= 0 { return 0 }
  if depth < 0 { return 0 }
  if depth > WALK_MAX { return 0 }
  if depth > 19988 { return 1 }
  if depth > 1 { return 2 }
  if depth > 4 + n { return 3 }
  return a(depth + 1, n)
}
function b(path: i32[], hops: i32): i32 {
  if path.length >= 8 { return 0 }
  if hops > 1 { return 0 }
  const count = 9
  if count > 8 { return 1 }
  // depth > 8 in a comment
  const s = "depth > 8 in a string"
  return s.length
}
function c(x: i32): i32 {
  let hops = 0
  let cur = x
  while hops < 16 {
    if cur < 0 { hops = 16 } else { cur = cur - 1 }
    hops = hops + 1
  }
  return cur
}
function d(x: i32): i32 {
  let guard = 0
  while guard < 64 { guard = guard + 1 }
  if walkDepth > 8 { return 0 }
  if walkDepth <= 0 { return 1 }
  return x + guard
}
function e(r: i32): i32 {
  const depth = r * 2
  if depth < 1 { return 0 }
  return depth
}
print(a(0, 1) + b([], 0) + c(3) + d(1) + e(2))
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
    "walk-limit: fires on literal, constant, countdown, camel-case and walk-length limits, not on a mode flag, an arithmetic bound, a sentinel exit, a computed local depth or a non-counter",
  ignore: !SEED,
  fn: () => {
    const got = linesAt("compiler/x.vl");
    const want = [4, 5, 6, 7, 14, 33, 34];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(
        `compiler/x.vl: want lines ${JSON.stringify(want)}, got ${
          JSON.stringify(got)
        }`,
      );
    }
  },
});

Deno.test({
  name: "walk-limit: the span covers the comparison and the message quotes it",
  ignore: !SEED,
  fn: () => {
    const checker = loadWasmChecker(COMPILER, () => {})!;
    const d = checker.lint(SRC, "compiler/x.vl").find((x) =>
      x.code === CODE && x.range.start.line === 3
    );
    if (d === undefined) throw new Error("want a finding on line 4");
    if (d.severity !== "warning") {
      throw new Error(`severity: want warning, got ${d.severity}`);
    }
    if (!d.message.startsWith("`depth > 8` stops a walk")) {
      throw new Error(`message: got ${d.message}`);
    }
    const span = [d.range.start.character, d.range.end.character];
    if (JSON.stringify(span) !== JSON.stringify([5, 14])) {
      throw new Error(
        `span: want columns [5,14] (\`depth > 8\`), got ${
          JSON.stringify(span)
        }`,
      );
    }
  },
});

Deno.test({
  name: "walk-limit: silent outside compiler/ and with no path",
  ignore: !SEED,
  fn: () => {
    for (const path of ["scripts/x.vl", "src/compiler/x.vl", ""]) {
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
