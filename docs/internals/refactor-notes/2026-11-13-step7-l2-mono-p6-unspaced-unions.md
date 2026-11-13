# Step 7 L2, mono, P6 cut 1: `monoUnspacedUnions` deleted (2026-11-13)

Lane D. Base `5359da97`. The first P6 site from lane H's render-parse census
(`docs/internals/render-parse-sites.md`): `monoListSpelling` → `monoUnspacedUnions`.

## Cut

`monoListSpelling`'s fallback reparsed its `render` argument to replace ` | ` with `|`. Its one
caller passes `monoPinSpellOf(t)`, and the pin speller already joins union members with `|`
(`monoPinSpellJoin(ms, "|")`). The parse is deleted, and the fallback returns `render`.

## Decision table

From an `MPROBE` build over the 24,070-record population:
- `monoListSpelling` is reached in 72 programs (120 decisions).
- 61 programs (103 decisions) reach its fallback.
- `monoUnspacedUnions(render) == render` on every one of those decisions: none changed.

The probe fires on the census's witness (`build/sweep/witnesses/inventory/D38.vl`).

## Byte comparison

Master vs PR on the 72 programs that reach `monoListSpelling`: **72 of 72 SAME**.

## Census

`monoUnspacedUnions` leaves the census's parser list. Master's baseline, re-derived by #7756,
already holds this tree's counts, so the baseline is unchanged here. The generated origins file
and sites table are left to the coordinator's fold.

## Not in this cut

`monoArgTyNameRep` → `arrElemSuffixed(arrLitElemName(...))` pins a list-of-records argument by
its element's FIELDS (`{f:i32}[]`). Every type speller names the record by its row instead
(`#anon1[]`, `P[]`). Over 86 programs (127 decisions), `monoPinSpellOf` of the literal's type
gives the same spelling in 24 programs, `monoPinSpellShaped` in 2 more, and none in 60.
Converting it changes the instance key, so it is a design cut of its own.
