# 2026-11-14 — a closure signature's result list mints its row before the key (D16317)

`collectTyReachCloSigs` keys each reachable function type's `$fnsig` off its result's rep. A
result list of closures or records is a `reflist`, whose token needs its row; rows are minted
on a node's first read (`nodeMintOnRead`), and an annotation nothing has read yet had none, so
the key was empty, no `$fnsig` was interned, and the call fell to the all-`i32` arity functype.
The walk already forced a result map's slot; it now forces a result list's row too
(`forceCloResultListTypes`, the existing list dual).

Graded: the witness and 7 neighbours (`| f64`, `.length`, a parameter, a nested list, a nullable
result, parameters, a record list) all check-clean invalid wasm on master and run. Distilled
corpus 0 runs → not-runs; witnesses 5039 as filed; probes 238/240, unchanged. Seed +6 bytes.

## A nullable literal-union-result closure is a map value (D16315)

`mvValKindOfTy` answered `MVK_UNSUPPORTED` for a `nulclosure` whose result is a literal union,
so a map built with that value type was refused at emit ("unsupported map value type"), and one
arriving through a narrowed union parameter, never built, read a value vector minted at the mono
`i32` shape: check-clean invalid wasm. The carve-out had no recorded reason; the closure's
`$fnsig` keys its literal-union result as `i` like any atom, and the value stores as every other
nullable closure does. Lifted. Graded: the witness (invalid wasm) and seven spellings that were
loud emit rejects (a built map, delete and reassign to `null`, a record field, a list element, an
int key read by iteration, a closure with a parameter, a parameter carrying a built map) run with
the right values. Distilled 0 runs → not-runs; witnesses 5039 as filed; probes unchanged.
