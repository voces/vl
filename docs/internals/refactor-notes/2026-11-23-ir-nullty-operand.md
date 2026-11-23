# IR: a `nullty` null test's operand, as legacy reads and drops it, 2026-11-23

Lane IR-N6, the class `null test nullty operand` (the coordinator's ruling put it under rowless
records). #9702 admitted only a bare name; every other operand was refused by that sentence.

## The mechanism

Legacy's `nullty` arm is `emitDeadNullTest`: a non-name operand is emitted and dropped, then the
constant. Its bytes for a field are `drop (struct.get $row k (local.get $g))`, a plain read of the
stored field at the field's own rep. `nulTestNullTy` now writes the same:

1. a name: the constant alone, as before;
2. a field: read raw at its storage (`rawFieldRepOf`, then `irMemberHook`, as `staticSideOf`
   reads one) and dropped;
3. a field whose storage rep no row decision names (a module global or a callback parameter of a
   record type no row records): still `null test nullty operand`, since reading it at the node's
   own `null` disagrees with the row its receiver is held at (verifier rule 2 on D14504's witness);
4. anything else: built for its effect (`exprAt`) and dropped.

A field read off a built value (a call result) now follows the row the value half stores it in:
`declRowReadTy` answers a non-name, non-member receiver's storage row (`rowlessRecordTy`), so the
reader's receiver rep and the built value agree. Without it, `mk().f == null` stops at `field read
of a stored row`.

`map read mv value rep`: the 9 map-default cells the null test now lets through reach a map read
whose out is the storage row while the map's own rep still carries the rowless value type. They
used to fall back at the verifier ("a map read's mv slot yields no value of its map"); the builder
now refuses them by name, with the verifier's own test, until the map's value rep carries the row.

## Legacy tails the IR calls

None new.

## Readings (fixpoint seeds on both sides, master ff34a69e)

Functions with no blocker, `VL_IR_SHADOW=4`: tests/cases 79,078 -> 79,080; distilled corpus
45,451 -> 45,451. `null test nullty operand`: corpus 14 -> 4, tests/cases 22 -> 16. The 9 corpus
map-default cells now stop at `map read mv value rep`.

| tests/cases program | change |
| --- | ---: |
| `null/nullty-null-test-operand-runs-once.vl` (new witness) | +1 |
| `soundness/list-callback-at-kept-maker-build-runs.vl` | +1 |
| `structs/map-callback-record-result-over-built-list.vl` | +1 |
| `closures/hole-fn-in-nested-maker-record-read-inline.vl` | -1 |

What stays at the class (corpus 4, tests/cases 16): a field off a receiver held at a row no
decision names, mostly a callback's parameter over a list built from a rowless literal and module
globals. The place half of the rowless rule reaches lets, not parameters or globals; the next step
is that rule's place half at those, on the same predicate.

The price: `closures/hole-fn-in-nested-maker-record-read-inline.vl`, one function now at `field
read coercion`. The receiver extension reads a call's fields at the value's storage row; this call
(a maker over a hole function, `mk2(f).r` and its kin) is built at its instance's result instead,
and the two disagree on the nested record field. It falls back to legacy. Excluding calls of a
function with an unannotated parameter did not win it back (the call names the instance, whose
parameters are concrete); the next batch needs the call builder's own result rep at the read.

Witness: `tests/cases/null/nullty-null-test-operand-runs-once.vl`, where each dropped operand is a
call that prints and counts; it prints `mk 0 mk true mk false 3` under both seeds, so each operand
runs exactly once. Shadow row `tests/ir-shadow-rows/rowless-nullty-operand.vl` (was the refusal
row in #9702).

Legacy lines deleted: 0. Moved to `@ir`: 0.
