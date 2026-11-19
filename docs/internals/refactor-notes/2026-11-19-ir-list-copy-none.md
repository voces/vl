# IR: a list delivery that owes no copy, 2026-11-19

Family B of the `pre-path` blockers: the `listCopy` coercion (`coerceKindAt`). It is deferred from
the function-tag work, and taken now that most of its rows no longer pair with `array ref`.

## Sizing (census on master `2845744c0`, a probe seed naming the coercion kind and the tail's arm)

`pre-path coercion` alone was 154 functions on master: 110 `listCopy` (on the #9165 merge seed),
2 `recCopy`, and the rest `mapRetag`. Of the `listCopy` rows:

| arm of `emitListCopyTail` | functions |
| --- | ---: |
| ref-list pair, same slots (nothing owed) | 87 |
| scalar list, no convert (nothing owed) | 17 |
| ref-list widen | 4 |

The probe seeds were built straight to the scratchpad and never through `refresh-compiler.sh`.

## The change

- **One decision, `listCopyOwesNothing(exprIx, fnIx)`** (`wasmEmit.vl`). It answers whether the
  tail would write no byte past the value. None of these may hold: a record copy
  (`rcRecListsApart`), a numeric convert, a closure capture stand-in (`listFitCaptureStandIn`,
  which arms `listFitStoodIn` during the read itself), a list-of-lists convert, retag rows, the
  union-box refusal, or a ref-list widen.
- `emitListCopyTail` returns on it. `exprPrePathWhy` names no coercion for it, so the builder
  takes the node as a plain value. That is the same bytes legacy writes: `emitCoerced` writes
  nothing before the value for `listCopy`.
- `tests/vl_ir_shadow_test.ts`:
  - The list copy that owes nothing (distilled cell b004880) builds and matches.
  - The generic pre-path test's coercion witness is now a record copy into an `i64` field's row,
    which still owes.

## Readings (fixpoint seeds, master `2845744c0` against this change)

| reading | master | this change |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 35,492 | 35,622 (+130) |
| `pre-path coercion` alone | 154 | 8 |
| corpus covered = verified = matched (shadow) | | 35,622 |
