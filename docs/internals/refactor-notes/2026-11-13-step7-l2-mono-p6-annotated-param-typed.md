# Step 7 L2, mono, P6 cut 3: a `T[]` parameter's pin is spelled from its element type (2026-11-13)

Lane D. Base `origin/master` at this branch's cut. The `monoPinAnnotatedParam` → `arrElemSuffixed`
site in lane H's render-parse census.

## Cut

A `T[]` parameter's pin was `arrElemSuffixed(bind)`, which reparsed the element spelling to
decide whether to parenthesize it. The element's type is already in hand: `bindTy`, or
`boundTy` when an earlier parameter bound `T`. The pin is now `monoPinSpellShaped` of the list
of that type. A `T` bound by spelling alone, with no type, keeps `arrElemSuffixed(bind)`.

## Decision table

From an `MPROBE` build over the 24,070-record population, comparing the typed spelling with the
old one:

| answer | programs | decisions |
| --- | --- | --- |
| typed spelling, same text as before | 567 | 1,953 |
| typed spelling, different text (a row name for a field spelling, e.g. `B[]` for `{v:i32}[]`) | 5 | 6 |
| no element type, keeps the spelling | 2 | 2 |

## Byte comparison

Master vs PR over every program reaching the site: **664 of 664 identical** (649 SAME, 15 SAME
refusal). That includes the 5 whose text differs: the two spellings name one type, and the
instance key reads the type.

## Residual

The two spelling-only binds are `build/sweep/witnesses/inventory/D5001.vl` and
`tests/cases/generics/closure-calls-generic-at-enclosing-explicit-type-arg.vl`. In both, `T` is
bound by an explicit type argument recorded as a spelling (`tvV`) with no type (`tvT`).
