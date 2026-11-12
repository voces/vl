# Step 7: the ref-list variant floor read by type (cuts 1–2), 2026-11-12

This is cuts 1–2 of `2026-11-11-step7-decl-identity-row-key-census.md` (#7306), taken by w324 on
the orchestrator's ruling after telling w311. A ref-list element was classed as a union arm by its
spelling, `variantIndexOf(rlElemName[slot])`, at four sites. They now ask the element's type. The
rules are the census note's: a brand is erased, and an arm shares its heap with its same-shape
records (D280). Base is master `5c962b49` (#7308), whose fixpoint seed is 6,625,670 bytes. The
population is 23,933 programs.

## The probe

Each site computed the spelling's answer beside the type's. The type's answer is
`repVariantShapeRowOf` of the element's type when `tyIsVariantMember` holds, else -1.

| site | reached | answers differ |
| --- | --- | --- |
| `rlElemStructRow`'s arm gate (`emit_shape_rows`) | 5,099 | 536 (`Circle` 423, `Dot` 67, …) |
| `rlElemVariantRow` (`emit_shape_rows`) | 1,499 | 24 |
| `rlWidenVariantOf`'s first leg (`emit_ref_list_kinds`) | 147 | 4 |
| `idxStoreClassify`'s arm leg (`wasmEmit`) | 9 | 1 |

In the differing programs, the spelling and the type name two rows: an arm and a same-shape record,
or the same arm in two unions. Those rows share one heap, so the answers differ and the module does
not. That is what the sweep below shows for the whole population.

## What changed

- `rlElemVariantRow` answers the arm row of the element's type, or -1 when the type is no declared arm.
- `rlElemStructRow`'s floor declines wherever `rlElemVariantRow` answers.
- `rlWidenVariantOf` and `idxStoreClassify` call `rlElemVariantRow` and no longer look up the spelling.

`variantIndexOf` loses three sites, and `rlElemName` has three readers fewer.

## Proof

- Refresh ×2 is a fixpoint at 6,625,507 bytes (−163).
- Local sweep, fixpoint seeds on both sides: **23,933 same**, 0 bytes-only, 0 output movers.
- `regress.vl`, `lint-self`, `cases_wasm` (7,445), `rep-fuzz-check.sh` (exact), seed size, late
  demands, plumb-shape cost, ladder sets, the dead-export budget (with `--findings`) and the
  memo-generation, live-sites and inventory-refs tests pass.
