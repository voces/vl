# The fresh-call copy widens a number into a wider nullable, 2026-11-11

Lane w320, stacked on #7213. One gate widened.

**The gap.** The copy gate (`recCopyBoxesOnly`) admitted a scalar only into its own nullable or a
union listing it. A delivery at `K = { f: i64 | null }` of a maker returning `{ f: 4 }` had no copy,
and the width copy (`recCopyConverts`) refuses a nullable field, so it was refused (D15715).

**The change.** `recNumWidens` (check_fit_rules.vl) admits an exact widening into a nullable:
`i32` into `i64` or `f64`, `i64` or `f32` into `f64`. `rcWidenTo` and `rcWrapKind` (wasmEmit.vl)
convert the field (`njConvert`) and box it under the wider tag.

**Graded.** `scripts/capability-probes/matrix/kept-maker-delivery-width.matrix.vl` is the main
template with the kept field `i64 | null`. With #7213's seed it runs 1 of 126 cells, the other 3
being owed refusals; now 120 of 123, plus 3 owed. The other three are a binding of the call read
at its own type. They emit-refuse the same way before and after, and on master, filed as D15716.
D15715 closes, and its fixture now runs.

D15265's flat leg is the same delivery and closes with it. Its nested leg, a nullable record field,
is filed as D15717; it fails without the delivery too. Distilled regress moves
`d15247_f64_null_flat` from reject to runs, and its manifest want now holds the printed value.
`recAdoptNote`'s doc comment, which #7200 left above `recCopyBoxesOnly`, is back on its function.
