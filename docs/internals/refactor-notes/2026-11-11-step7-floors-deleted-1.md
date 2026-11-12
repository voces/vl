# Step 7: two declaration-identity floors deleted (E1, E2), 2026-11-11

This carries out the ruling on `2026-11-11-step7-decl-identity-row-key-census.md` (#7306): build no
`(type, declaration)` key, and delete the floors the merged heaps made redundant. The rules are
DECISIONS' "A nominal type is `type N = new B`, and it is ERASED" (a brand gets no private heap
type), its structural slot dedup ("nominal names are a WasmGC implementation detail, not
semantics"; `buildStructTwins`), D280/D282 (one heap across the variant⇄struct seam) and D1023
(same-shape arms are a value test). Base is master `afbbd89c` (#7200), whose fixpoint seed is
6,626,253 bytes. This PR takes the two floors in this lane's files. E3, w311's `rlElemStructRow` /
`rlElemVariantRow`, is coordinated with w311 separately.

## What changed

| site | before | after |
| --- | --- | --- |
| `retStructRowIndex` (`emit_nullable_rets`) | the annotation's declared name's row, ahead of the type | only an `#anonN` handle answers by name; a declared name answers its type's row |
| `rlElemVariantHeap` (`emit_collect`) | `variantIndexOf` of the element's spelling | `repVariantShapeRowOf` of the element's type |

## Proof

- Refresh ×2 is a fixpoint at 6,626,401 bytes (+148: the `#anon` test is new code).
- Local sweep, fixpoint seeds on both sides: **23,928 same** and 1 output mover, D15730. It is an open
  `check-clean invalid wasm` row, and it fails validation before and after with a different
  validator message (`compiler_trap` both ways). `check-filed-witnesses.vl --strict` grades it **as filed**.
- `regress.vl`, `lint-self`, `cases_wasm` (7,444), seed size, late demands, plumb-shape cost, ladder
  sets, the dead-export budget (with `--findings`) and the memo-generation and live-sites tests pass.
