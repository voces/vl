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
