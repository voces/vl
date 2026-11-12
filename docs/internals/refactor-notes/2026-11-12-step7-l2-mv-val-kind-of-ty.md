# Step 7 L2 §7: a map value's mv kind is read off its type alone, 2026-11-12

Lane w310, item (d), fourth part. `mvValKindOfNameTy` answered from the value's type when it
held one, and from its spelling (`mvValKindOfSpelling`, an 83-line ladder) when it did not. The
spelling side is deleted, together with its two spelling-only entries, `mvValKindOfName` and
`mapValKindLowerable`. Every caller now asks `mvValKindOfTy`.

The base is master `9cb9806d`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,947 programs.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the predicates
note's accumulator. The first run tagged only the untyped legs, and it came back with no hits.
A probe with no positive control proves nothing, so the second run also tagged every entry to
`mvValKindOfNameTy`:

| tag | programs |
| --- | --- |
| reach (`mvValKindOfNameTy`) | 3,779 |
| `mvValKindOfSpelling` | 0 |
| `mapValKindLowerable` | 0 |
| the six callers' untyped legs | 0 |

## Changed

- `mvValKindOfSpelling`, `mvValKindOfName`, `mvValKindOfNameTy` and `mapValKindLowerable` are
  deleted. The callers in `emit_obj_lit_fits.vl`, `emit_union_atoms.vl` and `emit_shape_rows.vl`
  ask `mvValKindOfTy`.
- `mvValNamesCompat` becomes `mvValTysCompat(vaTy, veTy)`. Its names were read only by the
  spelling. `objMapFieldCompat` and `fieldMapLowerable` drop their name parameters.
- A field with no type is no longer lowerable as a map. The name-side map arm of the field-set
  matcher, which compared against a side with no type, fits leniently, as the deleted code did
  for an unclassifiable side.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,947 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** With `--findings`, parses fall 58 → 57: the `mvValKindOfName(mapValNameOf(…))`
  parse left. Renders stay at 21. The baseline is rewritten in this PR.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,451 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports.
