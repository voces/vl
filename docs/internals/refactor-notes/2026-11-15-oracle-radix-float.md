# The oracle models a radix literal in a float context (owner ruling 4.1, 2026-11-15)

Owner ruling 4.1 keeps today's behaviour for a radix literal at a float: `0xFFFFFFFF as f32` is
−1.0 and `as f64` is 4294967295. `scripts/oracle/interp.ts` used to decline every radix constant
in a float context; it now models a lone literal (`radixFloat`). A constant tree, such as
`(0xFFFFFFFF + 1) as f64`, still declines: ruling 4.2 moves it to 64 bits, lane N implements that
in the compiler, and the oracle follows once that lands.

**The rule, measured on the compiler.** "The bit pattern at the destination's width" describes
only one arm of it. A 208-program grid (26 literals × 8 positions: `as f32`, `as f64`, an
annotated `f64` binding, an `f64` parameter, an annotated `f32` binding, an `f64` constant peer
under `+` and `*`, and the tree) fixes the rule as follows:

1. If the float holds the literal's unsigned value exactly, it is that value: `0x80000000 as f32`
   is 2147483648, and so are `0xC0000000` and `0xFFFFFF00`.
2. Otherwise it is the signed value of the literal's **own** pattern (32 bits up to `0xFFFFFFFF`,
   64 bits above, T2.3), rounded to the float: `0xFFFFFFFE as f32` is −2, and
   `0xFFFFFFFFFFFFFC00 as f32` is −1024 (a 64-bit pattern, not a 32-bit one).
   `0x1_0000_0001 as f32` is 4294967296, its positive 64-bit value rounded.

The destination's width sets only the rounding. Under step 1, `as f64` of any 32-bit literal is
its unsigned value.

| oracle | in subset | AGREE | DISAGREE | SKIP |
| --- | --- | --- | --- | --- |
| master, the grid | 112 / 208 | 94 | 18 | 96 |
| this, the grid | 182 / 208 | 182 | 0 | 26 (the tree cells, 4.2) |
| master, `fuzz.sh --gen arith --seeds 8` (1600) | 1082 | 1080 | 1 (known) | 518 |
| this, the same programs | 1096 | 1094 | 1 (known) | 504 |

Master's 18 grid disagreements were the oracle's own errors. Beside a float constant
(`1.5 + 0xFFFFFFFF`) it read the literal at its i32 pattern. At a declared `f64` destination it
took the unsigned value even where step 2 applies, as with `0xFFFFFFFFFFFFFC00`. The distilled corpus is unchanged:
12,037 cells, 96.0% in subset, 0 new disagreements.
