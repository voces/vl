# Step 7 L2 §7: the inline-shape dedup compares a ref field's storage type, not its spelling, 2026-11-11

Lane w309 found the map-value name's last deciding readers in `emit_shape_intern.vl`. They are
two row-identity compares, and both ask a name. This PR converts the dedup in
`annShapeIndexOf`. The wider-row compare in `annShapeWiderRowOf` is the next PR.

The base is #7219, the type-first find. After it, `annShapeIndexOf` runs only when the type
find misses: for a declared record, for an anonymous record whose type has no row yet, and
for an untyped shape.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the
accumulator of the predicates note. Where the dedup compares a candidate row's element name
`en` with the field's text, it also compared the two storage types with `tySame`: the
candidate row's (`sFieldStoreTy`) and the field's (`recFieldStoreTyOf(fieldsTy, …)`).

| measure | programs |
| --- | --- |
| reach | 487 |
| untyped | 1 |
| the name and the type disagree | 160 |

Every disagreement is "the names differ, the types are the same". A row's element name is not
its field's text. A map field records its value's name (`string` for `{[string]:string}`). A
list field records its element's name (`{f:f64}` for `{f:f64}[]`, `((i32)=>i32)` for
`((i32)=>i32)[]`). So the dedup never matched a ref field against a row of the same type.

## Changed

- `annShapeIndexOf`: the storage types decide when both rows record one. The spelling compare
  is kept for a field with no recorded type. The rep fuzzer's warning about unifying the
  spelling compare with `shapeFieldElemName` is kept beside it.

## Proof

- **Targeted.** The 160 programs were each built with the #7219 seed and with this candidate:
  0 exit codes differ. 3 modules shrink, by merged rows, and print the same output:

  | program | bytes |
  | --- | --- |
  | `generics/instance-holding-union-arm.vl` | 722 → 714 |
  | `unions/self-recursive-arm-field.vl` | 1,312 → 1,288 |
  | `unions/struct-holding-self-recursive-arm.vl` | 3,660 → 3,604 |

- **Local.** `rep-fuzz-check.sh` is exact (0 unsound, 0 reject). `cases_wasm`: 7,440 passed, 0
  failed. Distilled `regress.vl`: no runs lost. `check-filed-witnesses --strict`: 4,722, all as
  filed. lint-self is clean. The export, ladder, comment, sentinel and scan budgets are ok. One
  refresh, and the comment edit leaves the seed byte-identical.
