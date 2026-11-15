## Infrastructure (Track F)

- **The arith fuzz's unexplained cells on seeds 31-100 are triaged.** Of 26 cells (3 UNSOUND,
  23 DISAGREE), 18 were oracle gaps, now fixed with smoke pins, and all 3 UNSOUND were among
  them. The rest are compiler rows, as are lane T's seeds 1-18 cells:
  - D16670: a float constant's `as!` folds as a constant.
  - D16671: unary `-` over a literal join does not adopt.
  - D16672: `(-1) ^ 0xFFFFFFFF` reads exact.
  - D16673: a constant division by zero with a radix leaf is not refused.
  - D16498's radix `+` face.

  The oracle's subset on those seeds rises from 93% to 99%.
- **The nightly's arith oracle leg reports and does not gate** (`fuzz.sh --report-only arith`)
  until its filed families are emulated or closed. The other generators, and every refusal
  ceiling, still gate. The arith ceiling is 8%; a 400-case sample reached 6.25%.
