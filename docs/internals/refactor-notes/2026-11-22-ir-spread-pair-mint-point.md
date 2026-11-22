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
