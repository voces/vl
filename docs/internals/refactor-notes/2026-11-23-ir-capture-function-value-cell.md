# IR coverage: function-value cells (2026-11-23, lane IR-N8)

A capturing nested function read as a value from another frame goes through its cell (D7700):
the first read in any frame fills it, so every read is the same value. The IR missed every such
closure as `closure env cell`, and every environment carrying a `#cell:N` capture as
`closure env capture`.

- `cloEnvOf` gives a value of `fe` that reaches its cell no operands. A `#cell:N` capture of an
  ordinary environment has no operand either.
- `makeClo` takes the fresh-environment arm only when `fe` has an environment and reaches no cell
  (`cloCellReaches`, legacy's own test). It writes each `#cell:N` capture with `emitCloCellRef`
  between the operand captures, in `captureNamesOf` order. A value through the cell takes the arm
  that already writes `emitClosureValueCore`.

## Measured

Shadow mode over the 308 tests/cases programs with a nested function, master cf56aab0d's
fixpoint seed against this branch:

| reading | master | branch |
|---|---:|---:|
| covered = matched | 4403 | 4420 |
| `closure env cell` | 11 | 0 |
| `closure env capture` | 8 | 2 |

Row: `tests/ir-shadow-rows/capture-function-value-cell.vl` (master 4 matched, branch 14).

## Left

- `looped` in `tests/cases/closures/capturing-nested-function-read-from-another-frame-equality.vl`:
  a closure over `k`, a `const` in a `while` body, misses `closure env capture` with a rep found.
  It was behind the cell miss before.

## Legacy tails the IR calls

- `emitClosureValueCore`, in `makeClo`: now also for a value through its cell, which reaches `emitClosureValueOf`'s cell fill and its `emitClosureEnvOf`.
- `emitCloCellRef` (newly exported from `wasmEmit.vl`), in `makeClo`: a `#cell:N` capture of a fresh environment, as `emitCaptureRead` writes it.
