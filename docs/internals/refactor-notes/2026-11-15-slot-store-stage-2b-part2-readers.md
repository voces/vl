# Slot store, stage 2b part 2b(ii): the last mono probe row closes, and one more elab reader reads the classes (lane S, 2026-11-15)

Part 2b(i) ([`2026-11-15-slot-store-stage-2b-part2-sig.md`](2026-11-15-slot-store-stage-2b-part2-sig.md))
switched `monoSlotDeliveryTy` onto `eplSlotSig`, leaving one probe row where the walk delivered
and the classes did not. This PR closes it and switches `elabRetFnListLitTy`.

## What changed

- **A call the elaboration keyed nowhere reaches every instance of its callee** (`eplCallTargets`).
  `bound(g)`, with `g` still typed `((_) => _)[]` at the call, has no call key, and the classes
  dropped its argument edge, so the annotated `k` inside `bound` never bounded `g`. The walk
  follows such a call into every instance. A call with closed arguments and no key takes the
  instance at its arguments' types (`eplCallTarget`).
- **A function holder is placed in the frame that creates it** (`eplSlotPlace`). A lambda read at
  its own instance looked up a place keyed at that instance, where its value's edges are drawn at
  its parent's.
- **`elabRetFnListLitTy` reads `eplSlotSig`** in place of the walk.

## Parity

The mono probe: the walk and `eplSlotSig` at every `monoSlotDeliveryTy` call over `tests/cases`
now differ at one call, `closures/hole-fn-list-map-callback-generic-call-loop-alias`, where the
classes answer `(i32) => i32` and the walk answers nothing; the program runs.

A second probe (a scratch build with `eplSlotDelivered`, whether a bound or a call outside `omit`
delivers the slot, and `eplSlotParams`, the one closed parameter list the calls agree on) ran the
walk and the class read side by side at five elab readers over
`tests/cases` and the distilled corpus, and logged every call where they differ:

| reader | differing calls | this PR |
|---|---|---|
| `elabRetFnListLitTy` | 0 | switched |
| `elabLamDeliveredParams` | 0, once a lambda is placed in its frame and a callback takes its own instance's parameters | stays on the walk: [D16570](../inventory/D16570.md) |
| `elabSlotUncalledOmitting` | 16 | stays: `omit` lists reads, and the classes keep no edge per read |
| `elabLamGenResultTy` | 3, all in `closures/generic-returned-by-maker-through-hole-param-runs` | stays: a function returned through a function value's own result does not reach the caller's call in the classes |
| `elabSlotUncalled` | 2 | stays: not yet narrowed |

`elabLamDeliveredParams` answers the walk's parameters at every call, but switching it refuses
[D4661](../inventory/D4661.md)'s witness, traps the compiler on one case and raises late demands:
the walk call demands the instances the lambda's calls reach. The pin is D16570.

## Walk code this makes dead

None yet. The walk's callers in `emit_elab.vl` fall from nine to eight readers. Every walk function
still has a reader, so the part that deletes the walk's paths comes once the readers above move.

## Readings

All on fixpoint seeds, with master `b75afba1f` merged in to `e6dae9f66`.

| check | reading |
|---|---|
| fixpoint | L2 and L3 byte-identical |
| distilled corpus | 0 `runs → not-runs`; one cell moves, `dord030`, check-clean invalid wasm → runs |
| `cases_wasm` | 3,941 passed, 0 failed |
| late demands | 2 in 2 files: the baseline |
| filed witnesses (`--strict`) | 5,144 of 5,145 as filed; [D16472](../inventory/D16472.md) reads `wrong_output` on master's seed too, until the shared host is rebuilt for #8314 |
| `decl-order-ab.vl` | 0 movers outside the baseline |
| L2 self-compile fuel | +0.0% on the baseline; peak live set 1,008 MiB |
| seed size | +0.4% |
| plumb-shape cost | ok |
| `scripts/gate.sh` | every row ok but `ci-native`'s 5 seed-cache and sidecar tests, which fail on master's seed too in this container, and the D16472 row above |

Net: +28 compiler lines (43 added, 15 deleted).

## Next

Part 2b(iii), net-negative: make `elabLamDeliveredParams` demand at the delivered parameters,
carry a returned function through a function value's result, give the classes an omit by read,
land `eplSlotDelivered` and `eplSlotParams` with those readers as their consumers, and delete the
walk paths none of them uses.
