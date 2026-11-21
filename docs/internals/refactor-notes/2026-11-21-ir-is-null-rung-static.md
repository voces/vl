# IR coverage: an `is` test at the null-test rung, or with a static answer (2026-11-21, lane IR-N1)

`boxTest` refused every `isArmOf` rung but `variant` and `armTag` (`is rung`, 11 self-compile
functions alone, 180 corpus). Split by rung on the self-compile: `nulTest` 5, `emptyFit` 4, `litArms` 1,
`static` 1. In the corpus: `litArms` 51, `emptyFit` 43, `never` 38, `static` 20, `pinNever` 10.

## What landed

- **`nulTest`**: `recv is null` / `recv is <member>` over a nullable niche is the niche's own null
  test, as `emitIsArm` writes it (`emitNulIsNullTest(…, !isTestsNull, nicheOnly: true)`). The
  builder makes the same `RNulTest` a `== null` makes, and the lowering asks `nulTestArmOf` niche-only
  when its node is an `is`. An impossible test (`nulNicheIsTestImpossible`) is a named miss.
- **`never`, `pinNever`, a static `true`**: the constant, after a receiver that is no re-readable
  place is evaluated and dropped (`isConstAfterRecv`). A static `false` first tries legacy's
  empty-list fit, so it is a named miss (`is static empty fit`).

## Legacy reads a constant `is` back off its bytes

`staticIsGuard` reads the bytes just written. When they are exactly `i32.const k`, it decides the
`is` and writes the dead arm its own way. It does this in four places:

- a statement `if`;
- a value `if`;
- under `!`, which it folds to `1 - k`;
- the left of `&&`/`||`, whose right side it writes as a dead arm.

The value and tail `if` builders already missed a constant `is` condition. This change makes the
statement `if` chain miss it too (`decided is condition`), folds `!` over a constant `is` to legacy's
constant, and misses a constant `is` on the left of `&&`/`||` (`decided is short-circuit`).

## Two receivers left legacy's, not explained

Under the first cut, 34 `tests/cases` programs and 8 corpus cells differed. Two shapes were left
after the readback sites were matched:

- **A lambda.** Legacy evaluates and drops even a plain receiver before the constant: a capture
  (`() => v is T`), and a folded global (`() => gi is T`) in a lambda with no captures. A plain
  generic function writes the bare constant.
- **An element read** (`print(xs[1] is f32)`, a mixed-width list). Legacy evaluates and drops it,
  bounds check included, though `unionEqOperandOk` calls it re-readable.

Both ask `unionEqOperandOk` of the same node on the IR side, so some legacy context answers
differently. It was not found within this step. The builder misses both shapes by name:
`is static in a lambda`, and `is static receiver place` for a re-readable receiver that is not a bare
name.

## Coverage

Measured on fixpoint seeds of this branch and of its merge base, master `b39b74874`, each
building this branch's source.

| population | merge-base | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker (19,400 built) | 19,195 | 19,200 |
| self-compile `is rung` alone | 11 | 5 |
| self-compile claimed (mode 3) | 19,175 | 19,180 |
| corpus covered = verified = matched (45,678) | 42,735 | 42,751 |
| corpus `is rung` alone | 183 | 97 |
| `tests/cases` covered / matched (armed shadow) | 57,234 / 57,221 | 57,335 / 57,322 |

The self-compile's 5 left are `emptyFit` 4 and `litArms` 1. The corpus's 86 that left `is rung`
mostly moved, and did not clear. Alone, 40 now stop at `decided is condition`, an `if` over a
constant `is` that legacy decides off its bytes. Another 7 stop at `is static empty fit`, 6 at
`is static receiver place`, 4 at `is impossible null test` and 2 at `is static in a lambda`. The
statement `if` that legacy writes with a dead arm is the next payoff: building it unblocks the 40.

- **Byte proof:** mode 3 self-compile identical; `ir-identity --names` 9,037 identical, differ 0,
  self-compile identical; `--cases` 7,556 identical, differ 0, witnesses 60 same; per-file
  `tests/cases` A/B 8,670 same, differ 0. `tests/cases`' armed shadow adds no fail, differ or
  mismatch row.
- **Ratchets:** L2 fuel 104,920,629,097 → 104,981,539,745 (+0.06%); late demands, late tags,
  phase state, ladder sets, dead exports and lint-self clean (`gate.sh --fast`).
- **Compiler lines:** +107 / −16.
