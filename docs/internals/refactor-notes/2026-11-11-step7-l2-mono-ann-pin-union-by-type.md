# Step 7 L2 §7: monoAnnPinName's union rungs ask by type where the caller holds one, 2026-11-11

Lane w316's cut D removes `isUNameDeclAB`'s arm for an undeclared spelling: the arm that keys a
union by its softened spelling. Three of its callers are emit_mono's, all in `monoAnnPinName`:

- site 79, the union-annotation rung;
- site 80, its list rung;
- site 81, the literal-union-alias list rung.

w316 and this lane agreed the split: emit_mono's callers here, `isUNameDeclAB` itself and every
other caller with w316. The typed seam is the existing `isUNameKeyAB(site, name, ty)`, which keys
the row by the canonical type.

The base is #7276 merged into master, with a fixpoint seed on both sides. The population is the
whole sweep: 23,910 programs.

## Changed

`monoAnnPinName(name, ty)` takes the type `name` renders, or -1 where a caller has none.
`monoNulAnnName` passes its base the non-null type. Each of the three rungs asks
`isUNameKeyAB(site, name, ty)` when it holds a type: the list rungs ask it of the element type. It
keeps `isUNameDeclAB(site, name)` only when it holds none.

The callers that hand a type:

- `monoAnnPinNameOfTy`;
- the narrowed, niche-widened and literal-union pins (`nt`);
- `monoPinAnnSpelling`'s alias rung;
- the annotated-local, parameter and global arms (their TypeRef's type);
- the projected list element (the list's element type).

The callers that hand -1 pass a registry name, which carries no type:

- `sNames[si]`, `unNames[ur]` and `uVariants[…]`;
- a nominal record name;
- the composed `X|null`, `(X)[]` and `X[]` spellings;
- the literal `i32[]|null`.

## Probed

The probe ran in a scratch compiler (#7119's accumulator). It evaluated both forms wherever a
type was held:

| site | reached with a type | typed answer differs | reached with none |
| --- | --- | --- | --- |
| 79 | 320 programs | 0 | 986 |
| 80 | 3 | 0 | 62 |
| 81 | 0 | — | 0 |

The untyped reaches are the -1 callers above. They are listed for w316 as the floor cut D meets
in emit_mono: each hands a registry row's name, so it would take the row's type, not the
spelling's.

## Proof

- **Byte sweep.** The #7276 seed against the candidate fixpoint: 23,910 of 23,910 are the same,
  with 0 bytes-only movers, 0 output movers, 0 runs → not-runs and 0 new compiler traps.
- **Budgets:** render-parse (35 / 60) and the pin helpers do not move; no function is added.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0, late demands 6;
  - `mono-tyaram-grid.sh` (no BAD), distilled `regress.vl` (no runs lost);
  - `cases_wasm_*`, `vl_pin_spell_shadow` and the pin-helper test (7,443 passed).
