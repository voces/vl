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

MEASUREMENTS
