# Step 7, L6: `structRowOfSpelling` deleted, 2026-11-12

Closing census 5 had `structRowOfSpelling` in lane B's failing column. Lane I traced it on master:
one call site was left, `pinKindOfName` (`emit_nullable_rets`), through `isSName` and
`spellingHasStructRow`. No `emit_mono` caller of `isSName` remained. Measured on master `d5f26894`,
24,202 programs.

## What the site asked

`pinKindOfName(name)` gives a synthesized annotation node its placeholder kind where the caller
holds no type. `PIN_ANON` gives the node `objPinTyIx`. It is read only where the node's name does
not resolve to a type (`recordClonedNodeTyKnown` with no type; `recordClonedNodeTyFb` once
`nameToTy` misses). Its comment called the anon leg "an exact-name query". The accumulating
probe showed what `isSName` answered true for:

| name | programs |
| --- | --- |
| a declared record (`V`, `R`, `Circle`, …) | 1,035 |
| a `{…}` shape spelling | 687 |
| an `#anonN` handle | 258 |
| `#anon…` that `isSName` declined (`#anon3[]` and similar) | 30 |

A declared name and a shape spelling resolve through `nameToTy`, so `PIN_ANON` never decided
their type. Only the handle needs it, and a handle is a row id, not a type spelling.

## The change

`pinKindOfName` asks `nameIsAnonHandle(name)`: exactly `#anon` followed by digits. It reads no
registry. `isSName`, `spellingHasStructRow` and `structRowOfSpelling` are deleted, and two
checker comments that cited `isSName` are reworded.

This removes lane I's entry from the carve-out in `sNameIx`'s contract
(`2026-11-12-step7-snameix-contract.md`): `structRowOfSpelling` no longer reads `sNameIx`.

## Proof

- Refresh ×2 is a fixpoint at 6,717,062 bytes, against master's 6,716,839.
- Sweep against master's fixpoint seed: **24,202 same**, 0 bytes-only movers, 0 output movers.
- lint-self is clean, and `regress.vl` lost no runs.
- Witnesses `--strict`: 4,863 as filed, 0 moved.
- Late demands 8, seed +1.9%, render-parse 9 and 3, and dead exports 0.
- `vkind-census --slots-list` name producers: struct 1 (`structIndexByName`), variant 1
  (`variantIndexOf`).
