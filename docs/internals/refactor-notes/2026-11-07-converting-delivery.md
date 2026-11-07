# The converting delivery, as a reach-row fact (2026-11-07)

Step 5, PR 1 of the converting-delivery lane. `monoArgClosedTyIn` (emit_mono) was blocked on a rep
fact ([2026-11-07-blocked-three-vs-identity.md](2026-11-07-blocked-three-vs-identity.md)): its pin
is the argument's own type except where the call builds the argument at the instance parameter's
type. The reach rows ([2026-11-06-per-call-delivered-rep.md](2026-11-06-per-call-delivered-rep.md))
held a bundle's record, a wider record and a built record, but not that.

## What is recorded

`erArgConv` (emit_elab), beside each reach-row slot, by parameter: the instance parameter's type
where a list or record literal argument is built at it and not at its own type. Two shapes are
built there:
- a literal the checker left open (a hole leaf): D5930's `[v]` at the callee's `f64[]`;
- a literal holding records, built at a wider record (`[{ r: null }]` at `Circle[]`).

A closed literal of other values (`[2, 3]` at `i64[]`) converts at the delivery and records nothing.
A nullable parameter takes the literal built at it only where the declaration writes the parameter
as a bare type variable. `elabArgDeliveredTy(a, from)` answers the argument's delivered type: the
built record (`erArgBuilt`), else `erArgConv`, else the slot's wider-record rep, except at a callee
with a bounded type parameter, where the rep is the bound's and the argument keeps its record
(`soundness/covariant-record-field-read-only-runs.vl`). -1 is delivered at its own type.

Two index facts the shadow needed. A method call's receiver is its instance's first parameter
(`self`). And a rewrite that puts the receiver into the call's arguments (`expect(x).toEqual(y)`)
leaves the write index's argument position stale by one. `elabArgParamOf` reads the argument's
place in the call as it is now. `erArgBuilt` is still placed by the write index's position, and
`elabArgDeliveredTy` reads it there.

`tests/vl_elab_arg_rep_test.ts` holds the new kind. `elabArgConvProbe` counts the slots and grades
each against the instance parameter. D5930's flat witness records one. D2459's join (`i32` handed
to `T := f64`), a closed `i64[]` literal list and a plain call record none.

## Shadow against `monoArgClosedTyIn`

Counter rows from a one-level probe seed, at every decision where the pin is closed, over the sweep
population (23,611 programs, `vl check --batch --codegen`): **30,059 decisions in 5,450 programs**.
The brief's 30,088 / 5,485 is the same count on an older master.

| rule: fact, else the identity type (`elabIdentityFnTy`) | decisions |
|---|---|
| identity agrees, no fact | 29,591 |
| fact agrees (identity agrees too) | 34 |
| fact agrees, identity differs | 304 |
| **fact differs from the pin** | **0** |
| no fact, identity a type variable | 94 |
| no fact, identity holds a hole (`_ \| null`) | 16 |
| no fact, no identity | 14 |
| no fact, a number literal whose identity is the join (`f64`) while the pin is its own `i32` | 6 |

The 130 rows with no fact are named fallbacks for the switch. A number literal is delivered at its
own type (6,881 number-literal decisions, all the pin's). The other 124 have an identity that is
not closed, and there the pin stays. Of the 304, 240 are built records (`erArgBuilt`). The other
64 are literals built at the parameter or wider-record reps.

## Proof

A fixpoint seed (`refresh-compiler.sh` twice, byte-identical): 6,476,507 bytes, +2,744 (+0.04%)
against master `3b50b888`'s fixpoint. Sweep against that fixpoint: 23,613 same, 0 bytes-only,
0 output movers, 0 `runs → not-runs`.
