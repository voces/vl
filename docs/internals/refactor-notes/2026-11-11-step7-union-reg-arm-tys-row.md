# Step 7 L6: a bound union's arms are read off its row, not looked up again by its member-set text, 2026-11-11

Cut C of the `unKey` retirement (`2026-11-11-step7-union-reg-unkey-dead-readers.md`). The census
counted 1,610 reads that found a row through `unRowOfSetText`, the softened key of a member-set
spelling, behind `unionRowOf(name)`. Most came through `unionArmTys(name, …)`.

The base is #7261.

## What the hits were

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded each
set-text hit's spelling and the row it found, over every `tests/cases` file and every distilled
`cells/` cell (9,202). They were not literal sets the canonical key misses, as the plan had
guessed. They were a round trip:

| spelling looked up | row found | hits | programs |
| --- | --- | --- | --- |
| `string\|string` | `K` | 254 | 17 |
| `string\|string` | `K0` | 120 | 8 |
| `string\|string` | `AB` | 63 | 7 |
| `i32\|i32` | `N` | 41 | 2 |

`unionArmTys(name)` resolves an alias to its recorded member-set text (`unionArmsOf` returns
`K`'s set, `string|string`), then asks `unionMemberTysOf` of that text. The text is bound to no
row, so it went through the set-text key, which led back to the alias's own row.

## Changed

- **`unionArmTys`** reads the members of the row `name` is bound to (`unRowOfName`), when it is
  bound. Only an unbound spelling goes through `unionMemberTysOf` and the set text.
  `unionMemberTysOfRow` is exported for it.
- **`unionMapArmIdent`** (`emit_fn_scans.vl`) asks its binding's type first. That is the type
  declared or inferred at the declaration (`unionTyIxOfIdentAt`), so it stays blind to
  narrowing. It asks that type's row (`unRowOfTyKey`), and the new `unRowHasMapArm` says whether
  that row has a map member. Only a binding with no such row asks by the spelling it reads.

## The reading

| | set-text hits | programs |
| --- | --- | --- |
| #7261 | 1,610 | 105 |
| the binding's type in `unionMapArmIdent` alone | 1,587 | 104 |
| this PR | **909** | **38** |

Of the 909 left, 757 are one program, `maps/recursive-alias-declared-first.vl`
(`type J = null | f64 | JO`, looked up as `f64|JO|null`). The rest are small: an alias's set
text such as `i32|string => U` reached through readers other than `unionArmTys`. Those are the
next cut.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against #7261:

  ```
  same                            23913
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, distilled `regress.vl`, `cases_wasm`, seed-size,
  late-demands, the dead-export and render-parse budgets, and `vl_scaling_shape`, the one test
  that names a changed file.
