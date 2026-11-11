# Step 7 codecs: `listRepOfMf`, `njVKind` and `listFitStoodKind` deleted, 2026-11-11

The second codec slice of `2026-11-10-step7-vkind-census.md` §4 item 5. It stacks on the read-rep
slice (`2026-11-11-step7-codecs-read-rep.md`, #7164). The base is that branch merged with master
`92de53cf`, whose fixpoint seed is 6,615,956 bytes.

## The census

| codec | encoding it decoded | its readers | writer of the encoding |
| --- | --- | --- | --- |
| `listRepOfMf` | an `MfKind` | 1: `mfKindOfListTy`, which searched the 7 `MfKind`s for the one whose list rep equals `repOfTy(ty).rdKind` | not a stored encoding: the inverse of a descriptor read |
| `njVKind` | a value-atom code (0, 3, 4, 5) | 2: `njBlockKind`'s numeric-union result, and the valtype of `njConvertArm`'s `if` | `njKindOfTy` on a type: a pair's `numPairOpTy`, and a conversion target |
| `listFitStoodKind` | a wasm type index (`listFitStoodWrap`) | 1: `emitScalarListCopy`'s stand-in arm | `emitIdentNode`, from `listFitCaptureStandIn`, which held the stood `K[]` type |

## What changed

- **`mfKindOfListTy` maps the descriptor's kind.** It is now an exhaustive `match` over
  `repOfTy(ty).rdKind`, so `MfKind` is derived from the rep. `listRepOfMf` had no other reader, so
  it is deleted.
- **The numeric-union dispatch asks the rep of the code's type.** Both `njVKind` readers become
  `repOfTy(numPrimTyOfKind(k)).rdKind`. The value-atom code is the dispatch's tag and conversion
  currency, and it stays. Only its `VKind` decode goes.
- **The stand-in records its type, not its wrapper.** `listFitCaptureStandIn` pushes the `K[]` it
  stood in onto `tyOut`. `listFitStoodWrap` becomes `listFitStoodTy`. The copy reads
  `scalarListElemOfListKind(repOfTy(listFitStoodTy).rdKind)`.
- **Deleted:** `listRepOfMf`, `njVKind` and `listFitStoodKind`.

## By design, and left

- **`spreadScalarVKind` is by design.** It is an exhaustive `match` from `MfKind` to the scalar
  `VKind` that the widening copy (`emitScalarListWidenTop`, `emitScalarListBoxTop`) takes. Its
  inputs are not a stored second spelling of a rep. They are the spread's own decisions
  (`spreadDestKind`, `spreadGroupSrcKind`, `catWidenSideOfBin`'s side), made in `MfKind`
  because that is the frame-slot key. Those decisions are derived from the descriptor through
  `mfKindOfListTy`, or from `spreadLitScalarElem`'s primitive ladder, which is an own-ladder row
  and not a codec. The widen helper converts back to `MfKind` for its slots
  (`scalarElemMfKind`). So the bridge goes only when `MfKind` is retired for a list rep at every
  spread, concat and scratch-slot site, about 50 of them. That is a step of its own.
- **`MfKind` itself** stays as the scratch-slot key (`mfRecordSrc`, `liKinds`, `scratchSlot`).
  That is a frame-layout key, not a second spelling of a rep.
- **The `$fnsig` token decoders** (`sigKeyRetKind`, `sigParamKindAt`, `repKindOfSigTok`) stand
  while `$fnsig` keys are strings. With this slice, the lane's §1.1 codec rows are done.

## The price, measured

`sweep.vl diff`, base fixpoint seed against candidate fixpoint seed (23,894 programs):

- **23,894 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

The stand-in arm's witnesses are in the population: `generics/is-list-arm-read-by-closure.vl`,
`generics/is-list-arm-other-function-closure-same-name.vl` and the D4935 row.

## Proof

- Refresh ×2 is a fixpoint at 6,616,007 bytes (+51).
- `scripts/gate.sh`: all 23 rows pass once the stand-in's comment was trimmed to 4 lines. That
  trim gives a byte-identical seed (`cmp`).
- The ladder, comment, sentinel and arena-scan budgets (`vl check --budget`) all exit 0.
