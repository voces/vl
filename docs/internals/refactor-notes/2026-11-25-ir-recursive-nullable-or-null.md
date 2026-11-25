# IR rule 3: `T | null` over a recursive `T` that holds `null` (2026-11-25, lane COV-IS)

- **The failure**: a claim built `co[a] ?? null`, where `U = null | string | U[]`, and then failed
  verifier rule 3 ("vN's rep is not its type's") and fell back.
- **Why**: the read's type is `U | null`, which the checker does not fold back to the recursive
  `U`. That type's rep interns a nullable around `U`'s rep, which is already nullable
  (`nullable#6(inner nullable#1)`), while the temp holds `U`'s own rep (`#1`).
- **Who it blocked**: six gate tools under `scripts/` (`lib/census-read.vl`, `dup-census.vl`,
  `emit-refusal-sites.vl`, `sentinel-census.vl`, `survey-regrade.vl`, `codemods/label-at.vl`),
  11 functions in all.

## What landed

`outTyOf`, which names the type a value built at a rep is held at, gives a `T | null` whose rep is
a nullable around the held rep, itself already nullable, the type of that rep (`nullFoldedTy`,
`repTyOf`). Only the temp's type changes, so no byte moves.

## How it was measured

- **`scripts/`** (87 programs): on a compiler built from master, 11 functions in the six files fail
  rule 3. Here none do, and the six files match in full (1841 functions).
- **Q58 position sweep** (`tests/cases/unions/recursive-nullable-alias-or-null-positions.vl`,
  new): the `?? null` read bound by a `let`, returned, passed as an argument, joined by an `if`, a
  list element's and an assignment's value. On master `asLet` fails rule 3; here all 6 functions
  match and it prints its 8 lines.
