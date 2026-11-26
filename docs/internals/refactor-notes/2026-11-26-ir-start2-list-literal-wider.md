# START-2: a list literal at a wider number list (2026-11-26)

COV-CALL routed `functions/hole-leaf-literal-through-forwarder.vl` `outerE` here. It read
`convert list -> nullable`: `[v]`, with `v` pinned at `i32`, handed through a hole forwarder to a
`f64[] | null` parameter. This is the literal built at its own element rep, not a conversion
`irConvert` should make; it is the list sibling of `widen instLit` (#10303).

`deliver` gains one arm. In a pinned instance, a list literal whose own list holds a narrower
number than the destination's list (or that list's nullable) is built at the destination's list,
each element widened there (`arrayLit` at that rep), then widened to the nullable. The program is
fully claimed. `ir-parity --behaviour-only` is byte-identical on it and on the sweep. On master,
only the sweep's nullable position misses; the plain-list positions were already claimed and are
pinned by the sweep.
