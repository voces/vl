# A `const` read beside a radix literal is typed by its value (T2.4), 2026-11-15

Lane O, the follow-up to #8291. The coordinator settled #8291's open question by T2.4: a read of a
literal `const` is its value written in place, so an `i64`-spelled decimal tree whose value fits
`i32` is an `i32` const, and a radix literal beside it reads at `i32`.

| program | compiler before | oracle before | both now |
| --- | --- | --- | --- |
| `const x = 9223372036854775807 / (-9000000003); 0xFFFFFFFF & x` | `-1024819114` | `3270148182` | `-1024819114` |
| `const x = 3000000000; 0xFFFFFFFF & x` | `-1294967296` | `3000000000` | `3000000000` |
| `const P = 0x7FFFFFFF << 2; const w: i64 = P` (D14990's witness) | `8589934588` | `-4` | `8589934588` |

- **Oracle.** A decimal `const`'s read takes its value's width (`constRead`). A radix-tree `const`
  keeps its initializer, and each read computes it at that read's own width, as D14990 rules.
- **Compiler.** D16492's check also treats a literal `const` read whose value is outside `i32` as
  the `i64` context. #8291 checked only spellings, so the second row still wrapped.

Graded on the merged tree:
- the 8 nightly cells: AGREE 8;
- 65 hand reductions plus 6 new: only `as f32` of a radix tree differs, which is outside the oracle's subset;
- 2,400 arith fuzz cells: no compiled output changes, and the same 3 verdict moves against master's oracle as #8291;
- the distilled corpus is identical, and `regress.vl` shows no class change.

The compiler adds 5 lines.
