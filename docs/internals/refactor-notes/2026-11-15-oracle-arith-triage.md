# Oracle: triage of the arith fuzz on seeds 31-100 (2026-11-15, lane O)

`gen.ts` seeds 31-100, 14,000 cases, on master `93ad5a25c` with a host built from it. #8457 left
23 DISAGREE and 3 UNSOUND cells that no filed row explains. Each was reduced to a minimal witness
(lines removed while `vl check` passes and both sides still run and differ), and then probed
by ablation.

## Split

| class | cells | what |
| --- | --- | --- |
| oracle gap, fixed | 16 of the 26 (all 3 UNSOUND) | below |
| compiler, new row | `ar_s91_0048` | [D16670](../inventory/D16670.md): `(2.0 as! i32) * 2000000000` at an `i64` folds as a constant |
| compiler, new row | `ar_s67_0013`, `ar_s71_0182` | [D16671](../inventory/D16671.md): `-(join)` does not adopt `i64`/`f32` (`~` does) |
| compiler, D16498 face | `ar_s53_0089`, `ar_s68_0025`, `ar_s88_0048` | a radix `+` arm that overflows 32 bits is folded at 32 in an `i64` join |
| unclassified | `ar_s71_0076`, `ar_s97_0193` | still in triage |

The fixes surfaced 3 cells that were not among the 26:
- `ar_s42_0114` and `ar_s79_0126` were 2 more oracle gaps, now fixed.
- `ar_s53_0089` is a D16498 face, in the table above.

Also a D16498 face, for its lane: `if c { (-1) >>> 4 } else { 3000000000 }` prints
`268435455`, a decimal `>>>` arm folded at 32 bits in an `i64` join.

## Oracle gaps fixed

Each has a minimal witness here; the compiler's reading is the ruled one.

| witness | rule |
| --- | --- |
| `v2 += (if c { floor(v2) } else { 16777217.0 - (-0.25) })`, `v2: f32` | the rounding builtins keep their operand's kind (E2.7) |
| `const v3: i64 = (a * (if c { -1 } else { 3000000000 })) << 41` | a wide decimal arm makes an integer join `i64` under a destination too (4.3) |
| `(-2147483648) >>> 0` in a join | a negative constant's 32-bit `>>>` reading is signed |
| `v0 *= (if … { … } else { (0.1 + 3.0) - 2.5 })`, `v0: f32` | a compound assignment re-folds a join's float arm at `f32` (Q9) |
| `(~(0x7fffffff >>> v)) as f64` | a radix shift tree in an `f64` context computes at 64 bits (4.2) |
| `(if … { (if … { 1 } else { 4294967296 }) } else { 0xFFFFFFFF }) as? i32` | a nested join's constant tails decide the join's `i64` |
| `max(3000000000, (-1) >>> 30) < 0xFFFFFFFF` | a width-dependent constant beside an `i64` constant takes it |
| `((join) * (-2147483648)) \| 10000` | only `+ - *` run before a literal join is typed |
| `((if f { 3 } else { 65535 }) << 18) as i64` | a cast target types a tree over a literal join (T2.4) |
| `(join(2147483647 \| 2) * (-2147483648)) \| a` | D3043's widening skips a join tree |
| `const x: i64 = (if c { 0xFFFFFFFF } else { -1 }) << z` | a literal-join left shifts as a constant left (Q8) |
| `(if f { (if c { 3.0 } else { (a as f32) }) } else { (0.1 + 1.5) - 1.5 })` | a join's kind is its arms' wider kind |
| `max(min(1, 0xFFFFFFFF), 0xFFFFFFFF + 3000000000)` | a constant that does not fit the `i32` argument widens `min`/`max` (D3043) |
| `const x: i64 = a - (if c { 0 ^ 0xFFFFFFFF } else { ~(-1) })` | a join of constant arms takes a typed peer's width |
| `(if c { (-9000000003) & 0xFFFFFFFF } else { 1 }) < (0xFFFFFFFF - 0)` | an `i64` radix tree arm makes the join `i64` (D16492) |
| `min(<i64 constant>, 9 + (0xFFFFFFFF >> v))` | `min`/`max` reads a shift tree beside an `i64` constant at `i64` |
| `if c { 3 } else { -((-2147483648) / 0xFFFFFFFF) }` | an untaken arm's trap is no trap of the program |

Two shapes are named SKIPs, not readings:
- **A literal-join shift count beside a typed `i64`.** The compiler reads a join at its own
  default and a bare tree at the left's width, and Q8 does not rule which applies.
- **A radix shift by a run-time count at an `f64` binding.** The oracle does not convert it;
  `gen.ts` does not produce it.

## Measurement

| run | before | after |
| --- | --- | --- |
| seeds 31-100, unexplained DISAGREE + UNSOUND | 23 + 3 | 8 + 0 (6 compiler, 2 open) |
| `fuzz.sh --seeds 10 --count 200 --gen all` | exit 0 | exit 0, 0 disagreements |
| `oracle.ts distilled` | 0 new | 0 new |
| join / radix-float / ruling grids | 64 / 182 / 23 | 64 / 182 / 23 |
