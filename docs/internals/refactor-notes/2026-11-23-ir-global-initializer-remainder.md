# The global initializer remainder: null-only calls, box maps, declared list cells, holder nulls (2026-11-23, lane IR-N5)

`start: global initializer coercion` was 13 tests/cases programs on master b03c57be (after #9728).
Six are this lane's; the other seven are M1's field-storage set. A probe naming the value and cell
reps put all six at `globalInitValue`'s plain arm, in four families:

| family | programs | value → cell |
|---|---|---|
| a null-only call at a sentinel cell | `inference/null-only-inferred-return.vl` | `null` → `boolean \| null`, `K \| null` |
| a union-box map at a wider union's map | `maps/union-valued-maps-share-one-struct.vl` | map → map |
| a hole-fn list of lists from a generic call | the two `generics/hole-fn-list-of-two-results-*` | list → list |
| a holder record read from a map | the two `closures/bundle-record*` | nullable record → record |

The first three are not specific to globals: the same value at a local is `declaration coercion`.

## The change

- **Null-only call.** Legacy's direct-call tail (`emitDirectCallTail`, D1567) drops a null-only
  callee's result and writes the sentinel where the call's null is `boolean | null`'s or `K | null`'s.
  The builder's call does the same (`nulNoneCallSentinel`).
- **Bottom ref.** A `null`-typed value delivered at a nullable reference is retagged to it. The
  verifier's retag rule admits `repNullRefFits`.
- **Box maps.** `boxMapRetag` (`ir.vl`) is `boxListRetag` for a map's values: two maps of union
  boxes are one map. It is admitted by the verifier's retag, a local's binding and a global's.
- **Declared list cells.** A global whose open type has no valtype is noted at the value's rep where
  the global section declares the cell at that rep's valtype (`cellDeclStores`).
- **Holder nulls.** A holder global legacy declares nullable takes its record or null, so its cell
  is noted at the nullable record (`holderCellTakesNull`).

New test cases:
- `inference/null-only-call-at-a-sentinel-or-ref-cell.vl`
- `maps/union-valued-map-bound-at-a-wider-union.vl`
- `generics/hole-fn-list-of-lists-held-by-a-module-global.vl`

## Legacy tails the IR calls

- `letCellSlot` (`emit_classify.vl`), from `cellDeclStores`. The global section has already called
  it for every start-initialized global before any body is built, so this call re-reads a minted row.
- `globalIsNonConst` (`emit_query.vl`), from `holderCellTakesNull`.

## Not in this change

- The holder globals' reads: the null test reads the nullable record cell at the closure's
  `F | null`. That is `start: global read coercion`, now the start blocker of both bundle programs.
- `maps/union-valued-maps-share-one-struct.vl` stops next at `start: global initializer mapBox`.
