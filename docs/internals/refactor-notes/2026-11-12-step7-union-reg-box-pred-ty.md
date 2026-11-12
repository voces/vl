# Step 7 L6 (step C4): the box-destination predicates ask the type, and two name producers go, 2026-11-12

The base is master `f147d6fe2`, after C3a (#7443). C3b is #7450.

## Changed

Since C3a, `emitUnionBoxArg` and `emitUnionBoxOwed` name a box from its type. But the callers
still built a name, because a test on that name decided whether to box at all. Those tests now
ask the type.

| site | was | now |
| --- | --- | --- |
| `boxOwedAt`, `boxDstTyOf` | `boxRecordNameOf(r) != ""` | `boxRecordOwed(r)`: the record's rep is a union and `boxTyName` of its box type is non-empty |
| `emitCoerced` (`box`) | passed `boxRecordNameOf(bt)` | passes `""` beside `boxRecordUnionTyOf(bt)` |
| a union local's assignment | `recNm != ""` picks the record's union | `boxTyName(recTy) != ""` picks the record's type |
| `boxDstNameAt` | the record's name, else `unionNameOfExpr` | `boxTyName(boxDstTyOf(..))` |
| a union-element list literal | `rlUnionNameOfTy(..) != ""` | the slot's element kind is `RLK_UNION`; the box is passed the element type alone |
| a union global's start-block and const-cell inits | `letUnionNameOf(..) != ""` | the cell kind is `union`; the box is passed `letBindingUnionTy`, or the record's row type |

`boxRecordNameOf` (wasmEmit) and `rlUnionNameOfTy` (emit_classify) are deleted. `boxTyName(ty)`
is `boxDstName("", ty)`: the box name a type alone derives.

## Census

A scratch probe compiler was run over all the cases and cells. At each site it compared the
caller's name with `boxTyName` of the type passed beside it (`E` empty, `N` non-empty):

| site | NN same | NN diff | EE | NE or EN |
| --- | --- | --- | --- | --- |
| `boxOwedAt` | 61,771 (2,802 programs) | 6 (1) | 12 (3) | 0 |
| list element | 1,297 (460) | 0 | 0 | 0 |
| global let | 977 (280) | 63 (20) | 0 | 0 |
| union-local assignment | 379 (113) | 0 | 0 | 0 |
| `boxDstNameAt` | 276 (73) | 0 | 19 (8) | 0 |

- **No `NE` or `EN` row anywhere.** So each name test agrees with the type test on the corpus,
  and every box handed `""` has a type that names it.
- **The `boxOwedAt` diff** is one value union in another member order (`i32|i64|null` against
  `i64|i32|null`, `unions/coalesce-numeric-union-widens.vl`). Its box tag is per atom kind, so the
  order is no part of the box.
- **The global-let diffs** name the same row under another of its spellings (`Json`, `K|i32`
  against `KI`, a twin alias).
- **Union-local assignment:** a record of a non-union rep never named a union.

## What is left

- **`unionNameOfExpr`:** about 45 callers, most of them handing the name to name-keyed registry
  entrypoints (`unionMemberSetOf`, `mapBoxTagOf`, `coalNicheBoxTag`, the eq cores).
- **`letUnionNameOf` at a local let:** `letUNm` also feeds `emitLetIfInit` and the arm box.
- **The `??` joins** that take `boxDstNameAt`'s name into `unionMemberSetOf` and
  `unionHasMapArmSlot`. They now get the type's name, but still by name.
- **The `sFieldElemName` readers** that hand a name to the box beside the field's type. They are
  covered by `boxDstName` and are w324's batch.

## Proof

**Local full sweep:** in the PR.
