# D15743: a generic maker's record widens its written function field, 2026-11-11

Clause-2 close, from w315's emit-reject group C. Base is #7267's head.

`const r = mk(1)` with `mk<T>(x: T)` returning `{ f: id1, x: x }`, then `r.f = id0`, refused at
one call type and at two. D15270's arm seeds a call-bound binding with the call's returned
values only for a function declaring no type parameter (`holeSlotCallRets`). The arm now asks
`holeSlotCallRetRecs` (check_relate_core.vl): the deep reading first, then a generic named
maker's returned values when each is a record literal, whose function fields name the same
functions in every instance. Two instances of the maker, each written, run and keep their own `x`.

Not reached: the maker returning a `const` that holds the literal (D15745).

**Sweep** (`scripts/sweep.vl`, #7267's seed against the fixpoint candidate, 23,918 programs):
23,915 same, 0 bytes-only, 2 output movers (D15743's witness and the distilled cell
`d15270_generic_mk`, emit reject → runs), 0 runs → not-runs, 0 new traps.
