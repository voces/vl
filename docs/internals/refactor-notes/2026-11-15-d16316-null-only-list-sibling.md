# 2026-11-15 — a list element's null is its built list's, whatever its own stamp says (D16316)

`nullOwnAt` read a `null` value's representation off the type the checker stamped on it, and fell
back to its owning list literal's element only when that stamp named no null of its own
(D16311). In `[{z: [null]}, {z: [[1]]}]` at `{z: (i64[] | null)[]}[]`, each record is checked
bottom-up and only the joined record is delivered back, so the first `[null]`'s null keeps a
`boolean | null` stamp while the literal itself is built at its destination's `(i64[] | null)[]`;
the element was the `i32` sentinel inside a ref array. A list element now always takes the null
of the list type its literal builds at (`listLitBuiltTy`: its own type, or its destinations'
agreed one when its own names only `null`), where that element admits null and is more than it.

Graded: `i64[]`, `i32[]`, `f64[]`, `string[]` nullable-list elements go from check-clean invalid
wasm to runs; `{w: i32}`, `string`, `i64`, `boolean`, a literal union and `i32 | string`, each
`| null`, and D16311's own case keep running. Distilled 0 runs → not-runs (its other movements,
d16363 and fz_a, are the same on a master fixpoint seed); witnesses 5044 as filed; probes
unchanged; seed +245 bytes against that master seed.

unfiled: D16316 (the row lands with #8112)
