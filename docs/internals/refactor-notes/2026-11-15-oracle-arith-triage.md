# Oracle: triage of the arith fuzz on seeds 31-100 (2026-11-15, lane O)

`gen.ts` seeds 31-100, 14,000 cases, on master `93ad5a25c` with a host built from it. #8457 left
23 DISAGREE and 3 UNSOUND cells that no filed row explains. Each was reduced to a minimal witness
(lines removed while `vl check` passes and both sides still run and differ), and then probed
by ablation.

## Split

The 26 cells, plus the cells the oracle fixes surfaced and lane T's 6 from seeds 1-18:

| class | cells | what |
| --- | --- | --- |
| oracle gap, fixed | 18 of the 26 (all 3 UNSOUND); T's `ar_s17_0027`, `ar_s18_0015`; 3 found by the fixes | below |
| compiler, new row | `ar_s91_0048` | [D16670](../inventory/D16670.md): `(2.0 as! i32) * 2000000000` at an `i64` folds as a constant |
| compiler, new row | `ar_s67_0013`, `ar_s71_0182` | [D16671](../inventory/D16671.md): `-(join)` does not adopt `i64`/`f32` (`~` does) |
| compiler, new row | T's `ar_s13_0110`, `ar_s13_0136` | [D16672](../inventory/D16672.md): `(-1) ^ 0xFFFFFFFF` prints the exact `-4294967296` |
| compiler, new row | `ar_s37_0026`, `ar_s82_0153` (surfaced once the oracle evaluates `~` of a radix) | [D16673](../inventory/D16673.md): a constant division by zero with a radix leaf traps instead of being refused |
| compiler, D16498 face | `ar_s53_0089`, `ar_s68_0025`, `ar_s88_0048` | a radix `+` arm that overflows 32 bits is folded at 32 in an `i64` join |

T's `ar_s11_0099` and `ar_s1_0179` are refused on master, and show only on T's branch, which
accepts the masking line.

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
| `min(0xFFFFFFFF >>> (if … { v0 } else { v0 }), (v0 << 6) * (if f { 3000000000 } else { 9 }))` | a join's static kind counts a constant arm outside `i32` |
| `3000000000 % (1 << m)` | a decimal constant-left shift beside an `i64` constant computes there too |
| `~0xFFFFFFFF` | a radix constant's `~` keeps its pattern exact (it was a SKIP) |
| `if f { p0 - 9223372036854775807 } else { 0xFFFFFFFF + 9 }`, `p0: i32` | `staticKind` applies D3043 to an operator |
| `(if … { <i64> } else { v3 * 0 }) >>> 63`, `v3: i32` | a typed arm widens to a wider typed arm (T3.6) |

Two shapes are named SKIPs, not readings:
- **A literal-join shift count beside a typed `i64`.** The compiler reads a join at its own
  default and a bare tree at the left's width, and Q8 does not rule which applies.
- **A radix shift by a run-time count at an `f64` binding.** The oracle does not convert it;
  `gen.ts` does not produce it.

## Measurement

| run | before | after |
| --- | --- | --- |
| seeds 31-100: subset | 93.0% | 99.0% |
| seeds 31-100: unexplained DISAGREE + UNSOUND | 23 + 3 | 0: the 6 DISAGREE + 2 UNSOUND left are filed compiler rows |
| `fuzz.sh --seeds 10 --count 200 --gen all` | exit 0 | exit 0, 0 disagreements, subset 99.8% |
| `oracle.ts distilled` | 0 new | 0 new |
| join / radix-float / ruling grids | 64 / 182 / 23 | 64 / 182 / 23 |

The nightly's arith leg can gate again once D16670-D16673 and D16498's new faces are emulated or
closed. The workflow line names that condition.
