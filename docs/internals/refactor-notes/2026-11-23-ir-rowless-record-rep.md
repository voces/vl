# IR: a record type no struct row records, at the row legacy stores it in, 2026-11-23

Lane IR-N6, the follow-up the map family named (`map read default rep`). The coordinator scoped it
as one general rule: a record type with no struct row reps as the row that stores it. Both halves
call one predicate and neither restates it.

## The rule

`rowlessStoredTy(t, rep, rowTy)`: the storage row type `rowTy` where a value of record type `t` at
rep `rep`, a type `structIndexOfTy` gives no row, is held at that row's rep; else -1. Each point
names the row it stores the value in:

1. **A built value** (`exprRepOf` -> `rowlessRecordRep`): the row `structIndexOfExpr` names.
   A read of a place (an `Ident` or a `Member`) is excluded: it holds its place's rep.
2. **A place** (`rowlessLetTy`): a `let`'s slot row (`irSlotRowTy`). Its reads are taken at that
   row (`localReadStored`, `declRowReadTy`).

A value whose rep the rule moved is typed at the row's recorded type wherever the IR mints its
temp or out local: `outTyOf` (via `rowlessRecordTy`) at `irBLetTemp`, the coalesce and map-default
outs, a valued `if` chain, a reference join, a valued switch and `objLit`.

Also in the batch: legacy's `nullty` null-test arm (`emitDeadNullTest`) where the operand is a
bare name, which legacy writes as a constant. An operand legacy reads and drops is refused by name
(`null test nullty operand`); the IR has no read of a field at its storage row's rep for a
`null`-typed node.

## Refused shape: the rule at every node

Applied to every node's rep, the rule lost tests/cases 71,771 -> 71,654 (`narrowed read` +109,
`field read of a stored row` +22): a place's cell keeps its own type's rep, so a read of it
disagreed with the cell. The place half is that decision made for the place itself.

## What stays open

- The 12 `map read default rep` cells: 9 now build, and the verifier refuses them ("a map read's
  mv slot yields no value of its map"), since the map's rep keeps its value type's rowless record
  while its mv slot stores the row. Next: the map's value rep takes `mvValStructIdxOf`'s row, a
  third call of the same predicate. That row is `structRowOfRecordTy(nonNullTy(valueTy))`, a function
  of the value type and the program's row table, not of the site. The same 9 also need the
  `nullty` read of a field, so they stay unclaimed here (they fall back to legacy).
- IR-M1's start rows (3 argument coercion and object field row rep, 7 open temp type) do not move.

## Legacy tails the IR calls

None new.

## Readings (fixpoint seeds on both sides, master e4642aa0)

Functions with no blocker, `VL_IR_SHADOW=4`: tests/cases 71,771 -> 71,781; distilled corpus
45,405 -> 45,405.

| tests/cases program | gained | class it left |
| --- | ---: | --- |
| `maps/record-join-into-map-union-field.vl` | 3 | `ref if arm rep` |
| `objects/join-binding-adopts-union-field-record.vl` | 1 | `ref if arm rep` |
| `functions/field-completion-coercion.vl` | 1 | `object field count` |
| `objects/empty-object-all-nullable-runs.vl` | 1 | `object field count` |
| `structs/nul-distinct-scalar-list-field.vl` | 1 | `object field count` |
| `objects/object-shape-unannotated-literal-rebuilt.vl` | 1 | `declaration coercion` |
| `soundness/covariant-record-field-read-only-runs.vl` | 1 | `field read of a stored row` |
| `soundness/fresh-list-element-built-at-wider-record-runs.vl` | 1 | `index element coercion` |
| `structs/inline-record-nullable-field-twins.vl` | 1 | `return coercion` |
| `generics/annotated-written-let-of-generic-read-as-itself.vl` | -1 | now `local slot shared across reps` |

The one loss: a generic's annotated record of a closure field, `const r: {f: (t: T) => void}`,
whose `let` the place half moves to its slot row in one instance while the slot is shared at
another rep. It falls back to legacy; it is the rule's price.

Armed tests/cases: covered 71,781, matched 71,780, with no failure beyond master's own.
`--cases` identical 7,683, differ 0, witnesses same 61.

Legacy lines deleted: 0. Moved to `@ir`: 0.
