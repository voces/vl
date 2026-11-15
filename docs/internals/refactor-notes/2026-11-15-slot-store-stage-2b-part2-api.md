# Slot store, stage 2b part 2a: the reader API's first read (lane S, 2026-11-15)

Part 1 ([`2026-11-15-slot-store-stage-2b-part1.md`](2026-11-15-slot-store-stage-2b-part1.md))
made the place classes the only producer of slot facts. Part 2 moves the delivery walk's readers
onto the classes and then deletes the walk. This PR lands the first read of the reader API, so
that lane M can move the mono readers (`monoSlotDeliveryTy`, `monoFlowSlotPins`,
`monoDeclPathKeysIn`, `monoPinFnParamTys`) in parallel.

## What changed

- **`eplSlotBound(holder, path, k)`**, exported from `emit_elab.vl`. It returns the one closed
  type that slot `path` of `holder` (steps `e`, `v`, `f.<name>`) is delivered at in instance `k`
  (-1 for the program), or -1 for none and -2 when two differ.
  - It reads the bound of each class the slot's value flows into: the classes reached forward from
    the slot's place.
  - A binding an instance minted after the write index answers through its source
    (`elabCellLitBinding`), as the walk does. Without that guard, mono's late holders trap in
    `cwIxReadPastBuild` (`closures/generic-bound-unread-in-instanced-function`).
- **`elabHeldDeliveredFnTy`**, the uncalled branch of `elabHeldFnTy`, reads `eplSlotBound` instead
  of `elabSlotDeliveries`.
- **Net:** +29 compiler lines (34 added, 5 deleted). The deletion is part 2b's, once the walk has no
  reader.

## Readings

Fixpoint seeds: master `287507121` and this branch, each byte-identical on a second refresh.

| check | reading |
|---|---|
| distilled corpus, per cell (class and message) | 12,037 of 12,037 identical to master |
| `decl-order-ab.vl` | 83 of 5,150 cases move, 6 to a clause-1 outcome, the same as master |
| late demands | 2 in 2 files of 6,901 built: the baseline |
| L2 self-compile guest fuel | 87.178e9 against 87.168e9: +0.01% |
| seed size | +216 bytes |
| `scripts/gate.sh` | every row ok but `ci-native`'s 5 seed-cache and sidecar tests, which fail on master's seed too in this container |
