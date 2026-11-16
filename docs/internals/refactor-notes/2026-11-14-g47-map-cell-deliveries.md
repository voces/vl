# D15940: a map binding delivered to an annotated holder instances its stored functions there, 2026-11-14

Lane G, on top of the containment in #8018.

`m4` holds the un-annotated `half` and is pushed onto `xs: ({[string]: (a: i32) => f64})[]`, while
`half` is also needed at `(f64) => f64` through another holder. The elaboration's slot fact for `m4`
came out at `(f64) => f64`. `elabHeldFnTy` closes a stored function at "the one closed signature
every function is instanced at", and nothing had demanded an instance at the push's `(i32) => f64`,
so only the `ws` instance existed. Mono pinned `m4` from the push at `(i32) => f64`, and
`monoPinMapValues` refused on the disagreement.

## Change (`emit_elab`)

- **`elabMapCellDeliveries`** runs in `elabCellPeers`, beside `elabCellDeliveries` and before
  `elabSettle`. For each `recv.push(m)` or `recv.set(k, m)` whose receiver type is closed and whose
  element or value is a map of a closed function type, with `m` an un-annotated map binding, it
  enqueues each un-annotated function `m` stores (`cwSlotWrittenValues`) at that function type's
  parameters (`elabEnqueueAtParams`).
- It uses the same demand path an annotated holder's functions take (`elabCellDeliveries`), in the
  same phase. Mono discovers no instance (step 2). `elabHeldFnTy` is unchanged: with the second
  instance it declines, and mono pins `m4` from its delivery.

An earlier attempt let the delivery override `elabHeldFnTy`'s answer without demanding the instance.
`half`'s body then kept its other instance's types, and the module failed to validate (clause 1).
It was reverted before any commit.

## Grading

- The D15940 witness prints `3`.
- `pinned-map-of-hole-fn-read-through-a-holder.matrix.vl` (two signatures), graded against #8018's
  seed: `array_push` (both faces) and `map_set` (annotated), the cells the row names, moved from
  the `monoPinMapValues` refusal to runs. That is 76 of 78, with 0 runs→not-runs and 0 silent.
  `map_set` (un-annotated) reaches the function only through an un-annotated outer map, which is
  D16121.
- `pinned-map-of-hole-fn-one-signature.matrix.vl` (one signature) is unchanged: 0 runs→not-runs and
  0 traps. Its one SILENT cell is D16124, pre-existing and lane B's.
- `map-of-maps-of-hole-fns.matrix.vl` holds at 57 of 58, and
  `map-of-hole-fns-pushed-onto-map-list.matrix.vl` at 51 of 58.
- Late demands stay at 8: the demand lands in the elaboration's own phase.
