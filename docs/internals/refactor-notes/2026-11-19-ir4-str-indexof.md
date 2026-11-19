# IR coverage: a string's `.indexOf` and `.includes` (2026-11-19, lane IR4)

On master 8b89f4bc3, `method indexOf` alone blocked 21 self-compile functions and `method includes`
alone blocked 4 (`VL_IR_SHADOW=4` blocker census).

## What changed

Legacy's `emitStrIndexOf` evaluated the receiver and the needle, then wrote the search: two loops
(a skip loop and a verify loop) inside an outer loop, plus the empty-needle and long-needle guards.
It now writes the two operands and calls **`strIndexOfTail(isIncludes)`**. The tail holds the
search verbatim, one indent level shallower, and writes the same bytes. It is the IR's tail too.

The IR adds two members to `StrOp`, **`indexof`** and **`includes`**, built in `methodRhs` when
`exprIsStrIndexOf` (legacy's own predicate) answers with one argument. Both operands must be
string reps; any other rep misses `method operand coercion`. `lowerStr` pushes the two operands and
calls `strIndexOfTail`. The verifier's existing `RStrOp` rule already requires string operands for
every op but `slice` and `fromcp`.

## Measured

Fixpoint seeds: master 8b89f4bc3 against this branch on the same base.

| | master | this branch |
|---|---|---|
| self-compile claimed (mode 3) | 14,670 | 14,695 (+25) |
| corpus covered = verified = matched | 35,249 | 35,257 (+8) |

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,514, differ 0 |
| `--claims` / mode 3 | ok / identical |
| armed shadow | all matched; ok |
| L2 fuel | 100,756,221,229: +0.005% on master (100,750,891,716). Both are about +0.9% on the baseline file |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, ladder-sets, dead exports | clean / ok / 0 |
| phase state, late demands | ok (hidden 154) / 9 of baseline 9, 307 tag rows |
| `deno task test` | 9,574 passed, 0 failed |

**Lines: compiler +129 / −115.** Nothing is deleted. 112 of `wasmEmit.vl`'s lines move into the
shared tail (+116 / −112 there), and the IR side adds 13 net. This is a coverage step.
