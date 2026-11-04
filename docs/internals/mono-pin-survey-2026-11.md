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
| monoPinnedTyOf | 13 | recorded type of ix at binding bN/bT; already reads elabWalkTy/elabWalkNarrowedTy, then substitutes. Not group A: moved to C/D below |
| monoPinSubTyOf | 12 | t under ctx's pinned binding (elabInstTyAt). Its five calls at a node's own type read `monoNodeTyAt` (elabNodeTyAt, else the node's type); it stays for the seven that substitute a derived type (an element, a return, a parameter type) |
| monoExactPinTyOf | 9 | t under ctx's exact binding, else parameters' pins. Its three calls at a node's own type read `monoNodeTyAt` (1,907 reaches, 0 disagreements); the six at a parameter's pin are group B |
| monoNumOperandPinTy | 4 | operand at pin, else hole instance's own binding. Not group A: moved to C/D below |
| monoPinnedOperandTy | 4 | body expr reading a monomorphized param. Not group A: moved to C/D below |
Store: elabNodeTyAt(ix, inst) already exists (3 mono callers). These five are second producers of it.

## B. Per-call, per-parameter delivered type (the elab call key's facts)
| fn | callers | note |
|---|---|---|
| monoArgPinTyIx | 12 | ladder: fn-typed own, unfilled null, clo-pin ann, variant, lit-built, rep row, copy |
| monoElemValArgTy | 3 | value arg's type in ctx, else instance's |
| monoElemArgSetTy | 3 | tagged-set arg's type (elabWalkTy) |
**Measured 2026-11-04: neither existing store is the fact `monoArgPinTyIx` produces.** A pin is
this call's argument type. It is an input to the instance key. `elabCallParamTy` is the type the
instance settled for the parameter, which is an output of the solve. So switching the pin to the
store would key each instance by its own result.

The probe wrapped `monoArgPinTyIx` in a non-halting `VL_REP_SHADOW` note per rung and ran over
`tests/cases` and `distilled/named` (17,605 files). It compared only calls whose callee declares
the parameter with an open type, and skipped member calls, whose receiver shifts the argument
index. Cells are calls/files. `EQEXACT` means equal after `monoExactPinTyOf`. `CLOSEDPARAM`,
`MEMBER` and `NOTARG` were not compared.

Against `elabCallParamTy` (the instance's parameter):

| rung | EQ | EQEXACT | NE | no store | CLOSEDPARAM | MEMBER | NOTARG |
|---|---|---|---|---|---|---|---|
| own (fallthrough) | 21,547/3,701 | 2,163/296 | 1,790/188 | 141/29 | 5,039/909 | 349/33 | 2,204/478 |
| fnOwn | 1,308/128 | 12/2 | 739/54 | 46/10 | 25/16 | 4/1 | 252/31 |
| cloAnn | 73/10 | | | 2/1 | | | |
| repRow | 71/20 | | | | | | |
| litBuilt | 37/8 | | 5/3 | | 7/3 | | |
| null | 22/4 | | | | | | |
| nulFn | 20/1 | | 4/1 | | | | |
| copy | 11/5 | | | | | | |
| variant | 2/1 | | | | | | |

The 2,989 `NE` calls break down as follows:

- **1,332 elab-wider.** The instance's parameter is a union of what its calls deliver, for example
  `i32` against `i32 | f64 | null`, or `Set<i32>` against `Set<i32> | null`.
- **403 mono-open.** The pin still holds `T` or `_` where the elaboration closed it.
- **About 800 other.** These include residual index misalignment at callback positions.

Against the call's own binding row (`callBindRowOf`, with the rep row where keyed there,
substituted into the parameter type):

| rung | EQ | NE | no row |
|---|---|---|---|
| own | 20,973/3,653 | 1,575/144 | 3,090/415 |
| fnOwn | 1,306/127 | 573/45 | 226/27 |
| cloAnn | 3/1 | | 72/10 |
| repRow | 71/20 | | |
| litBuilt | 37/8 | 2/2 | 3/1 |
| null | | 14/2 | 8/3 |
| copy | 11/5 | | |
| variant | 2/1 | | |

The binding row is also a join: 1,128 calls still read elab-wider. Group B therefore needs a
per-argument delivered-type fact that does not exist yet. The `#r.<i>` delivered-row entry (D15173)
is its record-only precedent. The probe is `docs/internals/mono-argpin-probe.patch` (apply, build, run under
`VL_NO_COMPILE_CACHE=1 VL_REP_SHADOW=1`, grep `repAB/argpin`). Until that fact exists, only `repRow`, `copy`, `variant` and most of
`litBuilt` agree everywhere they are compared.

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

### Moved here from A: mono's pins that defer to the hole binding

`monoPinnedTyOf`, `monoPinnedOperandTy` and `monoNumOperandPinTy` were probed against the
instance's record (`elabWalkTy`) over the tests and the distilled corpus. Of 75,880
`monoPinnedTyOf` calls, 10,875 disagreed, 9,876 of them with mono's answer open where the
record is closed. Preferring the record broke 21 programs (10 traps, 11 refusals), and
preferring it only where mono's answer is open still broke 18, nearly all hole instances.
Mono's open answer is a deferral to the hole binding, not a second producer. The store already
holds the hole-instance answer (below), so retiring it needs the two re-making sites to stop
pinning early. [D15259](inventory/D15259.md) is the gap in
the other direction, where the record is open and mono's substitution closes it.

**Why the remaining readers stay on the ladder.** Emit already reads the hole-instance answer
from the store: `scopeTyAt` returns `elabNodeTyAt` for an open type once the program is
monomorphized. Two of `monoPinnedTyOf`'s 14 call sites break when given the store's type where
mono's is open. They are `monoExprRebuild` (10 of the 21 broken programs alone) and
`monoPinRetype` (7 alone). Both re-make a node and pin the closed type on it before the hole
instance's emission reads the store. The other 12 read the store with no effect: 0 emitted-wasm
movers over 7,528 test files and 11,726 corpus cells. So that switch was not landed, because it
adds a helper and deletes nothing. It is worth doing when it can delete the ladder rungs inside
`monoPinnedTyOf`; until then sites 5 and 11 say in a comment that they defer to `scopeTyAt`.

## D. Function values at an annotation (contextual typing of a fn value)
| fn | callers | note |
|---|---|---|
| monoValueAtAnnTy | 6 | fn or if-join of fns at the params `ann` spells |
| monoRetypePinCalls | 6 | calls through a binding held at one pin retyped at the pin (D5062) |
| monoPinnedAnnTyAt | 4 | 48 lines |
| monoCloseRetFnTy | 4 | records what monoPinnedAnnTyAt reads (D9503) |
| monoHoleLamAtAnnTy | 3 | |
| monoPinWrittenLam | 2 | lambda written into a fn-typed slot, at that type |
Three take a SPELLING (`ann: string`): `monoValueAtAnnTy`, `monoHoleLamAtAnnTy` and
`monoPinWrittenLam`. The spelling is not a declared destination. It is `monoSigFnTyName(pins[0])`,
the signature the function-value flow table says the slot is called at, with its return spelled
`void`. The other three take no spelling. They re-read types mono pinned earlier.

**Measured 2026-11-04: the checker records no closed destination where these work.** A
non-halting note at each function's answer put mono's answer beside the node's checker destination
(`nodeCtxTyIx`, from `recordCtxTy`), the walked instance's destination (`elabNodeCtxs`) and the
node's elaborated type. Swept over `tests` and the distilled corpus (19,264 files). Cells are
calls/files.

| fn | compared | agrees with a store | store open | store closed, differs | no store |
|---|---|---|---|---|---|
| monoValueAtAnnTy | 536/114 | 7 | 400 | 64 | 65 |
| monoPinWrittenLam | 139/45 | 2 | 112 | | 25 |
| monoHoleLamAtAnnTy | 2/1 | | 2 | | |

- **`monoValueAtAnnTy` is mostly asked with no pin.** A further 9,825 of its calls (1,410 files)
  pass `ann == ""` and return -1 at once; one more passes a spelling `nameToTy` does not resolve.
- **The closed-but-different stores mostly agree.** 49 of the 64 differ only in the `void`
  return the spelling carries, and mono's result equals the store.
- **The open stores are the slot's inferred hole type.** Mono's pin is what closes them.

The three that take no spelling:

- `monoPinnedAnnTyAt` (26/8, through `monoPinnedListAnnTy`) and `monoRetypePinCalls` (59/26) read
  nodes with no destination store, whose own type is open.
- `monoCloseRetFnTy` (791/382) answers -1 on 757. Where it closes a type (34), 15 have an open
  store, 3 an equal one and 16 none.

So the producer group D needs is G1's group C fact, not a contextual-type stamp:
`elabSlotTyAt(holder, path, k)`, the closed type a slot is built and called at. These six are its
future readers, alongside group C's. The flow table must not stamp it; that would be a third
producer. The probe is `docs/internals/mono-groupd-probe.patch` (apply, build, run under
`VL_NO_COMPILE_CACHE=1 VL_REP_SHADOW=1`, grep `repAB/gd`).

### Group D on the slot fact (`elabSlotTyAt`), measured 2026-11-04

A non-halting note at mono's four slot-type producers (`monoPinListElems`,
`monoPinNestedListElems`, `monoPinRecordField`, `monoStoredSlotFnTy`) and its three re-readers
(`monoPinnedListAnnTy`, `monoCloseRetFnTy`, `monoRetypePinCalls`) put mono's answer beside
`elabSlotTyAt(holder, path, ctx)`. It ran over the tests and the distilled corpus. Where both
answer they agreed **141 times, with 0 disagreements**. Mono closed a type the fact did not have
on 285 calls:

