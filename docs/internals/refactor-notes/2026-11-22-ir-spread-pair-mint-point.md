# IR: a spread's list pair minted where legacy asks it (2026-11-22, lane IR-N3)

The coordinator's mode-6 detector (build before and after legacy) named 22 `named/d3125_*` cells
whose function `t` built only after legacy: `array spread pair unminted`. Legacy's `emitArrSpread`
asks `spreadWrapIdx` / `spreadBackIdx` before its groups, and a first ask mints the pair (the i32
list's `lTy()` here). At claim time nothing had asked yet, so `spreadPairKnown` refused the spread
and the claim fell back.

## The change

- `spreadLit` no longer refuses an unminted pair. When the pair is unminted it notes the first node
  its groups built (`irSpreadPairAt`, with the build's kind and slot).
- The lowering's statement walk asks the pair at that node (`spreadPairMintAt`), before the groups'
  writing, as legacy's arm does. The ask is idempotent; `spreadList` asks it again as before.

A spread whose groups build no node has its pair asked by `spreadList` itself, which is the first
write either way.

## Witness

`tests/ir-shadow-rows/spread-pair-minted-at-its-groups.vl`: the d3125 shape, `[...[x]]` in a generic
function at `i32`, the program's first i32 list.

## Measured vs merge-base 898b840d8 (fixpoint seeds on both sides)

- Fixpoint after one refresh; `--names` self-compile identical; mode-3 self-compile byte-identical.
- `ir-identity.sh --claimless`: identical 14018, fail under both 3267, differ 0.
- `ir-identity.sh --cases`: identical 7611, differ 0; witnesses same 60, differ 0 (again after the
  note became one record, `SpreadPairNote`).
- tests/cases legacy A/B: identical 7331, differ 0.
- `named/d3125_*`: 521 of 521 cells have mode-5 claimed equal to armed matched, and each mode-5
  build is byte-identical to the legacy build, the 22 named cells among them.
- tests/cases armed shadow: covered and matched +1. Corpus no-blocker functions unchanged at 45,028.
- Self-compile L2 fuel +0.05% per PR.
