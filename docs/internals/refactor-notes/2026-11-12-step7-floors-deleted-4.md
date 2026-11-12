# Step 7: `annDeclNameOf` deleted (cut 5a); the other `annDeclPos` readers carry tag identity, 2026-11-12

Cut 5 of `2026-11-11-step7-decl-identity-row-key-census.md` (#7306) planned to switch the readers of
the checker's `annDeclPos` / `annUnionDecl` columns to the type's arm row and then delete the
columns. One reader goes. The others carry an identity the census did not account for. Base is
master `0921d19f` (#7252), whose fixpoint seed is 6,638,793 bytes.

## The probe and the full switch

Each reader computed its answer beside the type's arm row (`repVariantShapeRowOf` when
`tyIsVariantMember` holds). This was measured on master `b8f6dac2`, over 23,941 programs:

| reader | answers differ |
| --- | --- |
| `annDeclNameOf` (`retStructRowIndex`'s `#anon` test) | 0 |
| `annDeclVariantRow` (let and return annotations, casts, `alcNamesArm`) | 176 |
| `declVariantRowAt` (`isTestedRowOf`, `cloRetValSlot`) | 75 |
| `annArmDeclPosOf` (`unionArmTagsOfTy`, a cast's tags) | 4 |

Switching all four and deleting the columns was not identity:
- 2 programs went `runs → emit_reject`: D2793 and `generics/pin-explicit-type-argument-union-member.vl`
  (`as R is supported for a value-union arm or a struct-variant arm`);
- 13 output movers, nearly all D1023's discriminant-value family: `unions/discriminant-value-is*.vl`,
  `sets/union-of-records-with-discriminant.vl`, D1152, D1195, D1196.

## Why: a rep row is not a tag

`repVariantShapeRowOf` is rep-canonical. Arms whose fields differ only in literal sets
(`kind: "x" | "y"` beside `kind: "p" | "q"`) have one rep, so they share a canonical row. They are
different checked types, and their tags differ. The column was what told them apart.

So the census's conclusion holds for **heap** identity (cuts 1–4, each byte-identical) and not for
**tag** identity. A tag's key is the member's exact checked type within its union, not its rep row.
For an arm in two unions, it also needs the receiver's union, which today only the annotation
supplies.

## What changed

`annDeclNameOf` is deleted. `retStructRowIndex`'s `#anon` test reads the annotation's spelling,
which `annDeclNameOf` returned for every `#anon` reference: a declaration's name never starts
with `#anon`. The columns stay for the three tag readers.

## Proof

- Refresh ×2 is a fixpoint at 6,638,697 bytes (−96).
- Local sweep, fixpoint seeds on both sides: **23,941 same**, 0 bytes-only, 0 output movers.
- `regress.vl`, `lint-self`, `cases_wasm` (7,448), seed size, late demands and the dead-export budget
  (with `--findings`) pass.
