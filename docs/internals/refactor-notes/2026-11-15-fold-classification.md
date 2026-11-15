# Constant-fold classification: D16670 and D16673 (2026-11-15, lane O)

Both rows came from the oracle's arithmetic fuzz (2026-11-15-oracle-arith-triage.md). In both, the
fold classified a node before applying the rule that should have decided it.

| row | site | before | after |
| --- | --- | --- | --- |
| D16670 | `castConstSettle` (check_leaf_steps.vl) | rewrote the cast node into a literal, which a wider destination's literal adoption then moved | rewrites only the operand; the cast stays a typed value (E9.1) |
| D16673 | `cexDiv` / `cexRem` (const_exact.vl) | bailed on a radix pattern before testing a zero divisor | tests an integer zero divisor first (D2.3) |

Graded on the base seed and the new seed:

| spelling | base | new |
| --- | --- | --- |
| `const x: i64 = (2.0 as! i32) * 2000000000` (also return, argument, `i64` peer, float `as`) | `4000000000` | `-294967296` |
| `(3000000000.0 as! i64) * 2`, an `i32` destination, no destination | unchanged | unchanged |
| `0xFF % 0`, `(0xFF + 0) / 0`, `7 / (0xFF & 0)`, `7 / (0x100 - 0x100)`, `0xFF / (1 - 1)`, `0xFF % (~(-1))` | rc 0, traps | refused |
| `7 % 0`; `0xFF / 3`; `let z = 0; 0xFF / z`; float `/ 0.0` | refused; `85`; traps; `Infinity` | unchanged |

The oracle already read both rows the wanted way, so neither row ever had an emulation in
`scripts/oracle/interp.ts`, and there is none to remove.
