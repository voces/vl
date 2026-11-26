# IR: a function default over a map read is built at the read's closure (lane COV-CLOS, 2026-11-26)

`(m["j"] ?? dbl)(3)`, where the map holds an un-annotated function and the default names another, is
the join's function: mono instances the default at the join's function type, as it does an `if` arm
(D15463). The IR built the default as its own expression (`inlineDefault`), at the closure rep of
the default's own type, and missed `map read default rep` against the read's closure rep; no
conversion joins two closure reps (`convertKindOf` -1). A default that is a function value at
another closure rep (`defaultCloAtJoin`) is now built by `cloValue` at the read's rep and type, as
`retCloAt` builds a returned function at the result's; the function it makes is the one legacy
picks at that node.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base at master
`50529100c`, head on it): `map read default rep` 7 → 2, every function default claimed. The two left
are record defaults (`records/built-record-join-binding-read.vl` and
`records/built-record-stored-into-nullable-field.vl`, `put`), another mechanism. Claimed functions
98,194 → 98,196, unclaimed 292 → 287, claimed starts 8,489 → 8,492, claims fallen back 11 → 11; 0
claimed functions or starts lost, no other class moved.

`VL_IR_REQUIRE_CLAIM=1 vl run` on `coalesce-default-hole-function-over-map-read.vl`,
`generic-map-filled-through-param-overwritten.vl` and the D15463 and D15523 witnesses: head runs
every body claimed and prints their logs.

Q58 position sweep (`tests/cases/closures/map-read-function-default-positions.vl`: called at once,
parenthesised, bound, passed to an annotated parameter, returned then bound, inside a function, in
a loop, at an f64 call, a generic default): base misses `map read default rep` in `pick`, `inner`
and the start, head none; output identical on both seeds. A call straight off `pick("j")` is refused
by legacy on both seeds (filed as D17669) and left out.
