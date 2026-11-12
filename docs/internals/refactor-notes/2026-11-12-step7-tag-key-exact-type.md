# Step 7: a union tag is keyed by the member's exact checked type; the `annDeclPos` columns deleted (cuts 5b, 6), 2026-11-12

`2026-11-12-step7-floors-deleted-4.md` (#7335) found that the checker's `annDeclPos` /
`annUnionDecl` columns carried tag identity: switching their readers to an arm's rep row lost 2
runs and moved 13 outputs. The orchestrator ruled on the key. This PR builds it and deletes the
columns. Base is master `5f7940e8` (#7225), whose fixpoint seed is 6,641,449 bytes.

## The rule

**A union tag is keyed by the member's exact checked type within its union: `(union row, the
member r with tySame(uVarTyIx[r], ty))`, never by the member's rep row.** This follows D1712 (a
union is a set of types, and its tags are positional in the registered sequence) and D1023
(same-shape arms are told apart by discriminant value, which their checked types carry). A heap
question keys by the type and needs no declaration (cuts 1–4).

## What changed

- `unionArmRowOfTy(u, ty)` (`emit_local_slots`) answers the variant row of union row `u` whose
  member is exactly `ty`. `exactArmRowOfTy(ty)` answers the first variant row of that exact type,
  for heap questions only.
- `unionArmTagsOfTy` (a cast's tags) takes the cast operand's union row from its checked type
  (`unionTyOfRecv`), not the annotation's declaration.
- `exprVariantIndex`'s `AsExpr` arm reads the arm of the operand's union whose type the cast's is.
- `isTestedRowOf` loses its declaration rung. Its receiver-union rung already answered by type.
- `annDeclVariantRow` (let and return annotations, `alcNamesArm`) and `cloRetValSlot` read
  `exactArmRowOfTy` of the node's type.
- **Deleted:** `declVariantRowAt`; the columns `annDeclPos` and `annUnionDecl`; `annDeclNote` and
  its four writers (`check_annot_resolve`, `check_operators`, `check_relate_core`,
  `emit_nullable_rets`); `annArmDeclPosOf`, `unionDeclArmPos`, `recDeclPosOf`, `annDeclPosOf`; and
  `isTestedRowOf`'s unused node parameter.

## Graded on the 15 programs #7335 named, then the population

D2793, `generics/pin-explicit-type-argument-union-member.vl`, the D1023 discriminant-value family
(`unions/discriminant-value-is*.vl`, `sets/union-of-records-with-discriminant.vl`, …) and D1152,
D1195, D1196 build byte-identically to base. So does every other program in the sweep.

## Proof

- Refresh ×2 is a fixpoint at 6,639,944 bytes (−1,505).
- Local sweep, fixpoint seeds on both sides: **23,945 same**, 0 bytes-only, 0 output movers.
- `regress.vl`, `lint-self`, `cases_wasm` (7,450), `rep-fuzz-check.sh` (exact), seed size, late
  demands, plumb-shape cost, ladder sets, the dead-export budget (with `--findings`) and the
  memo-generation, live-sites and inventory-refs tests pass.
