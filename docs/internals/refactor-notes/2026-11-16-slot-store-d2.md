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

Against master `ee6e3a4d6`, 4 of the `tests/cases` programs (module entries included) build other
wasm; every one prints the same output.

- `closures/captured-cell-shared-writer-hole-lambda-alias`, 1363 to 1373 bytes, one function more:
  the classes follow the closure's write `k = h` into the captured cell, so `h`'s parameter is
  pinned at `boolean` in that instance; the walk answered open (ruled a graded mover; the fixture's
  `@log` lines pin its output).
- Three build a strictly smaller set of lambda instances (named functions a subset of master's):
  `generics/generic-value-slot-written-in-generic-body-at-two-instances` (13 lambdas to 8, 35
  functions to 27), `generics/call-through-generic-value-owns-only-its-constraints` (4 to 3) and
  `functions/maker-lambda-set-into-map-at-f64-result` (2 to 1).
- `tests/vl_fn_ret_shadow_test.ts`'s `COL_CALLEE` program builds one lambda fewer: master's
  `__lambda_0` is an `unreachable` stub beside `__lambda_2` holding `x + x`; this branch builds one
  `__lambda_0` with the body (output `2 s 2 s 14 8` on both). The test's expected rows drop
  `__lambda_2`.

## Closed

- [D16852](../inventory/D16852.md): two maker calls at two pins, one called directly and one handed
  to an un-annotated parameter, refused at emit on master, run (`5` `2.75`); fixture
  `functions/maker-calls-at-two-pins-one-called-one-handed-on.vl`. The ingredient is not isolated:
  disabling the maker-returned rule in `elabLamParamTyAt` leaves it running.

## Readings

READINGS
