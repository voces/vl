# Step 7 L2 §7: `monoPinMintedUnion` asks the whole annotation's type whether it is a union, 2026-11-12

Two of w310's union-reader census sites (`2026-11-12-step7-l6-name-readers-census.md`) sit in
`monoPinMintedUnion`. Both parsed the pin's spelling to ask whether it still names a union:

- the collapse test `monoPinUnionCollapses`: 5,021 programs;
- the name's own atom count: 905 programs.

Both now ask the whole annotation's type at the pin: `monoAnnPinTy(own)`, else `ty`. A union or
a nullable is still a union; anything else collapsed. `monoPinUnionCollapses` is dead and goes.

The base is master `e1a74f72d`.

## Measured before the cut

A probe ran over all 7,823 `tests/cases` programs and the compiler itself
(`vl check --codegen compiler/entry.vl`). The probe was validated: before it was narrowed, it
fired on `scripts/seed-provenance.vl`.

- **First run, asking `ty`:** 55 programs disagreed. `ty` is what the type parameter was pinned
  at, while the spelling is the whole annotation, such as `V | null` for a record `V`.
- **Second run, asking `own`'s pinned type:** one disagreement left at these two sites. A union of
  two identical maps collapses by spelling but stays a `TyUnion` by type.
- **A one-atom name:** both branches return the name unchanged, so the probe measured only
  spellings of two or more atoms.

## Not cut

The element test (`pcAtoms`, 141 programs) disagrees on alias-named and literal-union elements
(`K`, `AB`, `Shape`, `"a" | "b"`). There the spelling separates elements that the type alone
does not, so it stays a spelling.

## Graded

- **A/B:** all 55 disagreeing programs against a same-source master seed. 0 differ in output.
- Seed: fixpoint. `lint-self`: clean. `budget_pin_helper_test`: passes, with one helper fewer.
- `regress.vl`: no runs lost, 0 → silent.
- Late demands: at baseline.
- `check-filed-witnesses --strict`: 4832 as filed, 0 MOVED, 0 output mismatches.
