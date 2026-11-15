# Slot store, stage 2b part 2b(i): a slot's whole signature reads the classes, with its first mono consumer (lane S, 2026-11-15)

Part 2a ([`2026-11-15-slot-store-stage-2b-part2-api.md`](2026-11-15-slot-store-stage-2b-part2-api.md))
landed `eplSlotBound`. This PR completes the reader API. The coordinator's ruling (b) is that the
API lands with its first consumer, so the API ships here together with lane M's one-function
switch of `monoSlotDeliveryTy`.

## What changed

- **`eplSlotOneCall(holder, path, k, tys)`**: the one call through the slot or a copy of it, with
  its arguments' types at the call's instance pushed onto `tys`. -1 for none or two, and -1 when a
  class downstream of the slot comes from an annotated holder: a written type stops the delivery.
- **`eplSlotCallsAt(holder, path, k, ps)`**: whether every call through the slot or a copy whose
  arguments are all closed is made at `ps`, each argument widened from its literal.
- **`eplSlotSig(holder, path, k, omit)`**: the slot's whole delivered function type. That is its
  bound; failing that, the one signature its calls agree on (calls in `omit` left out), built at
  its members' instances.
  - It returns -1 when the slot is uncalled, -3 for an open argument, -4 for two signatures, and
    -5 when the calls agree but the members have no closed type there.
  - A slot in an instanced function, read for the program, answers where every instance agrees.
- **Consumers:**
  - `elabHoleGenFlowTy` reads the classes (the bound when every closed call agrees with it, else
    the one call). `elabSlotOnlyCall`, which only it called, is deleted.
  - `monoSlotDeliveryTy` (`emit_mono.vl`) reads `eplSlotSig` in place of the delivery walk. No
    function is added, so `emit_mono` stays at 908.
- **Engine rules the switch needed.** Each was found by a `tests/cases` program that broke, and each
  holds for every reader:
  - A function with a written return type bounds its result.
  - A list copy (`slice`, `filter`, `reverse`, `concat`, a spread) is a list of its own, which its
    source's elements flow into.
  - A named function handed as a callback is keyed by its read's instance, as a lambda is.
  - A receiver that an instance types its own way steps by that type.
  - A holder that an instance cloned answers through its source.
  - The classes are built before mono rewrites the program.
- **Rules only `eplSlotSig`'s own-calls reading applies** (`EPL.ownOnly`):
  - A captured binding keeps its written place; only its cell type is unwrapped.
  - A nested member answers by its instance under the frame at any path. Read at the program, it
    answers by the instances that agree.
  - A hole-typed slot (a list of an open parameter) takes its members' signature.
  - A call made under a sibling instance of the slot's frame is not the slot's.
  - A call through a different fresh `const` holder that the slot's class unified with (two
    `Map()`s handed to one parameter) is not the slot's either. The holder is recorded per call
    when the classes are drawn, because mono rewrites the callee later.
- **Net:** ¶NET

## Parity with the walk

Lane M's probe: the walk and `eplSlotSig` both answer at every `monoSlotDeliveryTy` call while
`tests/cases` builds, and the probe compares the two answers. ¶PROBE The 18 `tests/cases` programs
that the first switch broke all run and print their `@log` lines. Three answers still differ;
every one of those programs runs:

| program | slot | walk | `eplSlotSig` | why |
|---|---|---|---|---|
| `closures/generic-list-literal-of-generic-read-out-of-list-to-generic` | `xs` elements, program | `(i32) => i32` | -5 | one call agrees, but its members have no closed type there; not yet narrowed |
| `closures/hole-fn-inline-list-to-param-bound-annotated` | `g` elements, program | `(i32) => i32` | -1 | the slot's class reaches no other class (`eplReach` holds it alone), so the annotated `k` inside `bound` never bounds it; not yet narrowed |
| `closures/hole-fn-list-map-callback-generic-call-loop-alias` | `v` elements, program | none | `(i32) => i32` | the classes see the call through `v.map(ap)`; the walk does not |

In the first two rows `monoSlotDeliveryTy` answers -1, as it does for an undelivered slot. In the
third it pins the signature the program's calls are made at. Part 2b, which deletes the walk, has to bring
the first two to the walk's answer.

## Readings

¶READINGS

## Next: part 2b

Part 2b moves the remaining elaboration readers of `elabSlotDeliveries` and its family onto the
classes, and then deletes the walk (an expected 1,000 to 1,300 lines). Lane M switches its other
mono readers once the API covers them.
