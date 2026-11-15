# The five unexamined arith fuzz cells, and one trap: all oracle-side, 2026-11-15

Lane O. The coordinator asked for a verdict on each arith fuzz cell still red on master under the
recorded rulings (4.3, Q8/Q9). A 30-seed × 200 run on master `5e45620f9` gave the 5 cells left
after #8315 and one unlisted COMPILED-BAD trap. Reduced one ingredient at a time against both
sides, every one is the oracle's, in four families; no compiler row is filed.

| family | cells | minimal witness | oracle before | compiler (ruled) | rule |
| --- | --- | --- | --- | --- | --- |
| F1 | `ar_s18_0056`, `ar_s22_0173` | `if c { f } else { 16777217.0 % 1.5 }`, `f: f32` | `0.5` | `1` | 4.3: the float arm adopts the `f32` arm; Q9: it folds at `f32` |
| F2 | `ar_s19_0110`, `ar_s21_0178` | `(-v8) * (0xFFFFFFFF >>> 51)`, `v8: i32` | `-40955` | `0` | Q8: a constant count of 32–63 makes the radix left `i64`, beside a peer too |
| F3 | `ar_s20_0142` (UNSOUND) | `function f0(): f32 { ((-1) * (-9000000003)) as f32 }` | `null does not fit f32` | `9000000512` | 4.1 / D1890: `as f32` rounds an integer constant |
| F4 | `ar_s27_0121` (COMPILED-BAD) | `(-2147483648) / 0xFFFFFFFF` | `-2147483648` | traps | ruling A: at `i32` that is `INT_MIN / -1`, which overflows |

- **F1.** The `if` join re-folds a float constant arm in `f32` arithmetic when the other arm is `f32`.
- **F2.** `radixWidth` applies Q8's count rule before an `i32` context, and a shift's constant left
  that Q8 made 64 bits wide keeps `i64` under an `i32` peer. My own #8291 peer rule had let the
  peer's `i32` win.
- **F3.** `as f32` / `as f64` of a decimal integer constant rounds once (`bigToF32` rounds straight to
  24 bits above 2^53, where a double first would round twice). Before, it took the failed-cast path.
- **F4.** A radix `/` traps on `INT_MIN / -1` at its width, as wasm's `div_s` does.

## Measured on master `5e45620f9` (same compiled outputs, this oracle against master's)
| population | master's oracle | this oracle |
| --- | --- | --- |
| `--gen arith`, 30 × 200 | AGREE 4,662, DISAGREE 5, UNSOUND 1, COMPILED-BAD 1, SKIP 1,331 | AGREE 4,758, DISAGREE 1 (`ar_s26_0112`, D16472, known), SKIP 1,241; 96 cells move, all improvements (90 SKIP, 4 DISAGREE, 1 UNSOUND, 1 COMPILED-BAD → AGREE) |
| `--gen data`, 10 × 100 | AGREE 1,000 | identical |
| `--gen hof`, 10 × 100 | AGREE 627, COMPILED-BAD 373 | identical |
| distilled corpus | AGREE 11,131 | identical |
| `radix-float-grid.ts` | AGREE 182 | AGREE 182 |

The 90 SKIP → AGREE are mostly F3: the oracle declined every `as f32` of an inexact integer constant.
The hof run's COMPILED-BAD 373 are D16411/D16412's capability refusals, unchanged here.