| bucket | calls | owner |
|---|---|---|
| the slot's checked type is already closed | 48 | no gap: a reader reads the node's type |
| generic frames (`elabSlotTyAt` is -1 there) | 51 | (2) per-instance slot facts |
| an open list, map or record binding with no fact | 88 | below |
| a bare `TyFunc` binding's own value | 27 | `Fn#d` singleton typing (step 3), not a slot fact |
| holders that are not a `let` or a function | 48 | not ablated |
| function results not built from a returned list literal | 19 | (5)/(6), not ablated |
| annotated `let`s | 4 | |

The 88 are 74 once group C's two producer fixes land. By the producer's first failing step:

| mechanism | calls | |
|---|---|---|
| A. a stored value is not a declaration or a name for one | 27 | read it at its own checked type |
| C. the slot is called only through a binding that reads it | 15 | checker per-slot call notes |
| B. the slot's writes are not followed | 12 | |
| E. own calls agree; the result at them fails | 6 | |
| D. own calls agree; a member is not top-level | 5 | |
| F. the slot is called at two tuples | 5 | set dispatch (step 4), not a missing fact |
| G. holder not visited | 3 | |
| H. a map slot holding stored values | 1 | |

Each PR on these re-sweeps the 74 and reports what remains.

**A, landed.** `elabHeldClosedTyAt` reads a stored value that is not a declaration at its own
checked type. A closed function type must agree with the slot's signature. An open one adds the
top-level members of the set it names (`Fn#d`); a lambda member is refused. The 74 fall to **60**,
and every fact present equals mono's answer. A's 12 that remain are 5 parameters with no set,
waiting for per-instance facts (2), and 7 module-scope lambdas, waiting for D.

