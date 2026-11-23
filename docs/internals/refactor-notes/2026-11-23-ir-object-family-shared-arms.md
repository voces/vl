# Object-family batch: shared-read arm forms, field retags, arm cells (2026-11-23, lane IR-N5)

Three mechanisms, one commit each. The measurements are in the PR body.

## Shared-read arm forms

`emitSharedFieldArm` wrote each member's arm of a shared field read along a ladder of nine
forms, and the IR's lowering repeated three of them (`sharedArmIsPlain`, `sharedArmIsBox`, the
null constant). Every other form was a `member box` miss.

- `sharedArmModeOf` names the form, a closed `SharedArmMode`: `null`, `litAtom`, `setToStr`,
  `strToAtom`, `nulSetBox`, `read` (the field's read, boxed where the plan boxes).
- `sharedArmHead` writes what goes before the receiver push, `sharedArmTail` what follows it;
  `sharedArmModeReads` says whether the form pushes the receiver at all.
- Legacy's `emitSharedFieldArm` and the IR's `sharedReadArm` are both head, receiver, tail. They
  differ only in how the receiver is pushed, so their bytes agree by construction.
- `sharedReadPlainOf` no longer asks about the arms.

## Object field retag

A field value that is the field's own record or list as it stands (a list twin, a union-box list,
a variant record at its struct twin, a record on the field's heap or a declared subtype's, or a
value apart only in a hole) is retagged, as a binding and a return already were (`retagAsStands`).

## Arm cells built at their variant row

Legacy builds a binding whose cell is a union member's bare variant (`letCellKind` `variant`, or a
module cell's `startInitArmOf` `variant`) through `emitVariantCoerce`: an object literal at the
variant row (`emitVariantStruct`), whose explicit `null` field is `ref.null none`. The IR built
the literal at the struct row, whose typed-null arm writes the field's own heap. Both are valid
wasm, so nothing trapped. On master a function the IR covered here shipped bytes legacy does not
write. `variantCoerced` now builds such an initializer as `emitVariantCoerce` does, for a local
(`letIsArmCell`, `letArmCellRow`) and for a module cell (`globalInitVariant`).

`letArmCellRow` is `letCellSlot`'s `variant` answer with nothing minted. The IR must not call
`letCellSlot` early, because its mints (`letAnnMint`, `letListRowMint`) would move row indices.

## Not taken: a nullable map field's typed null

`emitOmittedFieldNull` writes a nullable map field's null as the map's `ref.null`, and the IR
leaves that field to legacy (`object field explicitNull typed null`). Widening the IR's test to
it matched every program measured, but `tests/ir-shadow-rows/explicit-null-typed-ref.vl` records
why it stays out: the map's heap is one a later mint may move. That reason is not answered here.

## Caveat carried from the `.length` arm (#9667)

`listFitGrowRow`'s per-function scan (`listFitGrowScan`) also registers scratch list slots
(`listFitSlot` pushes `liKinds`, `liSlots`, `liBack`), memoised per function. Whichever side scans
a function first registers them. Before #9667, master's `lengthIsField` already scanned from the
IR side. Removing the legacy path has to keep that registration, or move it to a pass, so the slot
numbering does not change.

## Legacy tails the IR calls

- `sharedArmModeOf` (wasmEmit): the form of a shared read's member arm, asked by `sharedReadArm`.
- `sharedArmModeReads` (wasmEmit): whether that form pushes the receiver.
- `sharedArmHead` (wasmEmit): what an arm writes before its receiver push.
- `sharedArmTail` (wasmEmit): what an arm writes after it; replaces `sharedArmPlainTail` and `sharedArmBoxBody`.
