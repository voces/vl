# IR: an assignment value's re-read atom decoded at a string destination (2026-11-22, lane IR-D1)

#9575 typed a capture cell's untyped `c[0]`, which exposed `assignment value re-read rep`. On
tests/cases the class went from 5 to 14 functions, in 7 files. A probe split it by the rep of the
target's re-read against the rep the assignment is asked at:

| re-read | asked | functions |
| --- | --- | --- |
| atom | str | 3 |
| closure | a different closure | 3 |
| nullable | str | 1 |

## The change

- In `assignValue`, where the existing `atomAtStr(re-read rep, asked rep)` holds, the re-read goes
  through the existing `widenTo`. Its atom arm is `atomToStr`, legacy's `emitAtomToStr`. That is
  the widening the witness's own comment names (D2168): "the closure's value is that atom, widened
  where its checked type is string".
- The closure and nullable shapes stay named misses.
- New test case `closures/captured-litunion-cell-assignment-value-as-string.vl`: the value bound
  to a `string`, concatenated, and passed to a string parameter.

The measurements are in the PR body.
