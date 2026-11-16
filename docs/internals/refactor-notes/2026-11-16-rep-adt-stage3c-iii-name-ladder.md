# Rep ADT stage 3c-iii: `nameFieldCodeTy` reads the storage rep, 2026-11-16 (lane REP)

This is step 3c-iii of the split approved after
[3c-ii](2026-11-16-rep-adt-stage3c-derived.md). The producer that decl, shape and union rows code
their fields with is `nameFieldCodeTy`. It now derives the code from the field type's rep. The
type ladder it wrapped (`fieldCodeOfTyCovered`, `fieldCodeOfDeclinedTy`,
`nulRefListFieldCodeOfTy` and seven helpers) is deleted.

## The derivation

1. A closed record, bare or `| null`, is `FC_STRUCT`, answered by shape (see the finding below).
2. Otherwise, `fieldCodeOfRep(repOfTy(strLitAsSet(ty)))`. A lone string literal is stored as its
   one-member set, the atom, as the row's storage type already is.
3. The answer is -1 for no type, a type with no rep (a type parameter, `never`), or a union that
   no box row stores yet (`valueBoxOfTy`, `unRowOfTyKey`, `unRowOfCanonFolded`). The ladder
   refused exactly those 24 calls.

## Graded before the flip

A default-off candidate shadow compared the ladder with the derivation at every call, over
`tests/cases`, `std` and the distilled `cells/` and `named/`:
- Against the bare `repOfTy(ty)`: 745 calls differed on a lone string literal (atom against
  string), plus the 24 refusals.
- With `strLitAsSet` and the union-box refusal: **54,623 of 54,623 calls agree**.

**Finding: asking the rep early is not free.** On master `078e41168` one cell,
`d15314_d315`, builds only because the ladder answered a record by shape. Asking `repOfTy` for the
record `H` before emit knows it is a union arm fixes its rep as a plain struct. Emit's own check
then fails: "a record type's rep changed during emit, from a union arm to a plain struct". The
earlier shadow could not see this cell, because it did not build on that shadow's base. Rung 1
answers records by shape, which keeps the cell building.

## Identity and cost

Both seeds are fixpoints; the base is master `078e41168`.

| | |
|---|---|
| `corpuscmp.vl` (`tests/cases`, `std`) | 8,303 modules: 6,937 identical, **0 DIFFER, 0 LOST** |
| distilled cells and named, built with both seeds | 8,905 buildable: **8,905 identical** |
| seed size | 6,387,453 → 6,383,862 (−3,591 bytes) |
| L2 self-compile fuel | 92,020,018,215 → 91,957,201,801 (−0.07%) |
| net compiler lines | **−251** |

`FIELD_UNION_FOLDED_ONLY_MSG` goes with the ladder. A union filed only under a structurally equal
member set now codes as that row's union box (`unRowOfCanonFolded`), as the corpus already read
it.
