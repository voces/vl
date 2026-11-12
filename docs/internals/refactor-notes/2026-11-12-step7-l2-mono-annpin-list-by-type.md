# Step 7 L2 §7: `monoAnnPinName` reads a list off the type, 2026-11-12

`monoAnnPinName` decides whether an annotation is a list, and `monoCompositeListAnnName` whether
its element is one, by parsing the spelling (`nameIsArray`). Both now read the type.

- **`monoAnnPinName`:** `isArr` is `monoTyIsList(ty)`.
- **`monoCompositeListAnnName`:** takes the element type (`elemTy`, already computed from `ty`),
  and a nested list is `monoTyIsList(elemTy)`.
- **`monoElemlessNulListPinName`:** passed `-1` with the spelling `i32[]|null`. It now passes the
  type it already holds, so the list is still seen once its `| null` is peeled.

The base is master `d303c9bcd`.

## Measured before the cut

A probe build recorded every `monoAnnPinName` call where `nameIsArray(name)` and
`monoTyIsList(ty)` disagree, and every call with a list spelling and no type. Over the 954
`tests/cases/generics` programs, 195 reach the function and none recorded either kind of call. An
always-firing marker at the function's entry validated the probe.

## Graded

- Seed: fixpoint. A comment-only follow-up was byte-identical. `lint-self`: clean.
- `regress.vl`: no runs lost, 0 → silent.
- Render-parse budget: 53 type-string parses, two below baseline. The baseline is re-written
  centrally.
- Late demands: at baseline.
- `check-filed-witnesses --strict`: 4822 as filed, 0 MOVED, 0 output mismatches.
