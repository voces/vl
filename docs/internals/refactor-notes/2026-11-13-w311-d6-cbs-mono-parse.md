# Step 7 D6: the call-bind shadow parses mono's spelling itself (2026-11-13)

`repNameCanonId` (`emit_rep.vl`) resolved an arbitrary spelling through `declTyIxOfName` and
answered its canonical identity. After #7817 its only caller was `call_bind_shadow`'s `cbsClass`,
which hands it the monomorphizer's binding spelling, a render by construction. That made it one
of `declTyIxOfName`'s render-fed callers.

## The change

`cbsClass` asks its own `cbsMonoCanonId`, which climbs the same rungs (declared name, primitive,
then `resolveAnnot`) and keeps the 4096-character cap. `repNameCanonId` loses its last caller and is
deleted, so `declTyIxOfName` has one render-fed caller fewer. The parse is carried as D16042, a
floor that lives as long as the shadow.

**Contract:** the shadow runs only when a host arms it (`callBindShadowArm`) and changes no build
output.

## Refused versions: no parse at all

`mono` has no type behind it, so a non-parsing comparison can only compare text. Over 9,170 armed
rows (tests/cases plus the distilled corpus), compared with master:

| comparison | rows that leave "agree up to spelling" for "disagree" |
| --- | --- |
| declared-name lookup only | 280 (`Circle[]`, `{[string]:Circle}`) |
| that plus a text compare with `tyToNominalName(ty)` | 109 (union member order; a literal-union field the checker widens) |

The coordinator chose to keep the instrument exact (option (a)).

## Measured

- Armed shadow, master `7032eb67` against this branch: 9,170 of 9,170 rows identical.
  `tests/vl_call_bind_shadow_test.ts` passes.
- `render-parse-census` scans only emit files, so the moved parse is not one of its sites, and
  the budget is unchanged. `declTyIxOfName`'s entry stays graded render while
  `fieldElemTyIxOfName` and `registerValueUnionNameTy` still feed it.
