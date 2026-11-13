# Step 7 L6 (lane G): a recursive union mints one row (D16000), 2026-11-13

The base is master `8f88f730`. `registerInlineUnionGo` asks whether the union's type key already
has a row, then registers the unions its members hold before minting its own. For
`type JO = {[string]: J}; type J = null | f64 | JO` with the map alias declared first, the outer
registration (site 41) found no row. Its member walk reached `J` again (site 29), and that inner
call minted row 0. Back in the outer call, it minted row 1 for the same name and type. The fix
re-checks the type key right before `mintInlineUnion` and adopts the row that the walk minted.

## Measurement

The probe was a duplicate-row scan at the end of emit: every pair of `unTyIx` rows whose types are
`tySame` and `tyEq`. It ran over the corpus population (every test case and filed witness), once
before the fix and once after.

| | programs with a duplicate row |
| --- | --- |
| before | 2: `tests/cases/maps/recursive-alias-declared-first.vl` and the D1037 witness |
| after | 0 |

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, and the comment, ladder, sentinel and scan budgets.
- **The full sweep:** CI's `sweep` label.
