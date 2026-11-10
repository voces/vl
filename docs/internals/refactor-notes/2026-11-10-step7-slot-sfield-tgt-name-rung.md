# Step 7 slot layer: `sFieldTgtStructIdx`'s name rung is deleted, 2026-11-10

This is family D of `2026-11-10-step7-struct-name-rungs-measured.md` (#7105): the name rung of
`sFieldTgtStructIdx` (`emit_atom_kinds.vl`), the chokepoint every code-15 (nested-struct field)
consumer shares. Base is master `2e71e5a1` (#7107). Its fixpoint seed is 6,610,894 bytes.

## Method

As in #7105: a probe compiler per question, built by the base seed into scratch, never refreshed
into `build/`. Each one records an `emitFail` when the name rung answers, with tags. Each one sweeps
the whole population (`scripts/sweep.vl record`, 23,862 programs). Counts are **programs**.

## 1. Why the type rung missed

The probe tagged each reach of the name rung `n` with the field's element type `ety`, the name
row's own recorded type `rty = sTyIx[n]`, and the row identity of each:

| reach | programs | `ety` | `structIndexOfTy(rty) == n` | `repRowOfTyStruct(ety) == n` |
| --- | --- | --- | --- | --- |
| spelled shape (`{r:i32}`, …) | 207 | given, a `TyObj`, `tySame` to `rty` | yes | yes (207) |
| `#anonN` row | 137 | -1 | yes (137) | — |

- **Spelled shape (207).** The element type is a second arena index of the row's own type.
  `structIndexOfTy` is keyed by arena index, so it misses. The row's canonical identity
  (`repRowOfTyStruct`) finds `n` in all 207.
- **`#anonN` (137).** The field is recorded with no element type. All 137 owners are anonymous
  literal rows (`anonMintRowFor`, `emit_collect.vl`), whose code-15 field recorded -1. The nested
  row's own type maps back to it in all 137.

## 2. The change

- `sFieldTgtStructIdx` asks the row recording `ety`, then the row of `ety`'s canonical identity
  (`repRowOfTyStruct`). The name rung is deleted. The one-member alias rung stays.
- `anonFieldElemName`'s code-15 arm is split into `anonFieldStructRow` (`emit_classify.vl`), which
  returns the row. `anonMintRowFor` records that row's name **and its `sTyIx`** as the field's
  element type, where it is computed.
- `gaeEnsure` (`emit_shape_intern.vl`) does the same for a generic alias's substituted inline-shape
  field keyed by an earlier literal's `#anonN` row (`tests/cases/generics/alias-inline-nested-record-list.vl`).
  It was the one program still reaching the rung after the first two changes.

A probe on the candidate (an `emitFail` where the name would answer after both type rungs miss)
fires in **0 of 23,862** programs.

## 3. Proof

- `sweep.vl diff` base vs candidate: **23,862 same, 0 bytes-only movers, 0 output movers**. Every
  module is byte-identical.
- Refresh ×2: fixpoint, 6,611,451 bytes (+557, +0.3% against the seed-size baseline).
- lint-self clean; rep-fuzz exact; seed-size, late-demands (6), dead-export, render-parse,
  pin-helper and plumb-shape budgets ok; cases_wasm 7,415 passed; inventory refs/rows,
  `vl_probe_rollback_test.ts`, `vl_scaling_shape_test.ts` pass; `check-filed-witnesses --strict`
  on both inventories: 4,699 as filed, 0 moved.

## Still open in the struct bank

Families A (`structIdxOfElemNameTy`), B (`structRowOfNameTy`) and C (`structRowOfNameOrTy`). The
variant twin `uFieldTgtStructIdx` (`emit_shape_rows.vl`) keeps a name rung of the same shape; it is
not measured here.
