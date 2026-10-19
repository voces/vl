# The duplicate-code census

`scripts/dup-census.vl` measures how much of a VL tree repeats itself, and lists the
repeated blocks worth factoring out first. It is a DISCOVERY instrument, like the full
silent-sweep census: it has no baseline and no ratchet, and no gate runs it. Use it to choose
what a DRY or cleanup PR should target, and re-run it afterwards to see whether the target
moved.

## How to run it

```sh
vl run scripts/dup-census.vl -- [paths...] [--mode exact|param|blind|all] [--min N] [--top N] [--json] [--verify]
```

* `paths` are files or directories, and default to `compiler`. Directories are walked for
  `*.vl`, skipping `.git`, `node_modules`, `build`, `target` and the like. Each copy is
  reported as `file:line`, with the file relative to the working directory.
* `--mode` defaults to `all`, which runs the three modes in turn.
* `--min` is the shortest block listed, in tokens. It defaults to 50, about 7–8 lines of
  compiler code.
* `--top` is how many blocks are listed. It defaults to 15.
* `--json` prints one object holding every mode's curve and blocks.
* `--verify` checks each adjacent suffix-array pair against a naive token-by-token
  comparison, and exits non-zero on any pair that is out of order or has a wrong LCP. It is
  for changing the tool, not for using it.

For speed, build it once with `vl build scripts/dup-census.vl -O -o <scratch>.wasm` and then
`vl run <scratch>.wasm -- ...`. On `compiler std` (1.55M tokens, 236k code lines) on
2026-10-18, at load 13–15 on the 24-thread box:

| run | wall | peak RSS |
| --- | --- | --- |
| all three modes | 12.4 s | 533 MB |
| `exact` | 3.1 s | 274 MB |
| `param` | 8.3 s | 274 MB |
| `blind` | 2.6 s | 274 MB |

## What it counts

The tool tokenizes each file with the compiler's own lexer (`tokenize` in
`compiler/lexer.vl`). It drops comments, newlines and every `import {…} from` and
`export {…} from` declaration, so formatting and import lists can neither make code look alike
nor make it look different. Each file ends with its own unique sentinel, so no match can cross
from one file into the next.

The three modes differ in how much of a token they keep:

* **`exact`** keeps every token's text. A match is a literal copy-paste.
* **`param`** builds Baker's parameterized strings:
  * an identifier becomes the distance back to its previous occurrence, or 0 if it is a
    first occurrence;
  * a literal becomes its kind (`$NUMBER`, `$STRING`, ...).

  A match is the same code under a CONSISTENT renaming: `a + a` matches `b + b` but not
  `b + c`. This is the clone a helper with parameters can replace.
* **`blind`** turns every identifier into one placeholder, and every literal into its kind. A
  match is the same token shape with any names at all, so it is an upper bound: `a + a` matches
  `b + c`. Most of what blind adds over param is lists of declarations that have the same shape
  and nothing else in common.

The census prints two things per mode:

* **The coverage curve.** For L in 10, 25, 50, 100, 200 and 400 tokens, it gives the share of
  tokens that lie inside some repeat of at least L tokens, and the share of code lines all of
  whose tokens do. It also prints the approximate line count of each L, which is L divided by
  the tree's tokens per line.
* **The ranked blocks.**
  * A block is left-maximal: it cannot be extended to the left in all of its copies at once.
  * It is at least `--min` tokens long.
  * No two of its copies overlap.
  * Blocks are ranked by `tokens × (copies − 1)`, the tokens a perfect factoring would remove.
  * A block is dropped from the list when at least half of its copy tokens already belong to a
    block ranked above it, so one family appears once rather than once per nested length.

## What it cannot see

* **Near-miss clones.** A block is a run of tokens that matches without a gap. Two copies that
  differ by one inserted statement count as two shorter blocks, or as none if each half is
  below `--min`.
* **Semantic duplication.** Two functions that compute the same thing with different code are
  invisible in every mode.
* **A periodic run's full length.** A run like `x, x, x, ...` repeats itself only by
  overlapping its own copies. So it is not listed as a block, and it counts toward coverage
  only up to its period.
* **Every pair's contribution to coverage.** A token's coverage comes from the pairs that are
  adjacent in the suffix array. A repeat whose only non-overlapping copy is not one of a
  suffix's sorted neighbours is under-counted, which makes the curve a lower bound.
* **A line that is partly duplicated.** A line counts as covered only when every one of its
  tokens is, so the line column is stricter than the token column.
* **`param` and `blind` together in one block.** Literals become their kind in both of those
  modes, so two blocks that differ only in a number or a string match in each of them. Only
  `exact` tells the two blocks apart.

## Against the line-level prototype

The census was checked against an uncommitted TypeScript prototype that compared whole lines,
run on 5695fb884 over 184,791 code lines. The two instruments agree on the top exact block: the four-copy member-path walk at
`compiler/emit_fn_scans.vl` around lines 2486, 2720, 2780 and 2837 (185 tokens, about 36 lines,
ranked #3 here behind two AST-kind union lists).

Their curves are not the same numbers, because a token run can start and end mid-line, while
the prototype needed whole lines to match:

| | prototype (lines) | census, `compiler std` (line column) |
| --- | --- | --- |
| exact | ≥5 lines 6.2%, ≥10 1.2%, ≥20 0.1% | L=25 (≈3.8 lines) 10.9%, L=50 (≈7.6) 2.9%, L=100 (≈15) 0.4%, L=200 (≈30) 0.1% |
| blind | ≥10 lines 11.1%, ≥20 3.2%, ≥40 0.6% | L=50 (≈7.6) 18.7%, L=100 (≈15) 3.7%, L=200 (≈30) 0.5%, L=400 (≈61) 0.1% |

The test is `tests/vl_dup_census_test.ts`. Each of its fixtures plants one fact with a known
answer:

* a 30-token clone in two files;
* a renaming that `param` must match and a non-renaming that only `blind` may match;
* a repeat that only a missing file sentinel would join;
* a self-overlapping run.
