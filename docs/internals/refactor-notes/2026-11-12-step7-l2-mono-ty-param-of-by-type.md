# Step 7 L2 §7: a parameter that rides a type parameter is found by its annotation's type, 2026-11-12

w310 is retiring emit_base's `monoTyParamOf`. It reads an annotation spelling as `T` or `T[]` for
some `T` in the type parameters. Three of its callers are in emit_mono:

- `monoPinAnnotatedParam`, the parameter pin;
- the explicit-binding loop that feeds `monoExplicitBN`;
- the layout fold's `T.size` read.

The base is master `b0219f45` plus #7439, with a fixpoint seed on both sides. The population is
the whole sweep: 23,997 programs.

## Probed

The probe ran in a scratch compiler (#7119's accumulator). It compared `monoTyParamOf`'s answer
over the declared spelling with the annotation node's type: a `TyVar` named for one of the type
parameters, or a list of one.

| site | reached in | differs |
| --- | --- | --- |
| the explicit-binding loop | 113 | 0 |
| `monoPinAnnotatedParam` | 5,944 | 10 |

All 10 are nested generics whose encloser redeclares the parameter. There, the encloser's rows
are renamed by `monoShadowRenameDecl` (`A__sh2`), and the spelling still says `A`. The alias table
`monoShAliasName` / `monoShAliasTo` maps the name back.

## Changed

- `monoAnnTyParamOf(ty, tps)` names the type parameter a `TyVar` annotation, or a one-rung list
  of one, rides on. It reads a renamed row by its declared name and keeps the
  `gaeParamShadowed` exclusion. It takes the one free slot in emit_mono's function budget.
- `monoPinAnnotatedParam` asks it of the annotation's type. Its `ann == tp` and
  `ann == tp + "[]"` tests become one bare-or-list fact (`tpBare`).
- The explicit-binding loop asks it too, and its `monoDeclAnnName` read is deleted.
- The `T.size` read tests an identifier name, which never carries `[]`. It now asks whether the
  identifier is a type parameter (`strListHas` plus `gaeParamShadowed`).

emit_mono no longer calls `monoTyParamOf`.

## Proof

- **Byte sweep.** The base fixpoint against the candidate fixpoint: same 23,997, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0;
  - render-parse 13 / 55 (`--findings`);
  - pin-helper budget at 912 / 912;
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-helper and pin-spell shadow tests pass.
