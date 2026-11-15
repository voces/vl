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
- **A class whose own holder is open takes its bounded parent's step.** A `Map()` unified with an
  annotated list's element took its source from the `Map()` call, still open, and never read the
  list's bound. `D15940`'s filed witness caught it.
- **The classes are built before mono only when the elaboration asked for them.** Building them
  for every compile ran the compiler's own L2 build out of GC heap. The L1 build passed, so only a
  two-level bisect found this.
- **Net:** +312 compiler lines (401 added, 89 deleted); `emit_mono` stays at 908 functions. The
  delete is part 2b: the walk keeps the readers below until they move.

## Parity with the walk

Lane M's probe: the walk and `eplSlotSig` both answer at every `monoSlotDeliveryTy` call while
`tests/cases` builds, and the probe compares the two answers. The 18 `tests/cases` programs
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

All on fixpoint seeds. Master `6015bf3ed`, built to a fixpoint from its own seed; the
candidate is that master plus this branch, built to a fixpoint from master's.

| check | reading |
|---|---|
| distilled corpus, per cell | 12,101 of 12,101 identical to master |
| `decl-order-ab.vl` | 71 of 5,166 cases move, 1 to clause 1: the same as master |
| late demands | 2 in 2 files: the baseline |
| L2 self-compile fuel | 87.673e9 against the baseline's 87.367e9: +0.4% |
| L2 peak live set | 1,006 MiB, 49% of the 2 GiB heap |
| seed size | 6,393,260 bytes, +0.2% on the baseline |
| plumb-shape cost | ok |
| `deno task test` cases (`cases_wasm_0`, `_1`) | 3,920 passed, 0 failed |
| filed witnesses (`--strict`, both inventories) | every row as filed |
| `scripts/gate.sh` | every row ok but `ci-native`'s 5 seed-cache and sidecar tests, which fail on master's seed too in this container |

## Next: part 2b

Part 2b moves the remaining elaboration readers of `elabSlotDeliveries` and its family onto the
classes, and then deletes the walk (an expected 1,000 to 1,300 lines). Lane M switches its other
mono readers once the API covers them.
