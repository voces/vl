# A container no write fixes runs at the unbound default (2026-11-08)

Owner ruling: a `Map()`, `Set()` or `[]` whose element, key or value type no write ever fixes
holds no value at runtime, so `length`, `has`, iteration and an always-null `get` mean the same
at any type. Such programs now run instead of refusing with `cannot infer a type`.

## What changed

* `flushUninferred` (binding, record field, list element, nested) and `flushOpenArgMaps` (an
  inline argument, a lambda's result) default every open hole the value holds instead of
  refusing. The default is `unboundDefaultTy()` (`check_decl_scan.vl`), which
  `elabUnboundTpTy`'s fallback and `ELAB_TP_DEFAULT` now share: one producer (D4551).
* An open map's KEY defaults to the type its first read looked up (`m.has("a")`, `m["k"]`),
  so a string-keyed read does not land on an `i32` key. An unsupported read key (`f64`) is
  refused at the read, as the write's `checkInferredMapKey` already did.
* A container whose element or value something READ (`xs[i]`, `m[k]`, `m.get`, a list method
  other than `push`/`unshift`) keeps the refusal: a read can demand a shape (`xs[0].r`,
  `xs[0] + 1`), and the default would then be wrong. D1462's witness stays a check reject.
* At an inner scope the default waits for the program's end, so a later delivery (an inferred
  return handed to a typed parameter) still fixes the type first.
* New checker-side lint row `container-element-type-unfixed` (`warning`, the `rcoal` channel
  that `deep-record-compare` uses): `the element type of 'r.f' is never fixed by any write…`.

## Refusal sites

| site | before | after |
| --- | --- | --- |
| `flushUninferred`, top-level hole | `cannot infer a type for 'x'` | default + warning, unless read |
| `flushUninferred`, `recOpenHolePath` (was maps only, now lists too) | `cannot infer a type for 'x.f'` | default + warning, unless read |
| `flushOpenArgMaps`, inline argument | `cannot infer a type for this argument` | default + warning, unless read |

Untouched: un-annotated parameter refusals (`check_calls`, `check_fn_decl`) and
`refuseEmptyListCalledArg` (the callee calls the element: a function type, not a container).

## Measured

Sweep, base master `d1c114dc` vs candidate, both fixpoint seeds: see the PR body for the final
table. Movers are check reject → runs (D1584, D3743, D14973, corpus cells a000681, b000977,
the renamed fixtures); 0 runs → not-runs, 0 new compiler traps.

## Parked

* `for x in <open container> { use(x) }` refuses with `undeclared identifier 'x'`: the loop
  variable is declared before any flush, with the element still `-1`. An unused loop variable
  runs. Needs the loop variable bound to the element hole, which a later write could pin.
* `m.get(k)` on an open map still refuses (it counts as a read); grading which reads demand no
  shape (`?? literal`, `== null`) would let it run.
