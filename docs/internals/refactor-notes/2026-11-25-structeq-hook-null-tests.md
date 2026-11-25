# I8 re-entry: the record compare hook's null tests (lane COV-UNION, 2026-11-25)

The `structEq` hook (`structEq` → `nulStructEqGuardTail`) reached legacy's expression emitter
through each side's null test (`emitEqRootIsNull` → `emitEqIsNull` → `emitNulIsNullTest`), which
`ir-i8-sweep.sh` listed as `reentry emitNulIsNullTest`. This is step 1 of the hook's port.

- `nulStructEqGuardTail` is split byte-neutrally into `nulStructEqGuardOpen`, `Mid`, `Both`,
  `Close` and `nulStructEqFieldsAt`; legacy writes the same bytes through them.
- The IR's `RStructEq` lowering writes the guard itself (`structEqNulGuard`). Each side's null test
  is its own (`structEqSideNul`): a folded arm's constant (`nnfold`, `none`, `nulfold`), or the
  side read again (its variable's local, or a place the builder re-reads with `irHoistRecv`) and
  the arm's tail (`nullRef`, `nulStr`, `bool`, `atom`, `boxTag`). A stashed or element side, or
  another arm, keeps `emitEqRootIsNull`.

## Measurements

- `ir-identity.sh --cases`: identical 8252, fail under both 72, differ 0, expected divergence 3;
  witnesses same 86, differ 0.
- `ir-i8-sweep.sh --check`: `reentry emitNulIsNullTest` is gone; `--write-baseline` drops it.

## Left under the hook

`reentry emitChainRead` (51 programs: a field chain re-read from an expression root at every
field), `reentry refListReadAt` (7, an element root), `reentry emitIdxIndex` (1, the element's
index). Next: the field-wise compare driven from the IR, its roots read by the IR.
