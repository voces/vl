## Infrastructure (Track F)

- **Oracle: a radix tree arm beside a typed integer arm runs at that arm's width.** The independent oracle evaluated `if c { 0xFFFFFFFF << 26 } else { v2 }` at its `i64` destination; ruling 4.3 has the join decide the arm's context first, so it is the `i32` pattern, widened after. The disagreement the arithmetic fuzz reported as `ar_s11_0099` is the oracle's, and two pinned regressions hold the reading.
