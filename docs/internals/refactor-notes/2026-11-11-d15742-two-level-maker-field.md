# D15742: a two-level maker's record widens its written function field, 2026-11-11

Clause-2 close, from w315's emit-reject group C. Base is #7263's head.

`const r = mk2()`, where `mk2` returns `mk()` and `mk` returns `{ f: id1 }`, then `r.f = id0` and
`r.f` called at two types. D15270's arm (`check_statements.vl`) seeds a binding a call
initialises with the values the call returns, so `letCallFieldsWiden` widens the function field
to the set written into it. It read one level (`holeSlotCallRets`), so through `mk2` it saw a
call, not a record, and the field stayed a closure of `id1` at one signature. It now reads
through returned calls (`holeSlotCallRetsDeep`, up to 8 deep, already used by the slot judge).

**Sweep** (`scripts/sweep.vl`, #7263's seed against the fixpoint candidate, 23,917 programs):
23,915 same, 0 bytes-only, 2 output movers (D15742's witness and the distilled cell
`d15270_two_level`, emit reject → runs), 0 runs → not-runs, 0 new traps.

**Proof run locally.** The fixture (two and three maker levels), the corpus oracle
(`cases_wasm_0..3`), `check-filed-witnesses --strict`, distilled `regress.vl`, lint-self, seed
size, late demands, the inventory tests.
