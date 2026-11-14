# Slot store, stage 2a: the place-class engine, behaviour-neutral (lane S, 2026-11-14)

This is the first half of a pair.
- **2a (this PR)** lands the engine described in
  [`2026-11-14-slot-store-design.md`](2026-11-14-slot-store-design.md) §3. The engine closes the
  binding slot facts the value cascade leaves open, replacing the delivery-led closer
  (`elabSlotFromDeliveries`). Net **+732 (1,005 added, 273 deleted)** compiler lines.
- **2b** switches the delivery walk's readers (listed below) to the engine and deletes the walk,
  about −1,300 lines. That makes the pair net negative.

The engine is final: 2b only switches readers and deletes.

**2a is not the finished design.** It is +732 (1,005 added, 273 deleted) only as half of the pair. 2b owes three
things:
1. **Delete the delivery walk.** Every reader in the table below switches to the classes.
2. **Move demand ordering into the engine.** Today the value cascade (`elabBindingWholeTy`,
   `elabSlotClose(Whole)`, `elabSlotFromSources`) orders instances other holders read: in D15754,
   `m2` needs `half@f64` because `fnMap`'s close demanded it. 2b gives that order to the engine,
   which demands each member at its class's signature in one pass after the build, and then
   deletes the cascade too.
3. **Show order-freedom.** The 38 cells of D16301's named set stop moving in `decl-order-ab.vl`.

Expected net for 2b: about −1,300 (the walk) and about −700 (the cascade), so about −1,270 for the
pair. If 2b cannot delete the value cascade, the coordinator hears that before 2b is written.

## What changed

**The engine** is a section of `emit_elab.vl` ("Place classes"), `epl*`. It lives there and not
in a new file so that about twelve elaboration internals need no export.
- **Places** are `(declaration, instance)`, with children `e`, `v`, `f.<name>` and `r`.
- **Edges** are read from the write index's consumer column (`cwIxUp*`). They are drawn once per
  instance of the nearest instanced frame, with call and value targets taken from `elabCallKeys`
  and `elabValueKeys`.
- **Bounds.** An annotated holder bounds its whole class at its written type (design rule 1), and
  so does a call result the elaboration already closed.
- **Edge kinds.** A container edge unifies its two places. A function value's edge is a copy:
  members flow forward and calls flow back.
- **Shared type parameters.** Parameters a generic types by one type parameter are unified per
  instance (architecture-target §2.4).
- **The rules.**
  - A leaf closes at the one signature the calls through its class and its copies agree on.
  - Its result is the members' instances' result. Members that return different types are
    allowed only when the set is tagged.
  - An uncalled class is left to the value cascade: the engine has no uncalled rule of its own,
    since one gave D15754's `m2` the `i32` default.

**The switch.**
- `elabSlotFacts` and `elabSlotInstFacts` keep the whole value cascade first: `elabBindingWholeTy`,
  then `elabSlotCloseWhole` / `elabSlotClose`, which still make today's demands. The classes close
  what it leaves open.
- `elabSlotBundleFacts` falls back to the classes instead of `elabSlotFromDeliveries`, which is
  deleted.
- **A first port also deleted `elabSlotClose` and its helpers. It was wrong, and the gate's
  filed witnesses caught it** (D9850, D15753, D15754, D15940, D15943 and D16123 went runs →
  reject or invalid wasm, plus 2 capability probes). Those functions are the values-decide close
  for written containers, not delivery-led ones, and their demands order the instances later
  holders read. In D15754, the never-read `m2` finds `half@f64` only because `fnMap`'s close
  demanded it first. They stay until the values cascade itself moves into the engine.

**Rules the port forced**, now in the design note's §3.3:
1. **The engine demands nothing.** A member demand from the engine (`elabResultAtParams`) changed
   a hole lambda's bundle (`bundle_copy_closure_returned`: runs → check-clean invalid wasm).
2. **A copy converts nothing yet.**
   - A leaf closes only when every class upstream of it agrees, or when the nearest upstream source
     is a call result the elaboration already closed (the same cell, `c : (i32) => i32` over a
     bundle).
   - Coercion records at copy edges are stage 4's.
3. **Different member results need the tag.**
   - Members returning different types share a closure only when the set is tagged.
   - Found by the declaration-order A/B: 9 reordered cases trapped where master refuses loudly
     (`fn-list-written-through-param` and its record and list twins).
4. **Parameters bound by one type parameter share storage.** Found the same way:
   `generic-fn-value-two-type-param-params-*` built invalid modules once their functions moved
   last.
