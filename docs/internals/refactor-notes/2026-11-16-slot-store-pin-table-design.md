# Slot store: the pin table mono reads, design note (lane SLOT, 2026-11-16)

Closes [D16768](../inventory/D16768.md) when built. Part 2b(iii) moved every elaboration reader of
the delivery walk (`elabSlotDeliveries`) onto the place classes. The walk's 10 remaining readers
are all in mono, and they ask while mono's flow rewrite is repointing reads. The walk re-reads
the live program at each ask; the classes, read the same way, do not track the rewrites. Part D
showed this: 8 of the 7,811 `tests/cases` programs failed to build, and 10 changed bytes.

The coordinator's ruling is that the elaboration answers mono's slot questions into a table, and
mono only reads it. Invalidating the classes on each rewrite is ruled out.

## The table

Filled by the elaboration once its rounds settle, at the `eplEnsure` point before mono. It is
read-only from then on: nothing in mono writes it, and no reader re-derives an answer from the
program. Three kinds of row:

| row | key | value | answers |
|---|---|---|---|
| slot | `(holder, path, k)`: a binding, literal or parameter; steps `e`, `v`, `f.<name>`; instance `k`, -1 for every instance | `deliveries: {ty, call, read}[]`: each closed function type, the call that delivers it (-1 for a bound) and the read it flows through (-1 for none); `perInstance: boolean` (on the -1 row) | `monoDeclPathKeysIn`, `monoPinFnParamTys`, `monoFlowSlotPins`, `monoSlotDeliveryTy` |
| value | the value's declaration | `onlyCall`: the one call it reaches as callee (-1 for none or two); `returnsTo`: the functions whose returns it reaches | `monoPinOpenCallLams` (`elabValueOnlyCall`), `monoPinNoteReachLets` (`elabValueReturnsFrom`) |
| lambda | `(lambda, k)` | `params`: the one delivered parameter list; `paramTys`: per parameter, the closed type its calls give it; `ret`: the delivered result | `monoLamParamPinAnn`, `monoLamPinRetAnn`, `monoMakeInstanceGo`, `monoPinLamAtDelivery` |

- **Readers filter; the table does not.** Each delivery carries its call and its read, so mono's
  omits stay with mono: the calls the flow rewrite made direct (`mfrSetCalls`), and the reads it
  repointed (`mfrRepointed`). The table holds the unfiltered answer.
- **Pins and their spelling come from one row.** `monoDeclPathKeys` chooses a pin and
  `monoPinFnParamTys` spells it. Part D showed that two sources disagree.
- **Fill.** Every holder whose checked slot type may hold a function, at each path down to a
  function leaf, at -1 and at each instance key of its frame. The classes are built before mono for
  every compile (`eplEnsure` no longer waits for `eplAsked`). On the compiler's own build that
  measured +900 fuel units of 92.35e9, with L2's peak live set 1,027 MiB, 50% of the heap. The fill's
  own cost is graded at step 1.
- **Storage is not decided here** (l2-inferred-interfaces-design §10). The table records
  deliveries; `fnTagDecide` and the storage readers stay lane STORE's. A storage switch that reads
  pins reads this table. Lane STORE agreed the schema. Its switches read no pin today, and the table
  keeps no held-set row per `(place, k)`: storage is decided once at check time, keyed by call and
  owner with no instance, so such a row would be a second decider.

## Migration order

One PR per group, each with all 7,811 `tests/cases` programs byte-identical against master, plus the
distilled corpus per cell, late demands, fuel and the pin-helper baseline:

1. **The table and the slot rows**, with the four delivery-list readers. They move together:
   part D found that the pin chooser and the pin speller must read one source.
2. **The value rows**: `monoPinOpenCallLams`, `monoPinNoteReachLets`.
3. **The lambda rows**: `monoLamParamPinAnn`, `monoLamPinRetAnn` / `monoMakeInstanceGo`, and
   `monoPinLamAtDelivery`. The last is D16580's pin: its old switch raised late demands, because
   the walk's call demanded instances. The table is filled before mono, so a demand it makes is not
   late.
4. **Part E**: delete `elabSlotDeliveries` and its family, the walk-only half of `elabSlotClimb`,
   `elabLamParamTyAt` and `elabRetsReachProbe`.

Part D's branch (`slot-2b3-d`) is parked. Its exports (`eplSlotDeliveredTys`, `eplSlotAnnRets`,
`eplSlotPerInstance`) become step 1's fill functions, read once at fill time instead of
mid-rewrite.

## Then

Slot-store design §5 stage 3, "containers read the store": mono F3/F4 write the place's `ty` from
the store. D16721 and D16720 (lane REP) close there.
