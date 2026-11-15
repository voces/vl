# Eight radix-width cells from the first fuzz nightly, delta-debugged into four families, 2026-11-15

Lane O. Lane B's triage of fuzz-nightly run 43686086648 (#8280) left 8 radix-width cells. Each was
regenerated (`gen.ts --seed S --count 200`), reduced by hand one ingredient at a time against both
the compiler and the oracle, and grouped by the ablation, not the message.

| family | side | cells | minimal witness | was | is |
| --- | --- | --- | --- | --- | --- |
| O1 | oracle | `ar_s25_0085`, `ar_s7_0127` | a join arm `min(-1, 2)` beside `-255`, then `- (if c { 1 } else { 0xFFFFFFFF })` at `i64`; `(255 >> v) + max(9223372036854775807, 1)` | the oracle's `staticKind` gave `min`/`max`/`abs` over constants no type, and an `if` under a destination ignored its typed arm | the call is typed at the wider of its arguments' defaults (E9.1), and a constant arm takes the typed arm's type under a destination too (T3.6); a shift of a constant takes a typed peer's type (Q8) |
| O2 | oracle | `ar_s32_0022`, `ar_s29_0063` | `p * (0xFFFFFFFF % 9)`, `p: i32`, at an `i64` destination | the oracle read the radix tree at the destination | under an integer destination, a radix tree or shifted constant beside a typed integer peer takes the peer's width when its constant fits it (D3043), else the destination's |
| C1 | compiler | `ar_s31_0104`, `ar_s43_0072` | `((-1) - 0xFFFFFFFF) as f64` printed `0` | the cast typed its operand as the `i32` tree | **D16491**: an `as f64` cast reads a radix tree at `i64` |
| C2 | compiler | `ar_s30_0123`, `ar_s44_0020` | `0xFFFFFFFF & 3000000000` printed `-1294967296` | the fold read a pattern's result at 32 bits beside an `i64` operand | **D16492**: a pattern beside a tree spelling an `i64` decimal is no constant; the typed check reads it zero-extended |

Two cells the coordinator listed as compiler-side were the oracle's: in `ar_s25_0085` the compiler
is right under T3.6 (the `min(-1, 2)` arm makes the join `i32`), and in `ar_s32_0022` under D3043
(`p * 0xFFFFFFFF` already agreed at the same width).

## Measured on master `7bf2afc7a`

| population | before | after |
| --- | --- | --- |
| the 8 cells | DISAGREE 8 | AGREE 8 |
| hand reductions (65 programs) | — | AGREE 63; `as f32` of a radix tree is outside the oracle's subset, and one `const` read (below) |
| `fuzz.sh --gen arith`, 12 seeds × 200, oracle against master's | — | 3 cells move: `ar_s7_0127` DISAGREE → AGREE, `ar_s3_0057` SKIP → AGREE, `ar_s2_0032` AGREE → SKIP |
| the same 2,400 cells recompiled | — | 1 output changes: `ar_s11_0002` was refused (a shift past 31 of the `i32` the fold made) and runs, agreeing with the oracle |
| distilled corpus, oracle | AGREE 11,102 | identical |
| `regress.vl` | — | no cell changed class |
| `radix-float-grid.ts` | — | AGREE 182 of 182 |
| `radix-tree-at-f64.matrix.vl` | — | 0 runs → not-runs, 0 silent |

`ar_s2_0032` goes to SKIP because the corrected join is typed `i32`, and beside it sits a constant
tree, `~(-2147483648 + -5)`, that does not fit `i32` at an `i32` destination; the oracle declines it
("constant overflows i32") rather than grading it.

## Open

`const x = 9223372036854775807 / (-9000000003); print(0xFFFFFFFF & x)`: the compiler reads the
`const` as its value (T2.4, "that value written in place"), `-1024819114`, an `i32`; the oracle
keeps the tree's `i64` spelling and prints `3270148182`. Inline, both now print `3270148182`. Which
reading a `const` read takes beside a pattern is a spec question, and nothing here changes it.

Compiler net +42 lines (`check_num_lit_state.vl` +37, `check_operators.vl` +5); `emit_mono.vl`
functions unchanged at 908.
