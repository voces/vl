# Fix D17053: `x is S[]` over a `(string | null)[]` arm (2026-11-22, lane IR-N1)

A legacy fix, graded under Q15, stacked on the D17052 fix (#9614). `string[]` and
`(string | null)[]` box under the string list's tag. `listIsAcrossRepsPlan` found no fit for the
nullable arm and skipped it, so a value of it ran the `string[]` arm's string loop, whose `str`
element mode casts each element non-null (`ref.as_non_null`) and trapped on a null.

## What landed

- `listArmNullableStrsFitLits(a, chk)`: a `(string | null)[]` arm against a string literal list is
  planned as `LIST_ARM_NULSTRS`. Where it shares its tag with a `string[]` arm's `LIST_ARM_STRS`
  (`strsPair`), the shared entry takes the null-tolerant test, which answers for both.
- `emitListFitElem`'s `nulstr` mode: a null element is no member; any other is compared as `str`.
- `tests/cases/unions/is-string-literal-list-over-nullable-string-list-arm.vl`: the witness, a
  mixed and an all-member nullable list, and the arm over `i32[] | (string | null)[]`.

## Readings

Fixpoint seeds of this branch and of #9614's head (`fix-atom-list-arm-tag`, master `09bf5852`
merged).

- **Moved programs:** `tests/cases` A/B same 8,752, differ 1, the new witness. Master traps on its
  second test, and this branch prints `true false true false false true false`.
- **Byte proof:** mode 3 self-compile identical; `--names` self-compile identical; `--cases`
  identical 7,639, fail under both 68, differ 0, witnesses same 62; `--claimless` identical
  14,025, fail under both 3,267, differ 0.
- **Distilled corpus:** no runs lost. **Armed shadow:** identical to the base over `tests/cases`.
- **Matrix:** `is-list-s-over-string-nullable-other` runs 0 of 64 on the base (a trap) and 64 of 64
  here. The other 23 `is-list-*` templates run 64 of 64 on both, and `runs -> not-runs` is 0.
- **Order check (mode 6):** 0 order rows over 21,057 programs. **Stack margin:** 960 and 940 KB
  pass, 920 KB fails, on both. **Fuel:** L2 +0.00%.