Recorded, not built:
- **D, landed:** `elabTopFn` admits a lambda whose enclosing scope is the module, with no
  function, block or loop around it, so it captures no local. With C1 in, the 57 fall to **51**,
  all EQ. Still refused: 7 nested or capturing lambdas.
- **B, landed:** a `let` whose initialiser is not followed (`cwSlotWrittenValues` < 0) reads
  its sources. A whole-binding copy (`b.slice(...)`, `[...b, v]`) holds `b`'s values and is
  decided at its own calls. A slot read or a call's result (`w.f`, `xs[0]`, `m["k"] ?? []`, `mk()`)
  takes that slot's fact, and must agree with what its own writes store. The 51 fall to **47**,
  with 0 disagreements over the 253 files.
- **C2a, held to land with B's flow-sensitive follow-up:** a slot read only where it is
  delivered at a closed function type takes that type. Built, and it closes 0: its two `zs`
  slots join a pushed `inc` that the delivered type cannot take, and mono reads them after a
  reassignment.
- **(2), per-instance facts, landed:** a binding in a generic's body is closed once per
  non-guess instance, keyed by that instance, after the run's last settle. It is closed from the
  calls that instance's re-check noted, and from the instances elaboration already enumerated
  under it, demanding none. It has no program-level fact. Generic-frame calls where mono closes
  fall from 47 missing to **30**, with 0 disagreements over the 253 files.
- **2c, the first switched reader:** `monoPinNestedListElems` reads the inner element's type from
  `elabSlotTyAt`, with its pin-agreement scan and per-element derivation deleted; the deliveries
  stay. This needed a function with an un-annotated parameter (a hole function) to be collected
  per instance like a generic. Its 13 calls are all EQ, with 0 missing.
- **`monoRetypePinCalls` retires with step 4, not with a fact.** All 44 single-member callees take its
  arguments path, which only assembles `mkFuncTy(args, result)` from the call's own types, so
  `elabMemberKeyAt` agrees there and nothing is deleted. The D6003 pins path
  (`fnFlowDeclPathPinTysAt`, `monoPinCallRet`) is taken only by 2–3 member sets, which is set dispatch.
- **E, G, H:** folded in when A, B or C touches the same code.
- **F:** set dispatch (step 4), not a missing fact.

## Ranking (by callers, then by how much a store would delete)
1. A (42 call sites over 5 fns): one existing store (elabNodeTyAt), five second producers. Highest count, lowest risk: readers switch, producers delete.
2. B, monoArgPinTyIx (12): its ladder's rungs are each a fact elab or the checker already has (lit-built, rep row, copy); a per-call-param store would retire the ladder.
3. C (18 + the elab on-demand set): the G1 pattern proper; needs the new (binding, path, instance) fact; monoStoredSlotFnTy is the largest body.
4. D (25): no store of its own. Its readers wait on C's slot fact (`elabSlotTyAt`), measured above.
