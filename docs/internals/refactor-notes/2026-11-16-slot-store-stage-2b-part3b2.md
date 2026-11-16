# Slot store, stage 2b part 2b(iii) B2: the literal-callee family reads the classes (lane SLOT, 2026-11-16)

Part B ([`2026-11-16-slot-store-stage-2b-part3b.md`](2026-11-16-slot-store-stage-2b-part3b.md))
switched `elabLamGenResultTy`. This PR switches the `elabLitSlotCallees` family:
`elabLitSlotCallTys`, `elabLitCallResultTy` and `elab{Slot,Value}CallTysOpenFns`. The
family's one use of the walk was to collect the calls a value reaches, through the walk's call
sink. Everything after that reads those call nodes.

## What changed

- **`eplSlotCallRecs(holder, path, k)`**: the call records through a slot or a copy, factored out
  of `eplSlotAgreedCalls`. It covers every instance of an instanced frame, and for a parameter,
  each binding a call hands it.
- **`eplSlotPlaceOwn`**: a call or a name read is placed where its value is (`eplPlaceOf`). The
  walk climbed a value from its own node, and the classes draw a read's edges from the
  binding's place, not from the read's.
- **`elabSlotCallTysOpenFns`** takes its hits from `eplSlotCallRecs`. For a literal's value, it
  also takes the calls through the literal's own slot (`elabSlotCallAlso`). Where the program
  re-points the field (`r.f = dbl`, D12239), the class leaves the literal's value out. Yet the
  call through `r.f` still names the callee whose open type the family records. Without this,
  `closures/record-of-named-fn-in-generic-field-written-with-named-fn` and its named twin
  `d16221_lit_in_hole_fn_written` built invalid wasm.
- **The walk's call sink is deleted** (`elabCallSink`, `elabCallSinkOn`). No reader turns it on
  any more.

## Parity

A scratch build ran `elabLitSlotCallees` twice per compile, once with the walk's hits and once
with the classes'. It compared the `elabCalleeTys` it recorded, over `tests/` and the distilled
corpus.

| | count |
|---|---|
| runs (one per compile) | 15,944 |
| callee entries the walk recorded | 273 |
| entries that differ | 23, in 15 files |
| of those files, built wasm differing from master | 0 |

The 23 are a type the walk recorded and the classes did not (8), or the reverse (15). The walk
climbs forward from one occurrence of a value. The classes read the whole binding, so a lambda
called directly at another type (`h("s")` before `fs[0](3)`) gives two tuples and no record.
None of them changes a built module.

The probe's log list is cleared at the start of each run. Before that it ran on across the
programs a reused compiler instance builds, so per-file counts were cumulative: part A's 348,202
and part B's 9 calls compared were totals across a batch.

## Readings

Fixpoint seeds: master `97ed6de1`, with part B merged, and this branch merged with it, each
byte-identical on a second refresh.

| check | reading |
|---|---|
| distilled corpus, per cell | `regress.vl --json` byte-identical to master's; 0 runs → not-runs, 0 → silent |
| seed size | 6,374,749 bytes against master's 6,374,718: +31 |
| L2 self-compile fuel | 91.056e9 against master's 91.053e9: +0.004% |
| `emit_mono` pin helpers | 908: untouched |
| `scripts/gate.sh` | every row ok but two, and both fail on master's seed too. `ir shadow`: the `named/hash4h_rolled_alias_map` mismatch, as in part B. `ci-native`: `tests/vl_touch_set_test.ts` |

Net: +19 compiler lines (64 added, 45 deleted).

## Next

Part C: the uncalled family (`elabSlotUncalled`, `elabSlotUncalledOmitting`,
`elabValueSlotUncalled`, and their mono sites), which needs an omit by read.
