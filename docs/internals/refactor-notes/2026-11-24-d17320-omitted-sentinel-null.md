# D17320: an omitted sentinel-null field of a union arm (2026-11-24, lane N10, express)

A `{}` completing a union arm fills each omitted field with the `null` the literal's check
minted (`omittedFieldNullNode`). That node has no type and no contextual type, so `emitNullAt`
names `NULL_OWN_NONE` for it and legacy wrote `ref.null none`. For a reference-kind slot that is
valid. For the two sentinel slots, `boolean | null` (rdNul 2) and a literal union with `null`
(rdNul 3), the slot is an i32, so the module did not validate.

`emitVariantStruct` now asks `variantFieldSentinelNullOwn(vi, fj)` first. It reads the slot's
storage through `rowStoreRepIn(armFieldStoreTy(), …)`, as `fieldNullOwnOf` reads a struct row's
and `nullOwnAt` maps `rdNul`, and writes that niche's own null (`emitNullOwn`). Every other field
takes the existing `emitVariantFieldValue` path, byte for byte.

## Legacy tails the IR calls

None. This is a legacy-only fix, and the IR still refuses these arms (`rep ?`: the untyped null
into a bool or atom niche). Having the IR follow this sentinel arm is a later item, named in the
`rep ?` @null note.

## Witness

`tests/cases/objects/omitted-sentinel-null-field-in-union-arm.vl`: both sentinel kinds at a const,
a return, an argument, an `O | string` arm, an arm given another field, and a `??` fallback,
beside four reference-kind neighbours. It is an invalid module on the base, and runs on the head.

## Readings (base e4e7f396, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| sweep, 12 nullable field kinds × 5 positions (each prints `v.q == null`) | vl check 60/60 clean on both; vl run base 50 runs + 10 invalid module, head 60 runs; the moved list is exactly the 10 `boolean \| null` and `"a" \| "b" \| null` cells; the other 50 cmp-identical |
| legacy A/B (tests/cases + probes) | 8,126 programs, 1 moved: the witness (invalid → runs) |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 8055, differ 0, expected divergence 2 (master's baselined rows); witnesses same 76 |
| `ir-identity.sh --claimless` | identical 14484, differ 0; claimless compiler sha256 `bdd89408d96e4a82941572be4d9b4e1fb32b8cc01fb909b9b27c47d8c8ed6e1f` |
| `check-filed-witnesses --strict`, both inventories | 5658 as filed, 0 MOVED |
| L2 self-compile fuel per PR | +0.01% on 128,382,617,613 |
| late demands / late tag rows / `self ir misses` | 10 (baseline 10) / 315 (0 gone) / 0 |
