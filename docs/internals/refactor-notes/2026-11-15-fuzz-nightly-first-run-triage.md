# The first fuzz-nightly run on GitHub, triaged, 2026-11-15

Lane B. Run 43686086648 was a `workflow_dispatch` of `fuzz-nightly.yml` on master `6015bf3ed`, made
because the first scheduled slot (04:17 UTC) did not fire.

## The job works end to end

- It built the seed and ran all five legs in 20 minutes.
- It uploaded the artifact (236 files).
- It went red with an actionable summary: each new cell is listed with the command that
  regenerates it and the command that compares it, and its case is in `oracle/keep_new/`.
- The four fuzz-vl legs had no unfiled unsound finding.
- The oracle leg reported:
  `oracle: 50000 cells, 47946 in subset (95.9%), AGREE 40140, COMPILED-BAD 7785, DISAGREE 21, SKIP 2054; 20 new disagreement(s)`.

## The 20 new cells

Every cell was re-run under the dry-run seed and oracle (master `bded2f56d`, 0 new disagreements
then) and under today's. In 16 cells the compiled output is the same as then, and the old oracle
skipped them: its subset grew from 93.7% to 95.9% with the oracle PRs since. All 20 involve radix
literals.

| cells | finding | where it goes |
| --- | --- | --- |
| 9: `ar_s10_0190`, `ar_s14_0106`, `ar_s36_0129`, `ar_s40_0048`, `ar_s48_0169`, `ar_s6_0075`, `ar_s9_0140`, `ar_s9_0188`, `ar_s9_0189` | the D2617 class: with every radix literal replaced by its 64-bit value, the oracle prints what the compiled program prints | `known.txt` (this PR) |
| `ar_s35_0009` | **D16471** (compiler): `>>` over a negated radix literal above `0x80000000` computes at 64 bits, so a `2 % v1` that must trap runs | row + `known.txt` (this PR) |
| `ar_s26_0112` | **D16472** (native host): `shortest_sci` prints 2⁻²⁴ with 17 digits | row + `known.txt` (this PR) |
| `ar_s7_0127` | oracle: `(255 >> v2) + max(i64…)` shifted at 32 bits; Q8 types the untyped `255` by its `i64` peer | lane O |
| `ar_s29_0063` | `0xFFFFFFFF >> v2` under an `i32` peer at an `i64` destination; the old oracle agreed with the compiler, the new one reads the destination | lane O |
| `ar_s25_0085`, `ar_s31_0104`, `ar_s32_0022`, `ar_s44_0020` | the compiler keeps a radix literal's 32-bit pattern where the oracle reads its value: `((-1) - 0xFFFFFFFF) as f64`, and `0xFFFFFFFF & …` beside an `i64` at an `i64` destination | the owner of rulings 4.1/4.2 |
| `ar_s30_0123`, `ar_s43_0072` | radix width, neither substitution alone explains it | the owner of rulings 4.1/4.2 |
| `ar_s41_0106` | does ruling 4.1's float context reach a radix literal through a join (`(if c { 2147483647 } else { 0xFFFFFFFF }) as f64 as! i32`)? The oracle traps; the compiler reads `-1` | a spec question |

With this PR, 11 of the 20 are filed or known. Tonight's run stays red on the other 9 until lane O
and the ruling's owner decide them.
