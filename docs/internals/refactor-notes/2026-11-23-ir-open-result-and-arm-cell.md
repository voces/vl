# Open results at the declared descriptor, and nullable arm cells (2026-11-23, lane IR-N5)

Three mechanisms, one commit each. The measurements are in the PR body.

## A narrowed arm unboxed into a nullable arm cell

`let c: O | null = u`, with `u` narrowed to the arm `O`: legacy's `emitLetDelivery` casts to the
cell's heap as a nullable ref because the cell's kind is `nulvariant`, whatever the value's own
nullability. The IR's arm unbox asked the value alone (`armUnboxNullable`) and wrote the non-null
cast.
- `RArmUnbox` carries `uaCellNul`. The `let` path sets it where `letCellKind` is `nulvariant`
  (`letCellNulArmUnbox`).
- The arm unbox's predicate and builder are split out of `deliver` (`armUnboxOwed`,
  `armUnboxTemp`), so both paths build one node.
- `emitArmUnboxAtCell` writes the cast. The heap is the narrowed arm's record either way: a
  `nulvariant` cell's destination heap is that arm's.

## A bare variant's nullable self-typed field

`variantFieldPlain` admits the case `structFieldPlain` already had: a `nulstruct` field whose
target heap is the arm the read records (`rowStoresArmRead`, shared by both). It was reverted from
the parameter batch because it exposed the cast above. It re-lands here.

## An open result at legacy's declared result descriptor

M1's thunk batch (#9696) types an open result by its rep's own type where that round-trips. Where
it does not, the thunk now takes the type legacy's functype returns: the result descriptor
(`fRetKind`, `fRetStructIdx`) through `repDescTy` (`resultDescTy`).
- The rep comes from that type too, because the thunk tail-calls a function whose wasm result is
  that kind.
- It is marked `irRetFromRep`, so the verifier checks the forwarding (`thunkForwardWhy`).
- A function's own result is held at the same type only where its type has no value rep
  (`resultFrameTy`).
- Widening a function's result to every open type was measured and refused: it took 17 functions
  out of coverage on the thunk programs.

New test cases:
- `closures/hole-fn-handed-out-by-a-lambda-called-through-its-thunk.vl`
- `unions/narrowed-arm-into-nullable-arm-cell-walks-own-field.vl`

## Legacy tails the IR calls

- `emitArmUnboxAtCell` (wasmEmit): the arm unbox with the destination cell's nullability; replaces `emitArmUnboxAt`.

## Not taken

Member record (a), (c) and (d) are not plain predicate admits:
- (a) needs legacy's atom-to-string widening at the read.
- (c) reads through a captured shared cell.
- (d) is one nullable-variant read.
