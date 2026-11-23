# IR: a function-value call with an atom at a string, or a list at a nullable list, 2026-11-23

Lane IR-N4. Base: train GM1's tree, master 10cbad910 with #9786 (batch 1), since both batches widen
`callRefArgPlain`. Batch 2 of `call of a non-declaration`: the `atomToStr` arm (4 rows) and the
nullable scalar list (4 rows).

## Change

- **Atom at a string parameter.** `emitCallRefArg`'s `atomToStr` arm is `emitAtomToStr`, the atom
  decode, which the IR already builds as `RAtomStr` (`atomToStr`). `callRefArgPlain` counts the arm
  as plain. `closureCallAt` builds the atom and decodes it at the parameter's string rep
  (`closureArgAtomStr`). The builder keeps its own named misses (`atom string source`, the nullable
  decode).
- **Scalar list at a nullable list parameter** (`f64[]` and `u8[]`, as two classes). The
  `scalarList` arm is `emitExpr`, and `emitNonNullParamRecover` writes nothing for a `nul*list`
  kind. `callRefArgPlain` takes the kind unless a narrowed arm needs unboxing. `closureCallAt`'s
  as-is check takes the list itself under the parameter's nullable (`nulListTakes`, `scalarList` arm
  only).

As in batch 1, `callRefArgPlain`'s only legacy reader is `emitCallRefArg`'s 1/0 return, which feeds
the shadow's plain-call record alone, so no legacy byte moves. The empty legacy A/B shows it.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `callRefArgPlain` (widened) | `emitCallRefArg`'s plain-call record (shadow only); `callRefPlainKey` (IR only) |
| `closureArgAtomStr` | `emitCallRefArg`'s `atomToStr` arm, through the IR's `atomToStr` (`emitAtomToStr`) |
| `nulListTakes` | `emitCallRefArg`'s `scalarList` arm |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

`tests/ir-shadow-rows/closure-call-atom-and-nullable-list.vl` covers:
- an atom at `string` and at `string | null`;
- `f64[]` and `u8[]` at a nullable list parameter, non-null, nullable and null, each callee reading
  `.length` or an element behind a null check.

The null cases print `-1`, so the null passed as null.

READINGS
