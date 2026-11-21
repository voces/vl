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

## `emitIs`'s pre-arms come before any rung

`emitIs` answers some tests before `isArmOf` is asked, at `isPreArmOf`'s pre-arms: `tautology` writes
the bare constant, `covers` and `fits` evaluate and drop the operand and then write `1`, and `prim`
and `pin` drop an operand that is not effect-free. The first cut of this change asked `isArmOf`
alone, so it wrote a bare constant where legacy wrote the operand first (`--claimless` differed on
D3359 and D3360, `a is U` over an alias union at the `fits` pre-arm; the armed shadow read
`prefix or locals at 0x09 vs 0x06`).

`boxTest` now asks `isPreArmOf` first: past the storage path, any pre-arm other than `test` is a
named miss, `is pre-arm <arm>`. That also explains the two receivers the first cut left unexplained,
a lambda's capture and an element read: neither is effect-free, so the `prim` pre-arm drops it.
Building the pre-arms' own bytes is the follow-on (`isDecidedPlanOf`).

## Coverage

Measured on fixpoint seeds of this branch and of master `04650021`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,280 | 19,285 |
| self-compile `is rung` alone | 9 | 5 |
| self-compile claimed (mode 3) | 19,260 | 19,265 |
| corpus covered = verified = matched (45,678) | 43,416 | 43,421 |
| corpus `is rung` alone | 181 | 85 |
| `tests/cases` covered / matched (armed shadow) | 58,044 / 58,033 | 58,126 / 58,115 |

The corpus's 96 that left `is rung` mostly moved, and did not clear. Alone, 36 now stop at
`decided is condition`, an `if` over a constant `is` that legacy decides off its bytes, and 42 at a
pre-arm (`pin` 23, `tautology` 16, `prim` 3). The self-compile's one tautology is the same class.

- **Byte proof:** mode 3 self-compile identical; `ir-identity --names` 9,037 identical, differ 0,
  self-compile identical; `--cases` 7,567 identical, differ 0, witnesses 60 same; `--claimless`
  14,013 identical, differ 0 (D3359 and D3360 among them); per-file `tests/cases` A/B 8,681 same,
  differ 0. `tests/cases`' armed shadow adds no fail, differ or mismatch row.
- **Ratchets:** L2 fuel 104,619,110,901 (−0.3% on the 104,920,663,373 baseline); late demands, late
  tags, phase state, ladder sets, dead exports and lint-self clean (`gate.sh --fast`).
- **Compiler lines:** +111 / −16.
