# Step 2: the call key binds parameters handed a generic function (2026-11-08)

Follows [the call key binding function-holding parameters](2026-11-08-call-key-fn-holding-params.md)
(#6782). That note left 2,197 builds declined as `unkeyed-open`: a parameter type at the key still
carried a type variable.

## What the open builds were

A generic function handed as a value: `pick(id, dup, false)`, `viaOrz(orz, orz)`, `take(id)`. The
parameter's type at the key is the generic's own signature, `(T) => T`. Its type variables are the
generic's, not the caller's, so nothing is left to close. `tyHasTyVar` and `tyReachesHole` can't
tell the two apart, and the key declined.

Taking that type as the binding was tried first (all 2,197). It cost 4 `runs → not-runs` and 1 new
compiler trap: `listed-hole-fn-escaping-list`, `hole-call-of-generic-at-its-own-instance`,
`captured-hole-fn-handed-on-by-nested-fn` and D15010. A temporary shadow probe printed mono's binding
next to the key's for each one. Where the body calls the generic at one type, mono binds the hole at
the PIN, the generic instanced there (`(i32) => i32`, `(f64, f64) => f64`). It binds the generic's
own type only where the pin itself stays open (the body calls it at two types). `elabHeldValTy` on
the argument was ruled out: it closes `viaOrz(orz)`, which mono keeps open.

So `elabCallKeyBinding` now binds:

- A parameter whose type at the key is a function type passes the closed check.
- A parameter declared as bare `T` or a hole whose pin is closed binds at that pin
  (`elabKeyGenericFnPin`, given mono's pin column). The key already reads the pins
  (`instKeyCanon`).
- A hole binds as a type parameter too only at a closed type, as `monoBindCols` does.

## The `ckey` classes, before and after

Population: the 23,634 programs of `scripts/sweep.vl -- list`, `vl build` under `$VL_ID_SHADOW=1`,
`scripts/id-shadow/run.sh --rows`, which gives each build its own stderr. Base master `e97619e8` and the
candidate, each at its fixpoint. Counts are instance builds.

| class | before | after |
|---|---|---|
| keyed (`call` + `value`) | 22,127 | **23,975** |
| declined, `open` | 2,197 | **349** |
| declined, `hole` | 5 | 5 |
| no key (`spelled` 545, `lam` 140) | 685 | 685 |
| `monoHoleBinding` binds at least one name | 2,316 | **629** |
| `monoBindSeededTyParams` (agree / differ) | 25 / 3 | 25 / 3 |
| instances minted | 25,174 | 25,174 |

The 349 left are a generic held inside a list or a record (`hole-fn-list-*`,
`generic-list-to-unannotated-param`). The parameter's type is not itself a function type there, and
the pin closes a leaf, not the parameter. 65 keyed builds read `differ-bind`, up from 6. They were
`open`/`differ-bind` before. The key spells the generic's own type, and the build is demanded at the pin.
Their bytes are unchanged.

## Proof

- Fixpoint seed: 6,513,213 bytes, against master's 6,512,640 (+573).
- `scripts/sweep.vl` diff, base vs candidate: 23,634 same, 0 bytes-only, 0 output movers,
  0 `runs → not-runs`, 0 new traps.
