# The IR blocker census, 2026-11-16

Lane IR-C. This is an instrument, not a cutover. The first-miss histogram ranks blockers, not payoffs.
C2f's string-literal step removed the `expression string` row and gained no coverage, because those
functions stopped at their next miss instead. The census reports, for each function, the whole set of
classes that keeps it uncovered. A coverage step's payoff is the functions whose set it empties.

## What landed

- **Mode 4 of the shadow** (`irShadowArm(4)`, `$VL_IR_SHADOW=4`). The builder goes on past a missed
  statement, and past a parameter or result rep it does not admit. Each function counts one row,
  `blockers <classes>`: its miss classes sorted into one key, or `blockers none`. The function is not
  verified or lowered, and no emitted byte moves.
- **`ir-shadow.vl -- --blockers [--top N]`** runs the census over the distilled corpus. It prints the
  classes that alone keep functions uncovered, and the pairs that do together.
- **The builder's catch-all miss names its node kind** (`expression array`, `expression string`,
  `expression if` …), through `irAstKind`.
- **The host accepts mode 4.** It is a one-line change in `ir_shadow_mode`.
- **`ir-design-2026-11.md` §10** records two things: coverage steps are chosen and graded with the
  census, and the I3 seat deferral. The six seats stay legacy-only until claiming covers coercion,
  because their readers are `emitExpr` itself for unclaimed functions.

The census is an upper bound. A statement stops at its first miss, so a second blocker in the same
statement is not seen. The shadow's coverage after a step is the real figure.

## First readings, on master `2195722e`

Corpus, 45,031 functions, 12,996 with no blocker:

| one class alone | functions |
|---|---:|
| string member | 1,013 |
| assignment target | 699 |
| call of a non-declaration | 521 |
| statement | 449 |
| parameter rep record | 443 |
| indirect call | 375 |
| declaration coercion | 345 |
| expression array | 113 |

| two classes together | functions |
|---|---:|
| callee signature + valued tail if | 1,011 |
| expression array + indirect call | 702 |
| string member + valued tail if | 684 |
| assignment target + indirect call | 674 |
| call of a non-declaration + parameter rep nullable | 575 |
| expression is + parameter rep box | 572 |

Self-compile, the largest single and paired sets: `expression is + local rep box` 1,213, `indirect
call` 353, `list length rep` 311, `statement` 280, `operand at string` 280, `operand at string +
valued tail if` 199, `expression array` 182.

`valued tail if` pairs with many classes, so a step that covers it multiplies another step's payoff.
`string member` together with `operand at string` and `expression string` is the string family. The
census ranks it first on the corpus.
