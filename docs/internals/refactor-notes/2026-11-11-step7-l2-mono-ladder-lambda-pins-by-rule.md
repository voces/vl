# Step 7 L2 §7: seven argument-ladder and lambda pins take the naming rule's spelling (renders 35 → 28), 2026-11-11

The note for #7276 (`2026-11-11-step7-l2-mono-atom-pin-by-rule.md`) left seven emit_mono pin
renders untried against the naming rule. This PR tries each one: it replaces the site's
`tyToEmitName` with `monoPinSpellShaped`, the naming rule with a record that has no row spelled
by its fields. All seven survive, so all seven are cut.

The base is master `ec5e51b8`, after #7281, with a fixpoint seed on both sides. The population is
the whole sweep: 23,916 programs.

## Trials

Each site was swept alone against the base seed, and then all seven together. The probe columns
come from a scratch compiler (#7119's accumulator).

| site | reached in | rule's spelling differs in | alone: same / runs → not-runs |
| --- | --- | --- | --- |
| `monoConcreteFnPinName` | 670 | 27 | 23,916 / 0 |
| `monoAnnPinNameOfTy` | 13 | 7 | 23,916 / 0 |
| `monoPinLamAtTys` | 12 | 3 | 23,916 / 0 |
| `monoLamPinName` | 11 | 9 | 23,916 / 0 |
| `monoFnTyPin` (nullable function) | 4 | 0 | 23,916 / 0 |
| `monoHoleMapPinName` | 2 | 0 | 23,916 / 0 |
| `monoLitUnionPinOfTy` | 1 | 1 | 23,916 / 0 |
| all seven | — | — | 23,916 / 0 |

Counts are programs. In every program where the rule spells a pin differently, the module stays
byte-identical: no reader takes these pins by their spelling.

## Changed

Each of the seven sites calls `monoPinSpellShaped`. Their `tyToEmitName` renders are deleted.

## The renders left in emit_mono

| sites | floor |
| --- | --- |
| `monoPinAnnSpelling` | the literal-`is` union reader keys by the render's spelling; 4 programs lose (#7276's note) |
| `monoNarrowedPinName`, `monoNicheWidenedPinName` | the returned pin is compared with a spelled `wide` / `chosen` pin |
| `monoListUnionRowName`, `monoPinUnionBoxed`, `monoPinUnionNameOfTy` | the union registry by name (L6, w316) |
| `monoSubstAnonShapes`, `monoPreBindNumJoin` | the `tvV` binding spelling, substituted into the body's annotations |
| `monoInstanceRetSpelling` | an instance result's annotation text |

The last four rows are not yet tried against the rule.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: same 23,916, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **render-parse** goes from 35 / 60 to 28 / 60, with `--write-baseline` in this PR.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0, late demands 6, seed size +0.5%;
  - `mono-tyaram-grid.sh` (252 OK, no BAD), distilled `regress.vl` (no runs lost);
  - `cases_wasm_*`, `vl_pin_spell_shadow`, the pin-helper and render-parse budget tests (7,445
    passed).