5. **Only an instance the run holds answers.** A member with instances of its own and none at the
   class's parameters leaves the leaf open.

## Readings

All readings are on fixpoint seeds: master `b45a06ef3` and this PR, each byte-identical on a
second refresh.

| check | reading |
|---|---|
| distilled corpus, per cell (`regress.vl --json`, class and message) | 11,985 of 11,985 identical to master |
| `regress.vl` | no runs lost |
| `decl-order-ab.vl` | 38 clause-1 movers, the same 38 as master's, 0 new |
| D16301 named set (38) | **0 of 38 stop moving** |
| emit_mono functions (`pin-helper-budget-baseline.json`) | 908 → 908 (unchanged; 2a touches no mono reader) |
| seed size | 6,841,074 bytes: +19,606 (+0.3%) over master's fixpoint, +1.9% against the baseline (gate: ok) |
| generated-code cost (`plumb-shape-cost.vl --check`) | ok (guest fuel within +5%; peak RSS not graded here: no `/usr/bin/time` in this container) |
| late demands (`late-demands.vl --check`) | 4 in 4 files, of 6,834 built; baseline 4 (ok) |
| self-compile guest fuel / peak RSS | `self-compile time` ok (within 1.5× the guest-fuel baseline); peak RSS not graded here |
| `scripts/gate.sh` | every row ok but `ci-native`'s `vl_seed_sidecar_dir_test`, which fails on master's fixpoint seed too in this container (it runs as root, so a group-writable directory is still trusted); the filed witnesses read 5,017 of 5,017 as filed, provenance match |
| `rep-fuzz-check.sh` | exact (0 baselined failures) |

**Why 0 of 38 stop moving.** The engine is order-free by construction: it unifies over the whole
write index before deciding. But 2a puts it behind the value-led close, which still reads the
elaboration in node order, and the D16301 cells move in that close and in the checker's own
passes. The order-freedom claim is 2b's (the walk) and stage 6's (the checker reads the classes),
not 2a's.

## 2b: the walk's readers, by file and mode

The delivery walk is `elabSlotDeliveries`, `…Omitting`, `…At`, `…Into`, `elabSlotClimb`,
`elabReadOn`, `elabSlotAliasOn`, `elabSlotReadDeliveries`, `elabRetSlotOn`,
`elabLoopVarDeliveries` and `elabLitSlotDeliveries`, plus `elabSlotPerInstance`,
`elabSlotAnnRets`, `elabSlotUncalled(Omitting)` and `elabSlotHeldFns` / `elabSlotFlowFns`. Its
readers:

| file | reader | mode |
|---|---|---|
| emit_elab.vl | `elabHeldDeliveredFnTy`, `elabSlotOnlyCall`, `elabValueOnlyCall` | one delivered signature (plain) |
| emit_elab.vl | `elabValueAgreedCallTys`, `elabSlotCallTysOpenFns`, `elabLamGenResultTy`, `elabValueReturnsFrom` | call tuples (call search, `elabCallRec`) |
| emit_elab.vl | `elabHoleGenFlowTy`, `elabLamDeliveredParams` | delivered parameters of a hole lambda / generic |
| emit_elab.vl | `elabRetFnListLitTy` | per-instance (`elabSlotPerInstance`) |
| emit_elab.vl | `elabValueSlotUncalled`, `elabUncalledSlotTy`, `elabSlotSrcFns`, `elabCalleeFns` | uncalled / held functions (`elabSlotHeldFns`) |
| emit_mono.vl | `monoSlotDeliveryTy`, `monoFlowSlotPins` | one delivered type, with the flow-rewrite omit set (`…Omitting`) |
| emit_mono.vl | `monoDeclPathKeysIn` | pin keys: deliveries, per instance, annotated returns (`elabSlotAnnRets`) |
| emit_mono.vl | `monoPinFnParamTys` | parameter types of one delivery |
| emit_mono.vl | `monoPinListElems`, `monoPinNestedListElems`, `monoStoredSlotFnTy` | uncalled (`elabSlotUncalled(Omitting)`) |
| emit_mono.vl | `monoFlowHeldIs`, `monoFlowHeldOneGen`, `monoFlowSpreadSrcElem` | held functions (`elabSlotHeldFns`) |
| mfr_shadow.vl | `mfrElabFns` | held functions, flow mode (`elabSlotFlowFns`) |

`elabCalleeFns` matters for the engine itself: it resolves a loop variable's callee through
`elabSlotHeldFns`. 2b gives that branch the class's members first.
