# A radix literal in a float context is the value its digits spell (ruling 4.1, 2026-11-15)

The owner's revised ruling 4.1 applies to every float context: an `f32` or `f64` destination,
a float peer, and `as f32` / `as f64`. There, a radix literal is the unsigned value its digits
spell, rounded to the float, so `0xFFFFFFFF as f32` is 4294967296. Integer contexts keep
T2.3's bit-pattern rule. Spec T2.3 now says so, and `scripts/oracle/interp.ts` models it
(`radixFloat`). The oracle used to decline every radix constant in a float context.

A constant **tree** at a float, such as `(0xFFFFFFFF + 1) as f64`, still declines. Ruling 4.2
gives it 64-bit arithmetic, which lane N is implementing in the compiler. A `lone` mark on a
radix literal, which any operator drops, keeps trees out of the new rule.

`scripts/oracle/radix-float-grid.ts` writes the acceptance grid: 26 literals × 7 positions,
with a `.want` file per cell. On today's compiler:

| | cells |
| --- | --- |
| print the rule's value | 138 |
| print the pattern's value instead (`as f32`: 10, `as f64`: 3) | 13 |
| refused by the checker ("i32 doesn't fit in f32", "operator '+' mixes f64 and i64", …) | 31 |

The 44 cells in the last two rows are lane N's, together with D16390. The table is
measured, not judged: `diff` grades a checker refusal as AGREE when no expectation is given,
so the refused cells were counted from the `.err` files.

The oracle against today's compiler:
- distilled corpus: unchanged, 12,037 cells, 96.0% in the subset, 0 new disagreements;
- `fuzz.sh --gen arith --seeds 8` (1600 programs): the subset grows from 1082 to 1096.

Two fuzz cells, `ar_s1_0141` and `ar_s7_0150`, both `0xFFFFFFFF as f32`, are listed in
`known.txt` until lane N's change lands.
