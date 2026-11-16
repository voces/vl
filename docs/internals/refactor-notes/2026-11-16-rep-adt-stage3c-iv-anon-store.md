# Rep ADT stage 3c-iv, step A: an anonymous field's code is its storage type's, 2026-11-16 (lane REP)

Step A of 3c-iv, following [3c-iii](2026-11-16-rep-adt-stage3c-iii-name-ladder.md). `anonMintRowFor`
now takes an admitted field's code from its storage type (`anonFieldStoreTy`) through
`anonFieldCodeOfStore`. The anon ladder (`anonFieldCode` and its rungs) still runs. It decides
admission: a `-1` means the literal mints no row. It also answers the kept classes:

- a function-typed field, bare or `| null`: D16721, plus the `((T) => void) | null` field that the
  ladder stores as `null` (37) where the rep derives 22 (2 mints, both generic-function fixtures);
- a storage type the rep does not code: D16720 hole rows and D16722 hole lists.

The anonymous rows keep D5341's rule: a lone string literal is stored as the string it was
written as, while a declared row stores it as the atom.

Step B shrinks the ladder to the admission predicate.

## The reading that sized it

The scratch shadow, never seeded, ran over `tests/cases`+`std` and the distilled `cells/` and
`named/`: **4,247 of 4,449** field mints agree with `nameFieldCodeTy(anonFieldStoreTy(...))`.
- 131 are admission refusals. The ladder refuses the row; they become step B's named rungs.
- 68 are the three filed classes.
- 2 are the lone string literal (now a rule).
- 2 are the nullable function above.

## Rule for every later step

Any change that moves a rep query earlier is graded only on cells that build at the current
master. A shadow measured on an older base cannot see a cell that started building since then
(3c-iii found this on `d15314_d315`).

## Identity and cost

Both seeds are fixpoints; the base is master `2ac247930`.

| | |
|---|---|
| `corpuscmp.vl` (`tests/cases`, `std`) | 8,319 modules: 6,951 identical, **0 DIFFER, 0 LOST** |
| distilled cells and named, built with both seeds | 8,914 buildable: **8,914 identical** |
| armed (`$VL_REP_SHADOW`) over both corpora | **0** moved codes (each would `emitFail`) |
| L2 self-compile fuel | 92,634,191,459 → 92,640,396,507 (+0.007%) |
