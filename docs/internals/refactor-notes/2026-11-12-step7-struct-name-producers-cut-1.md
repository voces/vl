# Step 7, L6: the struct name producers, cut 1, 2026-11-12

The exit criteria (`2026-11-11-step7-exit-criteria.md`) list 11 struct and variant name producers
and `retStructRowIndex`'s name rung. This cut switches three to the type and deletes them.
Measured on master `1cfe43d1` (#7600), fixpoint seed 6,735,703 bytes. The population is the
sweep's 24,170 programs.

## Re-measured before the cut

`vkind-census.vl -- --slots-list` lists 13 name producers: struct 8, variant 1, reflist 4.

- **Already gone:** `structIndexOfTypeName` and `structIndexOfTypeNameGo`. `sitnMemo` went with
  them, so `registry-census.vl` no longer lists it.
- **`retStructRowIndex`'s declared-name rung:** deleted in #7546. Its `#anon` handle rung is
  left. The #7414 census grades it by design: the handle is the literal row's identity.

## The probes

Each name rung was wrapped by an `emitFail` that fires only when its answer differs from the
type-only answer. The old answer was kept, and an answer from one side only counts as a
difference. Both probe compilers were built twice from master plus the probe, and neither was
refreshed into `build/`.

| probe | site | differ |
| --- | --- | --- |
| NT | `structRowOfNameTy`'s `ty < 0` rung (`structIndexByName(name)`) | 0: the rung never answers |
| RB | `structFieldCodesEq`'s `repStructRowByName` rung, against `repElemRowByShape` | 0 |
| AT, first variant | `structRowOfAnnTy`'s fallback against a type-only fallback whose `T \| null` branch has no gate | 159, all `-1 → row` on an `X\|null` spelling: the type-only side was wider |
| AT, second variant | the same, with the nullable branch only for a non-nullable type | 0 |
| BN | `structIndexByName(name)` inside the fallback, against the type-only answer | 0 |
| NB | the old `T \| null` branch, gated on a `{…}` spelling (`nameIsWholeSpanShape`) | 0: never reached |

The first AT variant is the floor this cut does not take. `structIndexOfTypeNameTy` answers a
nullable type through its non-null part only for a whole-span shape spelling. A type-only reader
that answers every `T | null` names a row the old code declined, and its callers read that miss
as a decision.

## What changed

- `structRowOfNameTy(name, ty)` becomes `structRowOfValueTy(ty)`. It has four callers:
  `emit_classify`'s member-union scan, `emit_mono`'s struct-field argument, and two in
  `emit_shape_rows`.
- `structRowOfAnnTy(name, rec, ty)` becomes `structRowOfAnnTy(rec, ty)`. Its fallback
  `structRowOfAnnTyGo(ty)` is `structIndexOfTypeNameTy` without the name: the recording row, an
  anonymous record's canonical-key row, then a non-null record's indexed or canonical-key row.
  It has six callers, four of which passed `""`.
- `repStructRowByName` is deleted. `structFieldCodesEq` resolves a code-15 field's referenced
  row by type, then by shape.

## Proof

- Refresh ×2 is a fixpoint at 6,735,216 bytes, 487 bytes under master.
- Sweep against master's fixpoint seed: **24,170 same**, 0 bytes-only movers, 0 output movers.
- lint-self clean. `regress.vl`: no runs lost. Witnesses `--strict`: 4,847 as filed, 0 moved.
  Late demands 8 (baseline 8). Seed size +2.2%. Render-parse is unchanged at 13 and 38.
  plumb-shape cost passes. The comment, ladder, sentinel and scan budgets pass.

## After this cut

Six name producers are left, struct 5 and variant 1, with these call sites:

| producer | call sites |
| --- | --- |
| `structIndexByName` (`sNameIx`) | 16 |
| `structRowOfSpelling` | 6 |
| `armFieldStructRow` | 3 |
| `shapeElemDeclaredStructIdx` | 2 |
| `variantIndexOf` | 32 |

The reflist 4 belong to w311. `variantIndexOf`'s sites are graded before any of them switches.
