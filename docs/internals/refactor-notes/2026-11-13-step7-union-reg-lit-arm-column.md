# Step 7 L6 (lane G, #13 step 1): member slices bank a literal-arm column, 2026-11-13

The base is master `6faa6df4`. A box row stores each literal arm at its base scalar, so `K | L | i32 | null`
over `K = "a" | "b"` and `L = "x" | "y"` is the slice `string, string, i32, null`. Before this cut,
`msSetCarriesLitUnionArm` saw the repeated `string` and answered -1, which sent its callers back to
the union's spelling (`unionCarriesLitUnionArm`). Now the row's producer reports which members are
softened literal arms (`boxRowMembersInto`'s and `canonUnionMembersLitsInto`'s `lits` output). The
slice banks that as `unMemLitArm` / `msFreeLitArm`, and the set answers from it. A literal union is
two or more literal arms that share a base. A lone literal arm counts as its base. A literal-only
union's members are literals, never arms.

## Decision table

This was measured on the corpus population (`vl check --codegen` over every test case and filed
witness). The probe compared, at each `msSetCarriesLitUnionArm` call, the new answer with the old
set answer, and at the spelling fallback the new answer with the spelling's answer.

| new answer against master's effective answer | sites | programs | outcome |
| --- | --- | --- | --- |
| the set now answers where master fell back to the spelling, and agrees | 3 | 2 | `K\|L\|i32\|null`, `K\|L\|f64\|null`: the set covers what only the spelling did |
| the set now answers 1 where the spelling answered false | 7 | 5 | inline `i32 \| "a" \| "b"` (D15170, D8123, D8181) and two `is`-dispatch cases; every program's output is byte-identical to master |
| old set answer 0, new -1 (a repeated plain record member), spelling also false | 2 | 1 | unchanged |
| everything else | 778 | | unchanged |

The spelling fallback still runs where the set answers -1: 82 sites, 4 of them answering true
(`MU` ×2, a mixed-base union of aliases kept nested, and `K | f64 | null` ×2, reached with no set). The
next cut grades these.

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, and the comment, ladder, sentinel and scan budgets.
- **The full sweep:** CI's `sweep` label.
