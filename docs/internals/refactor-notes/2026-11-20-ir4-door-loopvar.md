# IR door: a fragment reads the loop variable of a walk it did not build (2026-11-20, lane IR4)

The self-compile's door missed 36 times as `read of <local>`: str 9, i32 26, ref 1. Every one
was a list literal reading a `for` loop's variable, as in `for tp in xs { const ys = [tp, "z"] }`.
The function is covered whole. Only the door fragment missed: it never built the `ForIn`, so the
`LoopVar` had no IR variable, and `identRead` admits a `LoopVar` only through its walk.

## The change

- **`IrFn.irFragment`** is set where `lowerNodeIn` creates the fragment's function, and is false
  for every whole-function build. It is a property of the function under construction, so
  nothing is set and cleared around a call.
- **`identRead`** admits a `LoopVar` in a fragment. **`fragLoopVar`** then takes the walk's
  variable if the fragment built one, else the element's legacy slot (`declaredSlotOfDecl`) at
  the read's own rep and type.
- **`lowerNodeIn`'s existing check holds every fragment local to legacy's cell**
  (`irSlotRunAgrees`, "local cell rep"). So a cell whose run differs from the read's rep misses
  rather than reads wrong, whether it holds a string's code unit, a packed byte, or a map's key or
  value. A whole-function build is unchanged: a walk declares its variable before any read.

**Witnesses** (one control in `tests/vl_ir_door_guard_test.ts`): a string walk, a `u8[]` walk,
`for k, v in m`, `for i, x in xs`, a loop variable a closure in the body captures, and a nested
loop reading the outer variable. All seven literals miss as `read of` on the merge-base. On this
branch six match, and the closure's literal misses by name (`callee captures`). Each program runs
to its expected value.

## Measured

Fixpoint seeds: merge-base c4a2c8fdb against this branch.

| | merge-base | this branch |
|---|---:|---:|
| self-compile door matched | 13,635 | 13,671 (+36) |
| self-compile door `read of <local>` | 36 | 0 |
| corpus + cases door matched | 35,686 | 35,690 (+4) |
| corpus + cases door `read of <local>` | 67 | 63 |

The 63 left in the corpus are not loop variables: they are closure captures and the like
(`closures/capture-by-reference.vl`, for example). Function coverage does not move (93,695
corpus + cases, 18,513 self-compile), since the door alone changes. No row reads `fail`,
`differ` or a verifier miss that the merge-base lacks.

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `--cases` | identical 7,523, differ 0; witnesses 59/59 |
| master-vs-head A/B, 7,591 programs | built 7,523, differ 0 |
| mode 3 | identical; claimed 18,513 (merge-base 18,512) |
| L2 fuel | +0.006% on the merge-base |
| `gate.sh --fast` | passed |

**Lines: compiler +22 / −2, tests +49.**
