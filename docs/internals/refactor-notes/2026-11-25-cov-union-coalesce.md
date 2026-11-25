# IR coverage: `??`, first batch (lane COV-UNION, 2026-11-25)

Three `coalesce *` classes of the I8 census (`2026-11-25-ir-i8-census.md`), 21 rows over 21
programs on a fixpoint of master d27b5082. One mechanism per commit:

| class | rows before | mechanism |
|---|---:|---|
| coalesce nulnone effect if | 9 | a `null`-typed if-expression run for its effect is a void `if` of its arms' preludes and values (`emitIfForEffect`). It is written in place, so with a temp waiting below it the claim misses; `ifBelowLeadHas` now counts any `if` below a lead, and `irBStageLeads` stages nothing below a void one (the lowering cannot), so an earlier operand read at its use misses rather than reorders |
| coalesce nulRef default rep | 7 | a default whose closure rep leaves a hole open is retagged to the result (`holeRetagNoted`, an `RRetag` that writes no byte), as a record field's is |
| coalesce chain unminted | 5 | `coalChainsPrime` minted only function bodies' chains; `coalChainsPrimeStart` mints the start order's before `irClaimStart`, and legacy records a link it mints at lowering (`coalChainNote`) so the armed shadow, which reads the start after legacy, finds it |

## Census, cut to the 21 programs (rows = unclaimed distinct functions + start bodies)

| population | before | after |
|---|---:|---:|
| tests/cases (12 programs) | 13 + 9 = 22 | 11 + 5 = 16 |
| probes (2) | 1 + 1 = 2 | 0 |
| witnesses (7) | 3 + 4 = 7 | 0 |

The three classes: 21 → 1 (`coalesce nulRef default rep` in
`soundness/coalesce-null-binding-with-null-call-default-filled-later-runs.vl`, a `null`-typed call
default: another mechanism). Unmasked: `method f` +2, `map read scalarBox` 1, `global store
coercion` 1, `coalesce nulRef atomJoinStash` 1.

## Position sweeps (Q58)

Each builds under `VL_IR_SHADOW=6`, runs, and is identical to `ir-identity.sh --claimless`:
- `tests/cases/types/infer-null-hole-if-coalesce-in-each-position.vl`: 72 of 76 matched; the 4 left
  miss in classes this change does not own (`box of an effect's immediate` ×2, `string operand
  after another`, `short-circuit right operand`): the concat and after-an-operand positions are
  the misses the ordering guard asks for.
- `tests/cases/null/coalesce-chain-in-start-body-each-position.vl`: 67 of 68 matched, both start
  bodies matched; the interpolation hole's chain misses `box of a valued if`.
- `tests/cases/closures/coalesce-closure-list-default-in-each-position.vl`: 65 of 69 matched; 4
  `map read mv value rep`.

## Not taken

`coalesce optional place` (13 rows): legacy writes a `?.` receiver that is itself a chain twice
(`emitOptRecvBase`), so the IR needs the receiver built a second time into the present arm, a new
body on `SCoalBox`. Next batch.
