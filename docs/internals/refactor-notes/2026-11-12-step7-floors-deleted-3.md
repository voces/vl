# Step 7: `structRowOfNameTy`'s arm test deleted (cut 4), 2026-11-12

This is cut 4 of `2026-11-11-step7-decl-identity-row-key-census.md` (#7306). `structRowOfNameTy`
answered no row for a spelling that names a union arm (`variantIndexOf(name) >= 0`), ahead of the
type's row. #7279 measured the test as deciding the answer in 40 programs, the arm's spelling at a
type a struct row stores. A typed form of the test would differ in 5. Base is master `61d78785`
(#7315), whose fixpoint seed is 6,632,981 bytes.

A deletion beats a switch, so the test is deleted. A typed caller now gets the row the type's
non-null part is stored at, whatever the spelling. An arm and its same-shape records share that row's
heap (D280), so no module moves.

## Proof

- Refresh ×2 is a fixpoint at 6,632,967 bytes (−14).
- Local sweep, fixpoint seeds on both sides: **23,933 same**, 0 bytes-only, 0 output movers.
- `regress.vl`, `lint-self`, `cases_wasm` (7,445), seed size, late demands, plumb-shape cost, ladder
  sets, the dead-export budget (with `--findings`) and the memo-generation, live-sites and
  inventory-refs tests pass.
