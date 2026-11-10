# D15640 option 1: the record-field position matrix, measured, 2026-11-10

The ruling (DECISIONS.md, "A named function in a record field is a set id, as in a list") is
recorded. It is not built: more positions need work than the brief's bound of about 10, so this
note gives the count and stops. No compiler change ships.

**The instrument.** `scripts/capability-probes/matrix/record-field-named-function.matrix.vl`
is D15640's repro at every delivery position: `{ f: dbl }` is delivered, then handed to `call0`,
which calls `r.f(x)`, beside `both(dbl)` handing a hole function to `call0` at `f64`. A twin
with `[dbl]` and `r[0](x)` (the list spelling, which already holds a set id) calibrates it.

| master `1fc9a771` | runs | emit refuses | check refuses |
| --- | --- | --- | --- |
| record field, 48 graded cells | 3 | 44 | 1 |
| list element, same positions | 17 | 31 | 0 |

- **Annotated face.** All 24 positions refuse for the record and the list alike, except
  `array_push` for the record. An annotated `{ f: (i32) => i32 }` or `((i32) => i32)[]`
  destination makes the value a closure there, and `both`'s `f64` instance then has no call that
  fixes `dbl`. The list's parity with the ruling does not reach these, so they are outside
  option 1's first cut.
- **Un-annotated face.** The record trails the list at 17 positions: `binding`,
  `return_inferred`, `struct_field_init`, `array_element`, `global_init`, `map_value`, `map_set`,
  `closure_capture`, the six `block_*`, `fn_body`, `fn_body_capture` and `two_instances`. The
  record runs where the list does not at `argument` and `array_push`. `global_assign` is a check
  refusal for the record (`a {f: (_) => _} cannot be delivered as {f: (i32) => i32}`).

**Not one pin.** With `recAdPinLet` (check_rec_rows.vl) skipping a literal whose field names a
function, the matrix still runs 3 of 48, and 14 cells move from the emit refusal to the
checker's `the type of v is settled by what it is delivered to, through more re-checks than the
checker runs`. The adoption loop converges only through the pin. Option 1 needs the checker to
type the field as its set type from the start, so the literal has nothing to adopt. Then each of
the 17 positions needs the late decision to accept its holder (`ftHoldCtxOk`), as #7083 did for
a literal handed to a hole parameter.

**Re-graded on master and on #7087's seed:** D15639, D15640 and D15643 refuse as filed.
D15639 and D15643 wait on this.

**Filed while writing the matrix:** D15645. `both1(g) { return c1([g], 2.5) }` gives
`both1(dbl)` an open type: `vl check` accepts `const b: string = both1(dbl)`, and `b + 1` is
invalid wasm. A matrix proof that combines the two calls' results reaches it, so the template
prints each one.
