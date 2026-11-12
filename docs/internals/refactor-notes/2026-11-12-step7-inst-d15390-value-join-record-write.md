# Step 7 inst: a record written as a value join joins each tail literal, 2026-11-12

Lane w321, D15390. Take `let r = { f: [id1] }` then `r = if c { { f: [id2] } } else { { f: [id3] } }`,
with the functions un-annotated and called at two types.

D15351 joins the list literal of a record written whole into a holder of a tagged set
(`ftRecWriteJoins`). It reached a written value only where that value was itself a record
literal. Both the gate (`recAsgFnWidenedTy` of the whole right side) and `ftRecWriteJoins` stop
at a value `if`. So the arms' literals were never joined into `r`'s set, and the global cell had
no row: `ref valtype with no interned shape`. The record solve already finds the place of each
arm literal (`recAsgPlaceOf` walks up through arms), so only the tag pass missed them.

## Changed

The store gate in `check_fn_tag.vl` walks the written value's tail leaves (`tailValueLeaves`).
It joins and notes each tail literal the record solve widens, as it did the one direct literal.
A direct literal is its own single leaf, so that case is unchanged.

## Measured

`scripts/capability-probes/matrix/record-of-hole-fn-list-written-by-value-join.matrix.vl`:

| | master | this branch |
| --- | --- | --- |
| runs, of 60 graded | 45 | 51 |
| un-annotated runs, of 30 | 21 | 27 |
| `runs → not-runs` | — | 0 |
| silent | 0 | 0 |

These cells moved to runs: `if_write`, `if_write_else_arm`, `else_if_write`, `match_write`,
`if_write_in_function` and `if_write_two_elements`, all un-annotated. These remain red:

- `if_write_one_literal_arm`, un-annotated: an arm that is a bound record, not a literal, is
  joined by no rung.
- `return_annotated` and `argument`, un-annotated: monomorphize refusals of the plain value.
- Every custom cell's annotated face: the annotation `((a: f64) => f64)[]` meets D15338's
  generic value floor (`cannot take the generic function as a value`).

D15391, the same list one record deeper, is a separate mechanism: D15351 stops the join at
depth 0, since the nested record's rows are minted apart.

## Proof

**Full local sweep.** Fixpoint seeds, base master `5e0a0ccf`, 23,962 programs:

| | count |
| --- | --- |
| same | 23,961 |
| bytes-only | 0 |
| output movers | 1 |
| runs → not-runs | 0 |
| new compiler traps | 0 |

The one mover is D15390, which goes from refusal to runs.
