# Step 7 codecs: `MfKind` retired for `ListKind`, the non-null list `VKind`s, 2026-11-11

`MfKind` (`"i32" | "f64" | "ref" | "str" | "i64" | "f32" | "u8"`) was a second kind enum beside
`VKind`. Since #7181 it is derived from the descriptor (`mfKindOfListTy` maps
`repOfTy(ty).rdKind`), so it was a duplicate encoding of a list rep. This slice stacks on #7181,
merged with master.

## The census

There are 84 `MfKind` references in 7 compiler files. By role:

| role | sites |
| --- | --- |
| the type and its columns | `mfSrcKinds`, `mfDstKinds`, `liKinds`, `lhKind`; the fields `IdxStore.mfKind`, `ForInBacking.hKind` and the for-in loop's `hKind` |
| producers from the descriptor | `mfKindOfListTy`, with `mfRecvKindOf`/`mfResultKindOf` forwarding it; `spreadDestKind` and `spreadGroupSrcKind` choosing among them |
| producers from a primitive ladder | `spreadLitScalarElem`, `listFitElemKind`, and three literal ladders in `wasmEmit.vl` (the `is` fit's scalar, the index-store kind, the hoist kind) |
| producers from another kind | `listIdxKindOf` and its duplicate `scalarElemMfKind` (scalar element → list), `reserveMfKindOfSlot` (slot kind → list), `njMfKind` (value-atom code → list), `spreadPendingScalar` (`LBK` build code → list) |
| frame-slot keys | `scratchSlot`, `mfFrameIndex`, `mfRecordSrc`/`Dst`, `mfSrc`/`DstLocalFor`, `njSlot`, `listFitSlot`, and the slot helpers (`numLitCastSlot`, `widenScalar*Slot`, `spreadGroupWrapSlot`, `spreadDstBackSlot`, `listIdxWrapSlot`, `listBackStashSlot`, `listElemStashSlot`, `listIdxValSlot`, `liveHoistRow`, `listHoistRow`) |
| heap-type dispatch | `emit_bytes.vl`'s source/dest/lazy-frame `match`es, `spreadWrapIdx`/`spreadBackIdx`, `hoistWrapTyOfRow`, `emitListEmptyLoop`, `emitListLenOnStack`, `mfSrcTysOf`/`mfDstTysOf`, `pendingKindOfMf` (list → `LBK` build code) |
| bridge back to `VKind` | `spreadScalarVKind` |

Every one of `MfKind`'s 7 members names exactly one of `VKind`'s 7 non-null list reps:

| `MfKind` | list rep |
| --- | --- |
| `i32` | `list` |
| `u8` | `u8list` |
| `i64` | `i64list` |
| `f32` | `f32list` |
| `f64` | `f64list` |
| `str` | `strlist` |
| `ref` | `reflist` |

So each site can read the list rep directly.

**The frame-slot keys need no small-int code.** Every key compares by equality (`liKinds[k] ==
kind`, `lhKind[k] == kind`), so a `VKind` spelling keys them as well as an `MfKind` did. No total
map to an int is added.

## What changed

- **`MfKind` is deleted. `ListKind` replaces it:** `"list" | "u8list" | "i64list" | "f32list" |
  "f64list" | "strlist" | "reflist"`. That is `VKind`'s own non-null list spellings as a closed
  subset, so every `match` over it stays exhaustive and `_`-less. A `ListKind` is a `VKind`.
- **Every literal site is respelled through the checker.** It refuses a non-member match arm, a
  comparison with a non-member literal and a non-member assignment, so no site can keep an old
  spelling silently.
- **The checker cannot see one direction:** a value flowing out into a `VKind` or `string`
  context. `MfKind`'s `i32`, `f64` and `str` were `VKind` spellings too. To find those flows, a
  scratch copy of the tree gave `ListKind` spellings outside `VKind`. The checker then flagged one
  flow: `listFitElemKind` assigned its kind into a `VKind` it handed to `scalarListBack`/`Wrap`.
  It now asks `spreadBackIdx`/`spreadWrapIdx`, the `ListKind` dispatch that answers the same heap
  types.
- **The probe cannot see a flow into a plain `string` either.** `cases_wasm` caught one:
  `emitAsNumLitScalar` compared the function's result kind (`rk`, a `string`) with its stash key
  `sk`. That key was a scalar spelling all along, so the comparison is now
  `rk != listKindElemKind(sk)`. A lister then printed every use of a `ListKind`-typed name that is
  not a literal comparison, a `match`, or a `ListKind` parameter. It found no other flow. Every
  read of the kind columns (`liKinds`, `lhKind`, `mfSrcKinds`, `mfDstKinds`, `.mfKind`, `.hKind`)
  compares against the new spellings or passes to a `ListKind` parameter.
- **Deleted:**
  - `scalarElemMfKind`, a duplicate of `listIdxKindOf`; its 4 callers take `listIdxKindOf`.
  - `njMfKind`; `njSlot`'s key is `listIdxKindOf(repOfTy(numPrimTyOfKind(k)).rdKind)`.
- **`spreadScalarVKind` is renamed `listKindElemKind`.** With both sides `VKind`, it is kind
  algebra (`VKind` → `VKind`, `listIdxKindOf`'s inverse), not a codec. A string and a ref list
  name their own kinds there, so it is not `scalarListElemOfListKind`, which answers null for
  them.
- `reserveMfKindOfSlot` becomes `reserveListKindOfSlot`, and `pendingKindOfMf` becomes
  `pendingKindOfList`.
- `compiler/lint.vl`'s closed-set table and `scripts/vkind-census.vl` name `ListKind`.

## By design, and left

- **The `LBK` build code** is a third encoding. `pendingKindOfList` (list → code) and
  `spreadPendingScalar` (code → list) convert between it and `ListKind`. It also carries
  non-list-kind builds (`LBK_UNION`, `LBK_REF_AT_SLOT`, the nullable-element lists), so it is
  not a duplicate of `ListKind`. `spreadPendingScalar` is a decoder of it, and the next codec to
  look at.
- **The primitive ladders** (`spreadLitScalarElem`, `listFitElemKind`) are own-ladder rows, not
  codecs.

## Proof

- One refresh: 6,616,871 bytes.
- Expected byte-identical. The CI `sweep` label proves identity; its summary goes in the PR.
- `cases_wasm`: 7,436 passed after the `emitAsNumLitScalar` fix. Before it there was 1
  `runs → not-runs` (`literal-unions/as-num-litunion-scalar-member-test.vl`), the flow above.
- `distilled/regress.vl`: no runs lost. It reports 2 other movements, `d15317_d380` and
  `d15317_d380_if_join`, invalid wasm → loud check reject. Both are checker-stage outcomes, and
  this change touches the emitter only.
- Clean: `lint-self` + fmt, `ladder-sets`, rep-fuzz, `ci_proof_test`, `vl_kind_ladder_test`,
  `vl_literal_byte_write_test`, `vl_scaling_shape_test`.
- Budgets exit 0: export, ladder, comment, sentinel, scan and render-parse.
