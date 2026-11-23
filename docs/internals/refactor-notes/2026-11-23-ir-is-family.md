# IR: `is` over a stored box, `is` against a map the box lacks, and the decided guard's block cut (2026-11-23, lane IR-N1)

Three classes of the `is` family (claims broadcast #8): `start: is arm tag box`, `is arm tag lacks`
and `decided is guard ends block`. Each is a legacy arm the builder named a miss rather than built.

## What landed

- **A box value's test at its storage** (`storedValueTagTest`): `emitIs`'s `storage` arm runs the
  ordinary rungs with the storage-read mark set, so its `box` arm reads the receiver at its
  storage, which is the declared box, then compares the tag. The builder reads a name or an element
  under the same mark. A member or other receiver stays a named miss (`is stored box receiver`).
- **`RListGet.lgStored`**: an element read the builder built at its storage is lowered under the
  storage mark, because the legacy read tails ask `isStorageRead` at lowering time. Without it the
  element read unboxed its narrowed arm.
- **`lacks`** (`isLacksTest`): a map type the box cannot hold. The receiver is evaluated and
  dropped, then the constant `false`, as legacy's `lacks` arm writes it. Both in the plain rung and
  at storage.
- **The block cut** (D932): a head statement `if` whose decided-true guard always exits
  (`guardEndsBlockWith`) is built with its then arm alone. `ifChain` answers `IF_CUTS_BLOCK`, and
  `stmt` writes an `STrap` with `tpWhy` `TRAP_BLOCK_CUT` behind it. `stmtRun` and `tailReturn` build
  nothing after that trap, as legacy's `emitFuncBody`/`emitStmts` cut the rest of the block behind
  `unreachable`. A guard on a later `else if` link stays a miss, since legacy cuts only after the
  whole statement.

## Legacy tails the IR calls

- `guardEndsBlockWith` (`wasmEmit`): an existing plan the builder already asked; now it also
  decides the cut.
- `storageReadEnter`/`storageReadLeave` (`emit_elab`): the `RListGet` lowering sets the mark
  around the existing read tails for a stored read.

## Bytes and coverage

- Self-compile `--names`: identical 9,037, differ 0. `--cases`: identical 7,712, differ 0.
  `--claimless`: identical 14,040, differ 0. `tests/cases` A/B: same 8,827, differ 0. The moved
  list is empty. Mode 3 self-compile is byte-identical to the legacy self-compile.
- `tests/cases` armed shadow: covered = matched goes from 79,147 to 79,197; start covered from
  6,794 to 6,809. `start: is arm tag box` 19 → 0, `is arm tag box` 14 → 0, `is arm tag lacks`
  18 → 0, `decided is guard ends block` 19 → 0. A few functions move on to their next blocker
  (`start index element coercion` +1, `start push receiver payload cast` +1, `start map get union
  box rep` +1, `start print boxNull` +1, `is box not a local` +1). The corpus and the self-compile
  census are unchanged.
- Rows: `tests/ir-shadow-rows/is-stored-box-and-lacks.vl` and `is-guard-ends-block.vl`. Each
  shows its miss on the base seed and covers and matches on the head.

## Fuel

L2 self-compile: +0.04% per PR on base 953e649b.
