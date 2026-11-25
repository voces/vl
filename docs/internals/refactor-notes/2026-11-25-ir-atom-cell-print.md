# An atom-assignment global read by a delivery (2026-11-25, lane COV-START)

COV-CALL found 10 `print operand rep` rows caused by this lane's atom-assignment global mechanism
(#10118). The global `c` of `const c = (k = "ww")` holds an atom id, an i32. `print(c)`'s arm
streams that id, but the global read decoded it to a string first.

## The mechanism

A delivery's read (`exprAt` with `cell` set) now takes the atom cell's id as it stands. A read
asked at `string` still decodes it, as legacy's `emitAtomToStr` does.

## Measured, master 7ddd7d14 → head

Census probe (`$VL_IR_SHADOW=5`), same program lists on both sides. A tests/cases program a batch
dropped is rerun alone.

| reading | master | head |
|---|---:|---:|
| functions claimed, tests/cases | 89,293 | 89,297 |
| functions claimed, witnesses | 22,421 | 22,422 |
| start bodies claimed, tests/cases | 7,860 | 7,861 |
| start bodies claimed, witnesses | 5,053 | 5,054 |
| functions newly unclaimed, any population | | 0 |
| armed shadow mismatch, fail and fallback rows | 23 | 23, the same rows |

`assignment-value-into-literal-union-place` moves on to `compare of a joined const atom`.

## Left in `print operand rep`, other shapes

- An atom field read off an un-narrowed union of records sharing the field (D17072,
  `discriminated-union-tag-read`) is read at a string where the print streams the atom.
- A string print of an atom read (D1461, the `litunion-mixed-arm-with-base-partner` probe).
