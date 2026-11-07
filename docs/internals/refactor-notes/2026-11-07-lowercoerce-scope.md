# `lowerCoerce`: what one table would collapse (2026-11-07)

Step 5's target is one `lowerCoerce(srcRep, dstRep)`. This note counts what stands in its place
today, at master `dea6eb8b`, and says which sites a recorded (src, dst) pair would collapse.

## The partial table

`coerceKindAt(ix, fnIx)` / `emitCoerced` (wasmEmit) is the table. `emitExpr` consults it at every
position (`wasmEmit.vl`, the `ck` read in `emitExpr`). It has five kinds, each keyed by a checker
record at the node: `listCopy` (`listCopyTyOf`), `fnClo` (`fnCloCoerceTyOf`), `mapUnbox`
(`mapUnboxTyOf`), `mapRetag` (`deliveryRetagHas`) and `recCopy` (`recCopyRowAt`). A delivery with
one of these records needs nothing from its position.

## The per-position ladders

Everything else is decided by the position, from its own flags (the slot's `VKind`, the return's
`retF64`/`retUNm`, a field's storage kind). Call sites in `wasmEmit.vl` + `emit_sections.vl`:

| conversion | helper | sites | positions |
|---|---|---|---|
| numeric widening | `emitExprAsI64` / `F64` / `F32` | 29 / 28 / 30 | 33 functions; 25 of them call all three by a destination kind |
| union boxing | `emitUnionBoxArg` | 26 | 23 |
| | `emitUnionCoerce` | 11 | 10 |
| | `emitVariantCoerce` | 8 | 8 |
| | `emitUnionBoxAtRecord` | 8 | 7 |
| narrowed-arm unboxing | `emitNarrowedArmUnboxTo` | 16 | 12 |
| atom → string | `emitAtomToStr` | 18 | 18 |

The positions that repeat most of the families: let-init (`emitLetInitValue`), return
(`emitReturnCoercedValue`), assignment (`emitAssignIdent`, `emitAssignGlobal`, `emitAssignIndex`),
arguments (`emitDirectArgValue`, `emitDirectArgUnbox`, `emitCallRefArg`, `emitCapturedCall`),
fields (`emitStructFieldValueUnder`, `emitStructFieldStoreValue`, `emitVariantField*`), index store
(`emitIdxStoreValue`), push (`emitPushValue`, `emitPushOne`), global init
(`emitStartGlobalInitValue`, `emitGlobalInitArmUnbox`), fn-tag dispatch (`emitFnTagDispatch`) and
map set (`emitMapSetValExpr`). The `??` lowering (`emitCoalesce*`, 12 functions) is a fourth
consumer of the same four families.

## What a recorded pair collapses

- **Union boxing** has its record: `boxDstTyAt` (the checker's per-instance box union,
  `nodeBoxTyIxOf` / `elabNodeBoxAt`). `box_dst_shadow.vl` compares it against the union each site
  names. Where they agree, a `box` kind in the table replaces the site's `emitUnionBoxArg` /
  `emitUnionBoxAtRecord` call. `emitVariantCoerce` builds a bare variant struct for an arm cell,
  which is a build at the destination, not a conversion, and stays.
- **Numeric widening has no record.** The destination's numeric kind is read from position flags
  only; the checker records no (src, dst) pair at a widened node. The `emitExprAs*` helpers also do
  more than widen: a literal is emitted at the destination (`emitInstLitAs`, `emitAsgLitAs`,
  `emitAsgRadixAs`), and a number union converts at its held member (`emitNumUnionConvert`). The
  first collapse therefore needs a recorder first: at each delivery whose source and destination
  are different numeric primitives, the pair, read at emit time through `nodeSrc` like the other
  five. The literal and union arms stay in the helper, and the table holds the four plain pairs
  (`i32→i64`, `i32→f64`, `f32→f64`, `i32→f32`).
- **Narrowed-arm unboxing** and **atom → string** are conversions of one value to a wider or
  differently stored type, and fit the table once their source is recorded. The narrowed arm's
  source is the narrowing (`emitEqRecoverNarrowed`'s reads), not the node's type, so its record is
  the narrowed member.

## What stays outside the table

Builds at the destination: literals emitted at the destination type, closure bundles, mono's
materialisation (`monoCoerceBundleArgs`) and `box_dst_shadow.vl`'s destination half (the union a
box is built at). A table entry converts a value already built at its own rep.

## Order

1. A numeric-pair recorder, shadowed against the 25 three-way positions (the brief's step 3).
2. `box` from `boxDstTyAt` where `box_dst_shadow` grades every site agreeing.
3. Narrowed-arm and atom → string, each after its source is recorded.
