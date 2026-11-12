# Step 7 L2: a literal row's list pin takes its depth from the list type, 2026-11-12

Lane I's close draft accepted `monoAnonRowListTy`'s lookup of a literal's `#anon` row by its
handle, since the handle is the row's own key. It did not accept how the function found the list
depth: by stripping `[]` suffixes off the name (`#anon0[]` → depth 1). The coordinator ruled that
a spelling read, and asked for the depth to come from the list type.

`monoAnonRowListTy(name, listTy)` now counts `listTy`'s `TyArray` nesting. It then slices exactly
that many `[]` off `name` to get the handle, and looks the handle up as before. The two callers
pass their list type:

- **`monoSubstIsExpr`** passes the `is` test's type with the instance's exact bindings
  substituted: `substTyDeep(isVarTyIxOf(ix), monoFoldSubN, monoFoldSubT)`, the type the same
  function already falls back to for a signature key.
- **`monoSynthPinRef`** passes the pin's own type `ty`. It reaches the function only when `ty` is
  open or absent. An open type still carries its list nesting, and an absent one answers -1.

## Measured

A scratch probe compared the old answers with the type's, counting decisions over 24,070
programs. It was never seeded.

| caller | reached | the handle route answered | the type agrees |
| --- | --- | --- | --- |
| `monoSubstIsExpr` | 245 (56 programs) | 1 (D5083) | the substituted type is the same type |
| `monoSynthPinRef` | 301 (144 programs) | 8 (6 programs) | the open type's list depth is the same at all 8 |

The 7 programs where the route answered were each built with a base compiler and with this
cut's, both from one seed. All 7 are byte-identical: D5083, D9647, D15561, `d15203_run_param`,
and three `tests/cases/closures` files.

The probe reports through `emitFail` and is blind to programs that already refuse. CI's sweep
covers those.

## Counts

- `monoAnonRowListTy` no longer parses `[]` suffixes. Its name argument is read only as the
  `#anon` handle, under lane I's contract.
- pin-helper: 908, unchanged.

## Proof

- **Locally, on master:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - late demands 8;
  - seed +1.9%;
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict`: 4,863 as filed.
- **The sweep** is CI's (`sweep` label).
