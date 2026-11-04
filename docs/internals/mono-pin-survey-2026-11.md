# Mono pins that compute a per-instance type the elaboration could store

Survey on master `4eaf52bb`, 2026-11-04. No code changed. Owners as assigned: A goes to the column lane after
[D15254](inventory/D15254.md) and its current row, C to G1 after its current row, B later, and D
stays with step 5's contextual typing.

Method: every emit_mono function whose name says Pin/Ty and returns a type or spelling (262), then
kept only those that COMPUTE a node's or slot's type per instance from checker/elab inputs (spelling
formatters like monoAnnPinName/monoPinAnnSpelling dropped: they format, the type comes from elsewhere).
Callers = call sites across compiler/*.vl excluding self-recursion. Read from signatures, contracts
and bodies; not ablated.

## A. Substitution of a type under the instance's binding (pure function of (type, instance))
| fn | callers | note |
|---|---|---|
| monoPinnedTyOf | 13 | recorded type of ix at binding bN/bT; already reads elabWalkTy/elabWalkNarrowedTy, then substitutes |
| monoPinSubTyOf | 12 | t under ctx's pinned binding (elabInstTyAt) |
| monoExactPinTyOf | 9 | t under ctx's exact binding, else parameters' pins |
| monoNumOperandPinTy | 4 | operand at pin, else hole instance's own binding |
| monoPinnedOperandTy | 4 | body expr reading a monomorphized param |
Store: elabNodeTyAt(ix, inst) already exists (3 mono callers). These five are second producers of it.

## B. Per-call, per-parameter delivered type (the elab call key's facts)
| fn | callers | note |
|---|---|---|
| monoArgPinTyIx | 12 | ladder: fn-typed own, unfilled null, clo-pin ann, variant, lit-built, rep row, copy |
| monoElemValArgTy | 3 | value arg's type in ctx, else instance's |
| monoElemArgSetTy | 3 | tagged-set arg's type (elabWalkTy) |
Store: elabCallParamTy (9 mono callers) is the existing fact; monoArgPinTyIx is the big second producer.

## C. Slot/holder closed types (the elabHeldClosedTy / G1 shape: computed on demand, not stored)
| fn | callers | note |
|---|---|---|
| monoStoredSlotFnTy | 7 | 78 lines, 4 loops: fn type a binding's slot path is pinned at from its written values |
| monoClosedObjLitTy | 4 | record literal's type from closed bindings its open fields read (+ records) |
| monoClosedFieldValTy | 3 | field value's closed type in ctx (+ records) |
| monoUncalledSlotFnTy | 3 | slot nothing calls: one closed type, else i32 default (elabHoleFnClosed) |
| monoHeldRecordListAt | 1 | G1's list case, already reads elabHeldClosedTy |
On-demand elab computations mono calls, same shape: elabHeldClosedTy (79 lines), elabHoleMapClosed,
elabHoleFnClosed, elabResultAtParams (demands an instance), elabCallBundleSigs, elabLamInheritedOwn.
Store: one per-(binding, slot path, instance) closed-type fact; G1's list arm is the first reader.

## D. Function values at an annotation (contextual typing of a fn value)
| fn | callers | note |
|---|---|---|
| monoValueAtAnnTy | 6 | fn or if-join of fns at the params `ann` spells |
| monoRetypePinCalls | 6 | calls through a binding held at one pin retyped at the pin (D5062) |
| monoPinnedAnnTyAt | 4 | 48 lines |
| monoCloseRetFnTy | 4 | records what monoPinnedAnnTyAt reads (D9503) |
| monoHoleLamAtAnnTy | 3 | |
| monoPinWrittenLam | 2 | lambda written into a fn-typed slot, at that type |
These take a SPELLING (`ann: string`) as input: the destination is known by name, not as a type fact. That is step 5 (contextual type), not an elab store.

## Ranking (by callers, then by how much a store would delete)
1. A (42 call sites over 5 fns): one existing store (elabNodeTyAt), five second producers. Highest count, lowest risk: readers switch, producers delete.
2. B, monoArgPinTyIx (12): its ladder's rungs are each a fact elab or the checker already has (lit-built, rep row, copy); a per-call-param store would retire the ladder.
3. C (18 + the elab on-demand set): the G1 pattern proper; needs the new (binding, path, instance) fact; monoStoredSlotFnTy is the largest body.
4. D (25): not an elab store; contextual-type work (step 5), listed so it is not double-counted.
