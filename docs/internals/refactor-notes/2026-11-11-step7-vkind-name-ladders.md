# Step 7: the rendered-name list ladders lose two callers, and what keeps the rest, 2026-11-11

This is conversion 3 of `2026-11-10-step7-vkind-census.md` §4: the rendered-name ladders
`scalarListRepOfName`, `nulScalarListKind`, `annNulListKind` and `annUnionSigKind`, and
`nulScalarListKindOfNode`'s `tyName` rung. Base is master `5edb783b` (#7136), whose fixpoint seed
is 6,615,486 bytes. #7140 is below it.

## What changed

- **`nulScalarListKindOfNode`'s `tyName` rung is deleted.** When `annRepKindOf` declined, it
  parsed the annotation's spelling with `nulScalarListKind`. The function is now that one
  descriptor read, kept only when the kind is a distinct-backing nullable list.
- **`forceAnnLeafReps` and `forceGenAppArgTypes` are deleted.** `collectA` ran them on every
  `TypeRef` spelling, and every arm was empty: each backing they once reserved now mints on its
  first read. They were the `nulScalarListKind` caller in `emit_collect.vl`.

## The rung was never reached

- **Probe.** A probe compiler (built by the base seed into scratch) called a distinctive
  `emitFail` whenever the rung answered a kind.
- **The control fires.** A control compiler with an `emitFail` at the function's entry, swept over
  shard 1/10 (2,389 programs), fires in 79 cells.
- **The probe does not fire.** The probe's sweep of all 23,882 programs fires in 0 cells.

**Literal unions.** D14041 and D14042 refuse with the same message on base and candidate, as does
D14041's inline spelling. No literal-union arm is minted. A `K[] | null` return over a string
literal union runs the same on both.

## What stays, and why

| ladder | remaining callers | owner |
| --- | --- | --- |
| `scalarListRepOfName` | `fieldCodeOfSpelling`, `mvValKindOfName` (×2), the nullable ref-map inner name | the codecs (census §4 item 5) |
| `scalarListRepOfName`, `nulScalarListKind`, `annNulListKind`, `annUnionSigKind` | `annParamKindTy`, `annRetKindTy` | `annSigKeyTy`'s spelling loop |
| `nulScalarListKind` | `nulScalarListFieldCode` | the field-code codec |

`annSigKeyTy`'s spelling loop runs only when no function type of the spelling's arity came. A
probe that fires when the loop produces a key fires in **1 of 23,882** programs. That program is
`closures/hole-fn-in-unannotated-map.vl`, the record-adoption residue that
`2026-11-10-step7-annsig-arm-mint-fields-ty.md` names. Its caller has no type to pass, so the four
`annSig*` ladders cannot take one until the checker records that adopted annotation's type. When
it does, the loop and all four ladders delete together, and `annSigKeyTy` becomes `sigKeyOfTy`.

## Proof

- **Seed:** 6,615,486 → 6,614,871 bytes (−615 against base, −465 against #7140). Two refreshes are
  byte-identical.
- **Sweep:** `sweep.vl -- record` over all 23,882 programs, base against candidate: **23,882 the
  same**, with 0 bytes-only movers, 0 output movers, 0 `runs → not-runs` and 0 new compiler traps.
