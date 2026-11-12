# The fresh-call copy boxes a scalar into a union listing it, 2026-11-11

Lane w320, stacked on #7200 (the fresh-call copy). One gate widened.

**The gap.** #7200 offers a maker's call a converting copy where its destination stores a field
differently, gated by `recCopyBoxesOnly`: each field as stored, or a scalar boxed into its own
nullable. A field `i32 | string` holds an `i32` in the same union box, but the gate refused it, so
a delivery at `K = { f: i32 | string }` still kept the maker at `K` and refused its calls at its
own type (D15714).

**The change.** `recCopyBoxesOnly` (check_fit_rules.vl) also admits a scalar into a union listing
it (`recUnionHasMember`). `rcWrapKind` (wasmEmit.vl) boxes it under the scalar's tag, as it does
into the nullable.

**Graded.** `scripts/capability-probes/matrix/kept-maker-delivery-union.matrix.vl` is the main
template with the kept row's field `i32 | string`. With #7200's seed it runs 3 of 126 cells, the
other 3 being owed refusals. Now it runs 123 of 123, plus 3 owed. The main template stays 123 of
123 plus 3 owed. D15714 closes. Two fixtures that pinned the refusal now run. Distilled regress
moves no cell beyond #7200's movements.

The width pair (`i32` into `i64 | null`, D15715) is not in this change: the copy would convert
before boxing, and its own template refuses at the kept delivery itself.
