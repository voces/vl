# The oracle computes a radix tree at its use's width (ruling A), 2026-11-15

Lane O. Lane N's triage of the arith cells that stay red on master named 7 as oracle-side under
ruling A (DECISIONS: a radix literal is the bit pattern at its use's width under every operator):
`ar_s6_0075`, `ar_s9_0140`, `ar_s9_0188`, `ar_s9_0189` and `ar_s10_0190` disagreed, and
`ar_s10_0069` and `ar_s12_0147` were COMPILED-BAD traps the oracle never reached. The ablation
gives three families, all oracle-side:

| family | witness | oracle before | ruled (and compiled) |
| --- | --- | --- | --- |
| R1: a width-dependent radix subtree was computed at 32 bits before its use was known | `(0xFFFF0000 \| 0xFF) + 3000000000`; `min((0xFFFFFFFF / (-1)), t)`, `t: i64` | `2999934719`; `1` | `7294902015`; `-4294967295` |
| R2: a radix arm joined with a decimal arm outside `i32` | `if c { 4294967296 } else { 0xFFFFFFFF }` | `-1` | `4294967295` |
| R3: a shifted constant in `min`/`max` beside a typed `i64` | `min(t, 0xFFFFFFFF << s)` | `-16` | `5` |

- **R1.** A radix result that `radixAtWidth` computes at 32 bits with no use fixing the width yet
  also keeps its 64-bit reading (`w64`), and `trap64` when that reading divides by zero. An `i64`
  or `f64` use reads it, and ring operators carry it through. The two traps are this 64-bit reading
  reaching a zero divisor (`(-1) / 0xFFFFFFFF` is `0` at `i64`), so the oracle now traps where the
  compiled program does. A shift count keeps its own reading (Q8): `9 << (7 % 0xFFFFFFFF)` is `9`.
- **R2.** With no destination, an `if` whose other arm is a decimal constant outside `i32` reads
  its radix arm at `i64`, as `pairDefault` already pairs two constant operands.
- **R3.** `min`/`max`/`abs` read a typed argument's kind from its declaration, and a shift of a
  constant by a variable count takes it, as a constant argument does. Each argument still runs
  once, in order.

## Measured on master `d534d4226`
| population | master's oracle | this oracle |
| --- | --- | --- |
| the 7 cells | DISAGREE 5, COMPILED-BAD 2 | AGREE 7 |
| `fuzz.sh --gen arith`, 30 seeds × 200 (same compiled outputs) | AGREE 4,649, DISAGREE 12, COMPILED-BAD 5 | AGREE 4,659, DISAGREE 6, COMPILED-BAD 3; 10 cells move, all improvements (6 DISAGREE, 2 COMPILED-BAD, 2 SKIP → AGREE), none regresses |
| distilled corpus | AGREE 11,114 | identical |
| `radix-float-grid.ts` | AGREE 182 | AGREE 182 |

`known.txt` loses its whole D2617-class block (9 cells, which all agree now, `ar_s36_0129`,
`ar_s40_0048` and `ar_s48_0169` checked from their seeds) and the stale `ar_s9_0102` line.
`ar_s5_0107` stays: it is spec question 2 (D2617's fixture against ruling 4.3), which lane N left open.

No compiler change.
