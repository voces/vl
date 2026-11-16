# Slot store part D2: the walk's last readers move to the place classes (lane SLOT, 2026-11-16)

Row [D16768](../inventory/D16768.md). After the flip (#8731), four readers still asked the delivery
walk. With this change nothing calls it, and part E deletes it.

## Readers moved

- `elabValueReturnsFrom`: whether a value reaches a function's return is the forward reach from its
  place (a named function's, from each place it is read) to the function's return place in any
  instance.
- `elabValueOnlyCall`: the one call through a value's class.
- `elabLamDeliveredParams` and `elabLamParamTy`: a lambda's parameter types from the calls through
  its class (`eplSlotCallTysInto`, the call half of `eplSlotDeliveredTys`).

## Engine rules

- A name read keeps the declaration it resolved to when the classes were built (`eplDeclAt`): mono
  renames a read in place (`take5(d5)` to `take5(app5)`), and the renamed read placed itself as a
  fresh read of the function.
- A lambda asked at its own instance reads no calls from its frame.
- A slot read at an instance enclosing its frame reads the frame's instances nested in that one.
- A call with no key-row entry for an instance runs the instance at its argument types.

## Movers (output identical)

- `closures/captured-cell-shared-writer-hole-lambda-alias`, +10 bytes: the classes follow the
  closure's write `k = h` into the captured cell, so `h`'s parameter is pinned at `boolean` in that
  instance; the walk answered open (ruled a graded mover; the fixture's `@log` lines pin its output).
- `closures/maker-lambda-delivered-inside-instanced-body`, −10 bytes: one lambda instance fewer
  (master builds two identical `(i32) => f64` instances; this branch calls one from both sites).

## Readings

READINGS
