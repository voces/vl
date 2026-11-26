# Layout family stage 1: a built record held at its storage row (2026-11-26, lane COV-START)

The coordinator gave COV-START the row-rep-versus-legacy-layout family. Collected across lanes it
is 26 programs, 37 function units and 4 inventory rows; regen-9 adds 19 programs. It also approved
the design: a value's rep follows its storage, and reads convert explicitly (DECISIONS.md, "A value's
IR rep follows its storage"). Stage 1 is the production half for built records that need no
conversion.

## Tried and dropped

- **A type-level rep from field codes.** Each record type's field kids were taken from its row's
  storage type (`sFieldStoreTy`) where the two parted at a function position, closure versus tagged
  id. It moved no unit: the units' literal types are hole-elaborated, so `structRowOfRecordTy`
  finds no row for them. The row keys the field untagged while the type is tagged. The field-code
  half survives as an accessor (below).
- **Moving every built record,** `rowlessRecordRep` widened past rowless types. It made 5 verifier
  failures (rule 2, a retag across rows laid out apart). Each was a maker's object literal moved to
  its row while the function's result stayed at the literal's own rep. Object literals are now
  excluded until stage 2 moves the result signature with them.
- **That rule over twin rows.** It newly blocked 4 functions (`field read of a stored row`), where
  a twin row lays its fields out in another order and the value already retagged as it stood. A
  value whose rep retags into the row now keeps its rep.
- **That rule over element reads.** It blocked one function
  (`generic-body-list-union-read-ops.vl`): an element read moved to a row its list is not laid out
  at. An element read now moves only off a list whose ref-list row holds that rep (`listRowElemIs`).

## The mechanism

`rowlessRecordRep` holds a built record value (no `Ident` or `Member` read) at its storage row's rep
(`storeRowTyOf`). It does so where that rep differs, except for two stage boundaries: an object
literal, and a value whose rep already retags into the row. Both are marked in the code as removed by
stage 2. An element read moves only where its list's laid-out row holds the row's rep.
`structRowFnSlotLayout` and `variantRowFnSlotLayout` (`emit_shape_rows.vl`) answer how a row lays
out a function slot: 1 a closure, 0 a tagged set's i32 id, -1 otherwise. COV-CLOS's D17015 tag pass
reads them.

## Measured

Master `2b7bca4e6`'s seed against this tree's, both built by the same seed:
- **tests/cases, per program** (every uncovered or failing class, program by program): only gains.
  - `soundness/generic-list-call-binding-beside-own-instance-runs.vl`: start uncovered → claimed.
  - `soundness/list-callback-at-kept-maker-build-runs.vl`: start and a function uncovered → claimed.
  - `records/built-record-join-binding-read.vl` and `built-record-stored-into-nullable-field.vl`: a
    function moves from `object field coercion` to `map read default rep`.
- Armed census (tests/cases): 97,115 → 97,116 functions covered and verified, 96,887 → 96,888
  matched. No verifier failure, and no new mismatch class.
- Claims mode (`--claims`, shipped): no claim falls back.
- `distilled/regress.vl`: no runs lost. Its movement list is identical to master's seed.
- Each gained program prints the same output on legacy, under `$VL_IR_STRICT=1` and on master.
- The sweep `tests/cases/records/kept-maker-result-at-storage-row-positions.vl` covers an element of
  a generic call's list bound at the record, one read in a function, and a `filter` and a `map`
  callback, beside the generic's own-type instance. Its start body misses `index element coercion`
  on master and is matched on the head.
- Writing the sweep found D17641: the same shape delivered as a call argument is check-clean invalid
  wasm on master and on this tree alike. It is filed, and it goes next.
