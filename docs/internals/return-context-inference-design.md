# Return-context inference for un-annotated params (design, not implemented)

Status: **DESIGN ONLY.** Recorded 2026-07-24 from a user report. Nothing here ships yet;
the soundness half is tracked separately (see "What is already handled" below).

## The aspiration

VL infers aggressively. Today, inference for an un-annotated parameter flows only
*forward* — from the body's usage of the param to a demanded shape, and from the call's
argument to the monomorphized instance. It does not flow *backward* from the call's
**result context** into the param.

```vl
function foobar(v) {
  if v is { foo: string } then return v.foo
  return v.bar
}
function printString(thing: string) { print(thing) }

printString(foobar({ bar: [] }))
```

What we want: `printString` requires a `string`, so `foobar`'s return in this
instantiation must be `string`; the complement return is `v.bar`, so `v.bar` must be
`string`; therefore `{ bar: [] }` is a **type error at the argument** — `[]` is not a
string. The diagnostic should point at `{ bar: [] }` and say so.

What happens today: the argument's type pins the instance first, the return follows from
it, and the mismatch (or the un-monomorphizable argument) surfaces later and with a worse
message.

## Why this is more than "add a rule"

The param is a `TyVar` hole with a demanded shape (`holeShapeNames`/`holeShapeTys`) plus,
since #1073, a set of `is`-guard alternatives (`holeAlt*`). A return-context constraint has
to flow into **whichever arm the argument selects**, and the arms are only distinguishable
once the argument is known — so the constraint is per-instantiation, not a property of the
declaration. Concretely it needs:

1. A **result-context** parameter threaded into call checking (the expected type at the call
   site), which today is not passed down to argument checking.
2. Propagation from that expected return into the hole's **derived** field holes
   (`?fld.<prop>.<hole>`), which `substHoleByName` can already resolve in the forward
   direction — the reverse edge is the missing piece.
3. A rule for **joins**: with an `is` guard the return is a join across arms. A `string`
   expectation must constrain the arms the argument can actually take, not every arm.
4. Interaction with the **capability-bound** design for un-annotated params (see the
   `vl-unannotated-param-capability-constraints` notes): constraints are bounds, not
   concrete pins, so a backward constraint must narrow a bound rather than fix a type.

Item 3 is the one that makes this a real feature rather than a patch: without it, backward
propagation from a multi-arm return either over-constrains (rejecting valid calls) or
under-constrains (achieving nothing).

## What is already handled

- **Forward** hole-field resolution at a call already works and gives a good message when
  the return is a single field read: `function getbar(v) { return v.bar }` with
  `printString(getbar({ bar: 42 }))` reports `argument 1: expected string, got i32`.
- The **`is`-guard join** breaks that resolution, and the result is a soundness hole
  (invalid wasm, no diagnostic). That is a bug, not a missing feature, and is tracked
  independently of this design.

## A note on `print`

`print` is not a function taking `any`. It is a compiler builtin (there is no module or
import system yet), special-cased in `checkCallNode`: each argument is type-checked, and a
**boxed value union** is rejected because `print` renders one scalar/string rep at runtime
and a union has no fixed rep. So it accepts "any single-rep printable value", not `any`.
`print(foobar({ bar: 42 }))` printing `42` is the monomorphized instance returning i32 and
`print` dispatching on that concrete rep — not evidence of a genuine top type.
