# Step 7 L2 §7: the atom pin takes the naming rule's spelling (renders 36 → 35), and why the annotation pin cannot yet, 2026-11-11

The orchestrator's item (b) is to make the seam's readers ask the type, so that mono's two
largest pin renders can go:

| render | reached in |
| --- | --- |
| `monoI32AtomPinName` | 6,504 programs |
| `monoPinAnnSpelling` | 2,810 programs |

This PR removes the first and records what holds the second.

The base is #7245 merged into master, with a fixpoint seed on both sides. The population is the
whole sweep: 23,910 programs.

## Trials

Each trial is a scratch candidate swept against the base seed. Each replaces one render with the
naming rule's spelling (`pin_spell.vl`).

| trial | same | runs → not-runs |
| --- | --- | --- |
| atom pin ← `monoPinSpellOf`, render kept as the fallback | 23,908 | 2 invalid modules: D3178, `null-only-type-param-binds-never.vl` |
| the same, with `never` declined by the rule | 23,910 | 0 |
| atom pin ← the rule alone, records with no row spelled by fields | **23,910** | **0** (this PR) |
| the same rule, record-fields spelling inside `monoPinSpellOf` itself | 23,909 | 1 (`record-with-generic-fn-field-into-narrower-declared-param.vl`, invalid module) |
| annotation pin ← the rule (`monoPinSpellShaped`) | 23,901 | 4, all "literal `is` over a union with no recorded members" |

- **`never`.** The render spells `never | null` and `never[] | null` as `""`, no pin. The rule
  spelled them `never|null`, and that pin built an invalid module. A type holding `never` now has
  no rule spelling either.
- **Records with no row.** A probe of the atom pin found the rule had no spelling where the
  render had one in 41 of 6,542 programs. Nearly all are records with no struct row, such as
  `{m:{[i32]:boolean}}` (31 programs). Spelled by its fields, the record matches the render.
  That spelling is a separate entry point, `monoPinSpellShaped`, because inside `monoPinSpellOf`
  it moves another of the rule's callers (row 4).
- **The annotation pin** fails on readers of a mixed union's spelling. On the witnesses:
  - the render keeps a literal-union alias by name (`i32|AB`), where the rule writes
    `"a"|"b"|i32`;
  - the render widens a lone string literal in a mixed union (`i32|string`), where the rule writes
    `"a"|i32`.

  The union-box reader for a literal `is` then finds no union registered under the spelling. That
  reader is the union registry, lane w316's.

## Changed

- `monoPinSpellAt(ty, shapes)` is the rule's walk. `monoPinSpellOf` is its no-shapes entry.
  `monoPinSpellShaped` spells a record with no row by its fields. `never` declines.
- `monoI32AtomPinName` is `monoPinSpellShaped(ty)`. Its `tyToEmitName` is deleted.
- `vl_pin_spell_shadow_test`'s first witness now agrees in all three pins: the cascade's atom pin
  is the rule's spelling. The other witnesses keep the disagreeing control rows.

## Floors left in emit_mono

These are the 16 renders, named per site:

| sites | floor |
| --- | --- |
| `monoPinAnnSpelling` | the literal-`is` union reader keys by the render's spelling (above) |
| `monoNarrowedPinName`, `monoNicheWidenedPinName` | the returned pin is compared with a spelled `wide` / `chosen` pin |
| `monoListUnionRowName`, `monoPinUnionBoxed`, `monoPinUnionNameOfTy` | the union registry by name (L6, w316) |
| `monoSubstAnonShapes`, `monoPreBindNumJoin` | the `tvV` binding spelling, substituted into the body's annotations |
| `monoInstanceRetSpelling` | an instance result's annotation text |
| `monoAnnPinNameOfTy`, `monoHoleMapPinName`, `monoLitUnionPinOfTy`, `monoFnTyPin`, `monoConcreteFnPinName`, `monoPinLamAtTys`, `monoLamPinName` | argument-ladder and lambda pins not yet tried against the rule; each takes the same trial |

## Proof

- **Byte sweep.** The #7245 seed against the candidate fixpoint: 23,910 of 23,910 are the same,
  with 0 bytes-only movers, 0 output movers, 0 runs → not-runs and 0 new compiler traps.
- **render-parse** goes from 36 / 60 to 35 / 60, with `--write-baseline` in this PR.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0, late demands 6, seed size +0.5%;
  - `mono-tyaram-grid.sh` (252 OK, no BAD), distilled `regress.vl` (no runs lost);
  - `cases_wasm_*`, `vl_pin_spell_shadow`, the pin-helper and render-parse budget tests.
