# A typed mid-level IR: design, 2026-11-15

Engineering review item L1 (`engineering-review-2026-11.md` §6). This note is docs only and changes
no compiler code. It was measured at master `bb0d46dd`, with a native `vl` built from that tree and
the published `seed-latest` (sha256 `6790af04…`, 4,980,869 bytes). Every count names its command in
§A. A count over refusal **messages** is labelled a message count; none of them was ablated.

The design is written against the landed or planned shapes of four prerequisites:
- `TyId`, lane H (`refactor-notes/2026-11-14-type-hashcons-design.md`, stage 4a);
- `RepId`, lane E (`refactor-notes/2026-11-14-rep-adt-design.md`, `2026-11-15-rep-adt-stage2-plan.md`);
- `Coercion`, lane M3 (relate() → Coercion, just started);
- `InstReq`, `FnCtx` and `Lowered`, lane Q (`refactor-notes/2026-11-14-phase-products-design.md`).

It also assumes lane S's slot store (`refactor-notes/2026-11-14-slot-store-design.md` §7) and the
owner's 2026-11-15 ruling that exports freeze at the module boundary.

## 0. Summary

- **What the IR replaces is measured.** `emitExpr` (`wasmEmit.vl:22050`) runs about ten
  node-keyed hooks before it looks at the AST variant. One of them, `coerceKindAt`, picks one of
  ten `CoerceKind`s from six node tables and three seats, and six "seat" globals in all stop
  `emitCoerced` from converting twice. The emitter has 7,203 functions and 148,114 lines. `vl run scripts/emit-refusal-sites.vl`
  finds 850 refusal sites in it, and 599 of them are in `wasmEmit.vl`.
- **Shape (§1).** The IR is structured, typed and in ANF. Control is the wasm shape: `Block`, `Loop`,
  `If`, `Br`, `Switch` and `Return`. Every value is a `Var`, so every operand is evaluated once.
  Mutable locals stay mutable (`Assign`): this is not SSA. Coercions, casts, box and unbox, closure
  construction, bounds checks and temporaries are nodes. Every `Var` and every node carries a
  `RepId`, and no rep is ever a gap.
- **The verifier (§2)** runs on every IR function in every build, and checks reps, definitions,
  arity and control. In debug builds the `fb*` layer also keeps a typed operand stack, so invalid
  wasm fails in the function that emitted it.
- **Mono (§3) instantiates into IR in two phases.** In phase A the builder reads mono's output, so
  bytes cannot move. In phase B it reads the template plus an `InstReq`, and the AST clone and the
  string pins are deleted.
- **Passes (§4).** Of the 13 AST-mutating pre-emit passes (12 in `emit_rewrite.vl`, 4,972
  reachable lines, plus lambda lifting, 478), 6 retire into the builder and 7 become IR-to-IR
  passes. Of `opt_*.vl`'s 10,271 lines, about 9,400 retire onto
  IR passes, and the `wasm-opt` driver (about 900) stays.
- **Migration (§5) uses two seams.** At the **op seam**, a legacy call site calls the total
  `lower(op × rep)` in place of its own ladder, and that site is byte-identical. At the
  **function seam**, `emitFuncCode` hands a function to the IR path only when a dual emit of that
  function has produced identical bytes. Legacy code deletes per construct, when its last claimant
  goes. After I1b, cutover proceeds family by family at both seams (§10).
- **Refusals (§6).** Two refusal literals are live (`live-sites.json`), and 4 of 247 capability
  probes still refuse. The IR closes both live literals and all four probes. The fourth is D16396,
  a checker refusal of a program the field-pair rule makes legal (§6.1). Of the 850 sites, 443 are by message a table miss or a kind
  disagreement: rep-totality makes those unrepresentable, and they delete with the legacy code
  rather than "close".
- **Lines (§7), not prototyped:** about +14k to +20k added, and about −57k to −70k deleted, for a
  net of **about −36k to −56k**. Most of the deletion arrives at one step (I8).

## 1. The node set, and how a node carries its rep

### 1.1 Decisions

| decision | choice | why |
|---|---|---|
| CFG form | structured: `Block`/`Loop`/`If`/`Br`/`Switch`/`Return`, as wasm has it | VL's control flow is structured (no `goto`). Lowering stays one node to one wasm construct, which is what makes byte identity reachable during migration. |
| value form | ANF: each operand is a `Var` or an immediate constant | temporaries become explicit, and an operand is never re-read (§1.4) |
| SSA | **no**. A `Var` is a wasm local, and `Assign` writes it | SSA needs out-of-SSA plus coalescing, which renumbers locals and moves every function's bytes. The optimizations L1 names (LICM, BCE, SROA, inlining, unrolling) only need def-use chains, and a pass can build those over a structured, non-SSA body. SSA can be added later as an analysis view. |
| monomorphic | yes. An `IrFn` belongs to one instance (`InstId`, Q §2.1), and no `Var` has an open `TyId` | the verifier refuses an open type (§2) |
| node encoding | distinct record types in one union, matched by `match` on the record type, with no `_` arm | VL has no payload variants yet (L4). This is the `Ty` arena's and lane E's `RepNode` pattern. Each variant needs its own field-name prefix (the `ast.vl:6` convention). |
| storage | one arena per `IrFn`: `nodes: IrNode[]` and `vars: IrVar[]`. Ids are `i32`, newtyped as `IrNodeId`/`IrVarId` | an IR function can be built, verified and lowered in isolation. Q's `Lowered` holds one per `InstId`. |
| operand ids | `TyId` = `tyCanonSet` (H), `RepId` = H's arm-aware layout id over E's arena (E), `Coercion` (M3), callee (an `fnStmts` position until Q step 6, then `InstId`) | session ids, so IR can outlive the program that built it (Q §2.1) |
| spans | each node keeps a `NodeId` back into `Parsed`, for spans and the source map only | lowering never reads the AST |

### 1.2 Nodes

Every node has the same three header fields: `ty: TyId`, `rep: RepId` and `at: NodeId`. Rep is
stored on the node, not recomputed (§1.3).

```
// operands
type Opnd = OVar{ ov: IrVarId } | OImm{ oiRep: RepId, oiBits: i64 } | OStr{ osText: i32 }
// computations: the right-hand side of a Let
type Rhs =
    RPrimOp   { poOp: PrimOp, poArgs: Opnd[] }            // arithmetic and compare, per PrimRep
  | RCall     { caCallee: IrCallee, caArgs: Opnd[] }      // direct call of an instance
  | RCallRef  { crFn: Opnd, crSig: RepId, crArgs: Opnd[] }// RSig-typed closure call
  | RCallHost { chImport: i32, chArgs: Opnd[] }
  | RCoerce   { coC: Coercion, coV: Opnd }                // M3's value, verbatim (§1.5)
  | RTest     { teV: Opnd, teTarget: RepId }              // `is`: yields bool
  | RCast     { ctV: Opnd, ctTarget: RepId, ctOnFail: "trap" | "null" }   // `as`, `as?`
  | RTagOf    { tgV: Opnd }                               // a union's discriminant, for Switch
  | RMakeRec  { mrFields: Opnd[] }                        // the rep is an RRecord
  | RGetField { gfV: Opnd, gfIx: i32 }
  | RMakeList { mlElems: Opnd[] } | RListNew { lnLen: Opnd, lnFill: Opnd }
  | RListGet  { lgV: Opnd, lgIx: Opnd }                   // unchecked; follows an SBoundsCheck
  | RListLen  { llV: Opnd }
  | RMapOp    { mpOp: MapOp, mpArgs: Opnd[] }             // get, has, set, delete, keys …
  | RStrOp    { soOp: StrOp, soArgs: Opnd[] }
  | RMakeClo  { mcFn: IrCallee, mcEnv: Opnd[] }           // closure construction; S's RClosure
  | RFnId     { fiMember: i32 }                           // a tagged set's id; S's RSetId
  | RCellNew  { cnInit: Opnd } | RCellGet { cgCell: Opnd }
  | RGlobalGet{ ggSym: i32 }
// statements
type IrNode =
    SLet      { lDst: IrVarId, lRhs: Rhs }
  | SAssign   { asDst: IrVarId, asSrc: Opnd }
  | SSetField { sfV: Opnd, sfIx: i32, sfSrc: Opnd }
  | SListSet  { lsV: Opnd, lsIx: Opnd, lsSrc: Opnd }
  | SCellSet  { csCell: Opnd, csSrc: Opnd }
  | SGlobalSet{ gsSym: i32, gsSrc: Opnd }
  | SBoundsCheck { bcV: Opnd, bcIx: Opnd }                // explicit, so BCE can delete it
  | SEffect   { efRhs: Rhs }                              // a call kept only for its effect
  | SBlock    { bkLabel: i32, bkBody: IrNodeId[], bkOut: IrVarId }   // -1 for void
  | SLoop     { lpLabel: i32, lpBody: IrNodeId[] }
  | SIf       { ifCond: Opnd, ifThen: IrNodeId[], ifElse: IrNodeId[], ifOut: IrVarId }
  | SSwitch   { swOn: IrVarId, swArms: SwitchArm[], swOut: IrVarId }  // match and union dispatch
  | SBr       { brLabel: i32, brVal: Opnd | null }
  | SReturn   { rtV: Opnd | null }
  | STrap     { tpWhy: i32 }                              // `unreachable`, with a reason for the map
  | SDrop     { dpV: Opnd }                               // migration only: evaluate, then `drop`
type IrVar = { vRep: RepId, vTy: TyId, vKind: "param" | "local" | "temp", vSlot: i32 }
```

That is 21 right-hand sides and 16 statements. It is the closed set the emitter matches (§1.6).

**`SDrop` is a migration node.** The legacy emitter evaluates a bare value statement and drops it.
The common case is a void function's tail `0`, which becomes `i32.const 0; drop`. The value is
pure, so the IR needs nothing for it, but phase A must reproduce the bytes. `SDrop` holds the
operand, and the verifier checks only its use. Once bytes may move, a dead-code pass deletes every
`SDrop` and then the node itself: that is a named mover at I10, or at I8 if I8 renumbers anyway.

**Signedness lives on the op, not the rep.** `u32` and `u64` share their valtype, and so their
rep, with `i32` and `i64` (`unsigned-types-design.md`). So `PrimOp` carries signedness: `div`/`divu`,
`rem`/`remu`, `lt`/`ltu`, `le`/`leu`, `gt`/`gtu`, `ge`/`geu` and `shr`/`shru`. The builder chooses
the op from the operand's `TyId`, and the verifier checks the choice against that `TyId` (rule 2).
A rep comparison alone would accept a `u32` division lowered as a signed one.

Four cases are deliberately absent:
- **There is no `Unbox` or `Box` node.** Box and unbox are coercions (`CoerceKind` has `"box"` and
  `"unbox"` today), so they are `RCoerce` with M3's value. A failing narrowing is a cast, so it is
  `RCast`.
- **There is no `ForIn`, `Range`, `??`, `?.` or method call.** The builder lowers these to
  `SLoop`, `SIf`, `RTest` and `RCall` over the instance's closed types. The 28-kind
  `forInBackingOf` ladder (rep-adt §1.2) becomes a `match` on the iterated `RList`/`RMap` rep in
  the builder.
- **There is no node for an "un-lowerable" value.** A program the checker accepted always builds.
  A builder failure is a halting internal error (review medium 8), not an `emitFail` that keeps
  going.
- **There is no AST-expression escape hatch.** A function is IR or it is not (§5.2).

### 1.3 How a node carries its rep

- **A `Var`'s rep is decided once, at its definition.** For a plain value that is
  `repOf(vTy)` (E). For a function-holding place it is `slotStore(place).rep` (S §7). A `Var`
  never changes rep. A change of rep is an `RCoerce` into a new `Var`.
- **A node's `rep` field** is its result rep, the same as its destination `Var`'s. For a
  statement it is E's no-value rep (`RNoValue`, stage 1b).
- **The rep is closed.** `RepId` comes from E's arena. Lane E measured every query over the
  corpus (12,037 cells). After mono, every uncovered answer was one of three things: no node,
  `never`, or a template's open type. Every closed type had a rep. So the builder treats `repOf` as
  total on a closed instance type. `never` and `void` answer `RNoValue`, which is a rep and not a
  gap, and every lowering gives it an explicit arm. This is a measurement, not a proof. The
  verifier's rule 1 is the check that would catch an exception. E's stage-2 measurement shows where today's emitter still asks the rep
  of an open type: 10,173 `leaf:unnarrowable` queries in 2,966 corpus programs. That is a template
  asked where the instance is meant. The builder only ever asks the instance's types, so that
  query has nowhere to come from.
- **The arm bit.** H's 4a probes show that `tyCanonLayout` cannot key a list of records by itself,
  because the arm bit can differ one level down (`scripts/silent-sweep/distilled/named/dord032.vl`).
  The IR does not key reps on `TyId`. It stores E's `RepId`. From stage 3½, `repOf` keys
  containers of records by H's per-program arm-aware id. That id is valid after
  `repVariantShapesPrime` and mono's instances (`arenaFinal`), and only provisional before. The
  builder runs after `arenaFinal`, so the provisional window never reaches it.

### 1.4 Temporaries

ANF binds every intermediate value to a `temp` `Var`. Today the same job is done three ad hoc ways:
- scratch and stash locals: 41 functions, 974 lines (`Scratch|Stash` in the name);
- re-reading an operand: union `==` reads each operand once per arm (`emitUnionUnionEq` and
  friends, 9 functions, 589 lines);
- refusing when an operand cannot be re-read. By message, 31 sites name a re-read, an operand, a
  non-binding or a stash (§A.4), for example `wasmEmit.vl:4428`, "`is` over a literal union needs
  a re-readable receiver".

Under ANF the receiver is a `Var`, so the whole class has no representation.

`vSlot` is the wasm local index. In phase A (§3) the builder copies it from `buildLocals`
(`emit_sections.vl:1088`) and the legacy scratch reservation (`fnDetectScratch`), so that local
numbering is unchanged. Once no function takes the legacy path, an IR allocator owns `vSlot` (step
I8 in §5).

### 1.5 The coercion node: `coercionAt(ix, inst)`

`RCoerce{coC: Coercion, coV}` carries the value of one shared query:

```
type CoerceKind = "none" | "listCopy" | "fnClo" | "mapUnbox" | "mapRetag" | "recCopy"
  | "box" | "unbox" | "atomstr" | "numeric"         // wasmEmit.vl, today's literal union
type Coercion = { conv: CoerceKind, at: TyId }
coercionAt(ix: NodeId, inst: InstId): Coercion    // pure, over the checker's and elaboration's records
```

Why this shape (agreed with lane M3):
- **The decision already exists, once.** `coerceKindAt` (`wasmEmit.vl`) builds a `CoerceKind`
  from the checker's per-node records: `listCopyTyOf`, `fnCloCoerceAtNode`, `mapUnboxTyOf`,
  `deliveryRetagHas`, `recCopyRowAt` and `boxRecordTyAt`. If the checker recorded a
  `{conv, at}` per node, that would be a second copy of the decision.
- **It is per instance.** The box, arm, record-copy and numeric records are read at the instance,
  so the query takes `inst`.
- **Position belongs to the builder.** `box`, `unbox`, `atomstr` and `numeric` hold only where a
  delivery position hands the node over, not where a position emits it for its own lowering.
  Today the four seat globals carry that fact. In the IR it is the builder's own knowledge: a
  delivery position calls `coercionAt` and emits an `RCoerce` when `conv` is not `"none"`, and no
  other position does. The seats are not threaded anywhere; L1 removes them by construction (I3).
- **No `kids`.** A literal's fields and elements are delivery nodes of their own, each with its own
  `coercionAt`. Element work inside `listCopy` and `recCopy` (lane E's `coerce` rule, rep-adt §4:
  D2196, D12466) belongs to the lowering, which loops or walks fields and lowers each element's
  conversion.
- **Read, don't relate.** The query reads recorded facts and never calls `relate`, which pins
  holes until its stage C.

The verifier takes `src` as the operand's `TyId` and `dst` as `at`. It checks
`repOf(src)`/`repOf(at)` against the operand's and the destination's reps. `lowerCoerce` is a
`match` over `CoerceKind` with no `_` arm.

**Where the seats open today** (lane M3's reading of `wasmEmit.vl`). These are exactly the delivery
positions at which the builder emits a seat-scoped `RCoerce`:

| conv | opened by | positions | owed iff | `at` |
|---|---|---:|---|---|
| `box` | `emitDelivered` | 5 | `boxRecordOwed(boxRecordTyAt(ix, fnIx))` | `boxRecordUnionTyOf(bt)` |
| `unbox` | `armOpen` | 8: a cast or convert argument, a pack argument, a generic store's right-hand side, an index store's right-hand side, a push argument, a return, a destructure argument, and one more | the position owes an arm, `siteHeap >= 0`, `siteHeap != uBoxIdx` and `armRecordHeapAt(ix, fnIx) >= 0` | a heap index today; under the IR the arm's `RepId`, with nullability from `armUnboxNullable` |
| `atomstr` | `emitAtomToStr` | 4, among them a map key and an `if` arm | `atomFloorWhy(…) == ""` | the atom's union |
| `numeric` | `emitNumPlain` | 6 numeric-widen paths | `numFloorWhy(…) == ""` | the pair from `numRecordAt(ix, fnIx)` |

The record half carries no seat: `listCopy` (`listCopyAtNode`), `fnClo` (`fnCloCoerceAtNode`),
`mapUnbox`/`mapRetag` (`mapUnboxTyOf`/`deliveryRetagHas`, under `mapDeliveryRecorded`) and `recCopy`
(`recCopyRowAt`).

**When it lands.** `coercionAt` is added in I3's PR, together with the builder's first call, from
the spec above. Landing it earlier would leave an export with no caller, which the dead-export
gate refuses, and calling it on every `emitExpr` in the legacy path would cost fuel. The legacy
emitter's seat tests stay as they are until I3 deletes them.

### 1.6 The emitter is a total function

```
lowerRhs(r: Rhs, dst: IrVar): void      // match over the 21 Rhs kinds; no `_`
lowerStmt(n: IrNode): void              // match over the 16 statements; no `_`
lowerCoerce(c: Coercion): void          // match over M3's variants; no `_`
```

Each arm then matches the operand reps over E's `RepNode` set, again with no `_`. Today that set
has ten kinds: `RPrim`, `RAtom`, `RList`, `RMap`, `RBox`, `RClosure`, `RRecord`, `RNullable`,
`RUnsup` and `RNoValue`. `RView`, `RSig` and the four function storages arrive with lane S's slot
store, and `RView` with L3 option A, so this note pins none of their fields. `RUnsup` must be
unreachable past the checker, and its lowering arm is a halting internal error, not an
`emitFail`. Element work
delegates to a recursive call on the child rep, so a nested list is not a case of its own
(rep-adt §2.4).

Two consequences:
- The kind-ladder lint is paid by construction. A new rep or op breaks the self-compile at every
  lowering, rather than falling through.
- **The return type is `void`.** The lowering cannot fail, so the `-1` threading (about 1,500
  lines of `wasmEmit.vl`, per the review) has no reason to exist on the IR path.

## 2. The verifier

`irVerify(f: IrFn)` runs after the builder and after every IR-to-IR pass, in every build. Its cost
is linear in nodes, and it is graded by `self-compile-time.sh` at step I0. It checks the
following.

1. **Closed reps.** Every `Var` and node has a `RepId` in E's arena, and every `vTy` is closed
   (`tyOpen` is false; H §2.2).
2. **Rep agreement.** For each `SLet`, the `Rhs`'s result rep equals `vars[lDst].vRep`:
   - for `RCoerce`, `src(coC)` is the operand's rep and `dst(coC)` is the destination's rep;
   - for `RCast`, the destination rep is `ctTarget`, wrapped nullable when `ctOnFail` is `"null"`;
   - for every other `Rhs`, the rule is an operand-rep signature per op (`RListGet` takes an
     `RList` and an `i32`, and yields the `RList`'s `lElem`);
   - for `SAssign`, the source's rep is the destination's rep. A mismatch is a missing `RCoerce`.
3. **Plain values match their types.** A non-place `Var` has `vRep == repOf(vTy)`, and a place
   `Var` has `vRep == slotStore(place).rep`. This is the check that catches a builder reading the
   template's type where it should read the instance's.
4. **Definitions dominate uses.** Structured scoping makes this a single walk: a `temp` `Var` is
   defined once, before any use, in an enclosing or the same block. A `param` or `local` may be
   assigned more than once.
5. **Control.** Every `SBr` targets an enclosing label. A label with an out-`Var` receives a value
   of that rep on every `SBr`, and on the fall-through. `SIf`/`SSwitch` arms agree on `ifOut`'s rep.
   A join of different reps therefore needs an explicit coercion in each arm, which is what today's
   `markInferredJoinAtoms` and `registerRetJoinUnions` work out by scanning. A function whose result
   is not `RNoValue` leaves its top body on every path: the body is a block whose out is the
   result. An `SIf` or `SSwitch` whose arms all exit counts as an exit.
6. **Calls and globals.** The arguments' reps equal the callee's parameter reps (the callee's
   `RSig`, E stage 6), and the destination's rep is the callee's result rep. An `SGlobalSet`'s
   source and an `RGlobalGet`'s destination have the global's rep.
7. **Switch.** The arms cover the scrutinee's union arms exactly once each, or carry a default
   that names what it excludes (CLAUDE.md's ladder rule, applied to the IR).
8. **Bounds.** Every `RListGet`/`SListSet` is preceded on every path by an `SBoundsCheck` of the
   same `(list, index)`, or carries a proof tag that a BCE pass wrote. A pass that deletes a check
   must leave the tag.
   - In phase A a check sits immediately before its access, and is **fused**: it lowers as nothing,
     and the access lowers both the guard and the read, which is legacy's shape.
   - The check's operand reads do not consume. They do not count against a temp's single use, so
     `f()[i]` stays one temp, consumed by the access.
   - A check that a pass separates from its access (LICM, I10) must name non-temp `Var`s. It then
     lowers as a standalone guard.
9. **No trap moves past an effect.** An `SBoundsCheck`, an `RCast` with `"trap"` or an `STrap`
   that a pass moved keeps every earlier effect (a call, a store, a print) ahead of it on every
   path. The exception is a check that the pass proved can never trap, and that check carries the
   proof tag. The builder records each check's original position, and the rule compares a pass's
   output against it.

A failure halts with the function, the node, its span and the rule. This is the "invalid module is
found by the engine" gap (review §4.3) moved to the producer.

**The debug operand stack.** With `VL_FB_CHECK=1`, `fbBegin` keeps a stack of valtypes, and each of
the 163 `fb*` builders (138 of them in `emit_bytes.vl`) pops and pushes its signature. The legacy
path gets the same check, which is how a dual-emit mismatch (§5.2) is localized.

## 3. How mono instantiates into IR

### 3.1 Phase A: build from mono's output

The builder runs where `emitFuncCode` (`emit_sections.vl:1290`) runs today, after all 33 pass-table
rows. Its input is the AST that the legacy emitter sees: the mono clone and the rewrite passes'
output. It also reads:
- per-node types from `Elaborated` (`ty(k, node)` and `elabNodeTyAt`);
- coercion records (the adapter in §1.5, then M3's `Coercion`);
- places from the slot store.

Nothing about which instances exist, or their order, changes. **Phase A cannot move the function
section, by construction.** It is how the IR gets coverage without depending on mono's rewrite.

### 3.2 Phase B: build from the template

`irInstantiate(req: InstReq): IrFn`. `InstReq` is Q's step-1 record: the template's `SymId`, the
argument `TyId[]` and the importer `ModId` for an exported `const` copy, plus the walk keys. The
builder walks the template's checked body read-only, under:
- the substitution `(binder, idx) → TyId` (H §2.4);
- the instance's per-node types from `Elaborated`;
- the coercions `relate` recorded at the instance;
- S's places.

A call to a generic callee produces `RCall{caCallee: demand(InstReq')}`. `demand` interns the key
(H §2.6: an id vector) and enqueues the request on a worklist. The worklist is drained in
first-demand order, which is mono's order today, so the function section keeps its order (§8.4).

What phase B deletes:
- **the AST clone.** That is mono's 190 `mk*` calls, the `Clone|Copy` family (1,022 lines), and
  the retype and rebind family (640 lines).
- **string pins.** `emit_mono.vl` has 634 `: string` annotations. Instance keys are H's id vectors,
  and pin spellings that only fed a key go with H stage 5.
- **mono's hidden globals.** `InstReq` and the `MonoBuild` frame already removed the instance
  builder's hidden inputs (#8121). The IR builder owns both. The key-staging tables (`monoKeyExtra*`,
  `monoExplicitBN`/`BT`) and `monoBakeSpecK` are the builder's to absorb at I9, after S's pin-walk
  deletion.

What phase B does **not** delete:
- **the pin walk** (`Pin` family, 5,369 lines). S stages 3–5 delete that, because they decide
  storage, which the IR consumes and does not decide.
- **the instance-set decision.** That is the elaboration's (S stage 4, Q's `Elaborated`).

Phase B needs every function on the IR path. The legacy emitter cannot lower a function that mono
never cloned. So phase B follows step I8.

### 3.3 Under the export-freeze ruling

An exported function's IR is built from its own module's `Checked` and `Elaborated` alone, so
`Lowered` is per module per `InstId` (Q §2.1). Nothing in the IR reads the importer, except the
`ModId` in an exported `const` copy's key. Separate compilation then becomes "serialize `Lowered`".
That is not proposed here, but nothing in the node set prevents it: every operand is a session id.

## 4. The passes

### 4.1 The pre-emit AST rewrites (`emit_rewrite.vl`, `emit_lift.vl`)

The lines are each pass's reachable set within its own file (§A.5).

| pass | lines | on the IR | why |
|---|---:|---|---|
| `deadTailDrop` | 9 | **retires**: the builder stops at a statement the checker recorded as exiting | |
| `foldMemShared` | 47 | **retires**: the builder folds the build intrinsic | |
| `loopValueRewrite` | 682 | **retires**: a loop's value is an `SBlock` out-`Var` with a valued `SBr` | |
| `assignValueSpill` | 632 | **retires**: an assignment used as a value is `SAssign` plus a read of the `Var` | ANF |
| `shadowRespell` | 352 | **retires**: `Var`s are ids, and names resolve to symbols | needs Q step 6, or a builder-side scope map before it |
| `dispatchRewrite` | 1,278 | **retires**: method, operator and index dispatch is the builder's call resolution | it reads the checker's resolution |
| `nulScalarSplit` | 286 | **moves**: an IR pass that splits a `T \| null` scalar `Var` into a flag `Var` and a value `Var` | same output, so it needs no mover |
| `captureBoxRewrite` | 1,193 | **moves**: cell conversion over def-use (`RCellNew`/`RCellGet`/`SCellSet`) | about 300–400 lines on def-use chains |
| `inlineConstRecArgs` | 215 | **moves**: into the IR inliner (§4.2) | |
| `synthVoidTwins`, `synthExternValues`, `synthRecEqCores` | 81, 104, 93 | **move**: the builder mints `IrFn`s directly | |
| `cloLiftScan` (`emit_lift.vl`) | 478 | **moves**: lambda lifting as an IR pass | |

The 20 collect and scan rows of the pass table read the AST to fill side tables, such as
`collectU`, `collectS`, `collectCloSigs` and `scanArrLitCommit`. They are not rewrites. Each one
becomes a query that the builder makes on the instance's reps, or it is deleted at I8 with the
legacy reader that consumed it. They are counted inside I8's `emit_collect.vl` and
`emit_classify.vl` figures (§7), not here.

### 4.2 `opt_*.vl`

The lines are function lines, out of the file's total (§A.3).

| file | lines | on the IR |
|---|---:|---|
| `opt_multivalue.vl` | 2,917 / 3,421 | **retires**. A small record that is only read field by field is scalar-replaced (SROA) over def-use: the multi-value result twin, the field-wise argument, and the local or `if` holding a record. Today it does this on decoded bytes, behind its own operand-stack emulation (`:1077`). |
| `opt_inline_scan.vl` | 3,802 / 4,393 | **retires**. Storing a leaf record inline in a field, and laying out a list of records field by field, are rep decisions (an `RRecord` field rep, or an `RList` store). A closed-world IR pass makes them, and E's `heapOf` interns the result. |
| `opt_inline.vl` | 111 / 140 | **retires** with `opt_inline_scan.vl`. |
| `opt_escape.vl` | 606 / 719 | **retires**. It chooses which callees `wasm-opt` inlines so that a per-call struct stays off the heap. The IR inliner and escape pass do that directly. |
| `opt_scan.vl` | 599 / 754 | **splits**. The run-once-from-loop marks move to the IR, which has the call graph and the loop nesting. The `wasm-opt` argv and the `vl-src` strip stay. |
| `opt_pipe.vl` | 653 / 844 | **shrinks** to the `wasm-opt` driver. |

**New IR passes**, all of them movers, each its own PR, gated by `plumb-shape-cost.vl --check` and
`seed-size.vl --check`, and run by default once they land:
- SROA, which replaces `opt_multivalue.vl`;
- a record-inlining layout pass, which replaces `opt_inline_scan.vl`;
- an inliner for small leaves and lambda arguments, which replaces `opt_escape.vl` and review
  medium 5's emitter-side inlining;
- BCE and LICM. They subsume the ad hoc hoisting in the emitter today: `emitListIdxGuardHoisted`
  and `emitStrIdxGuardHoisted`, 9 `Hoist` functions in 256 lines, beside 12 plain
  `emit{List,Str}IdxGuard` calls;
- callback specialization;
- unrolling.

Every pass keeps one invariant, which the verifier enforces (§2, rule 9): **an optimisation never
changes observable behaviour**. In particular, a trap never moves past an earlier effect.

## 5. Migration

### 5.1 The gate for every step

Each step uses the existing gate, nothing new:
- `scripts/refresh-compiler.sh` twice (fixpoint), then `cmp` of the seed against the step's
  predecessor;
- `scripts/gate.sh` (the merge queue re-proves the corpus identity diff);
- `scripts/rep-fuzz-check.sh` from I3 on;
- `self-compile-time.sh`, `plumb-shape-cost.vl --check` and `seed-size.vl --check`.

**Steps I0–I9 are byte-identical**, and a byte that moves is a defect in that step. Only the I10
passes move bytes, and each mover is its own PR, with its witness and its fuel and size readings.

### 5.2 How the old path and the IR path coexist

**Function seam.** `emitFuncCode` gains one test at its top:
`if irClaimed[fnPos] { return irEmitFuncCode(out, fnIx, fnPos) }`. A function is claimed by a
two-stage protocol:
1. **Coverage.** The builder builds the function's IR (phase A, §3.1). If it meets a construct
   outside the current step's set, the function is unclaimed. That is a counted "not yet" in the
   builder, never an `emitFail`.
2. **Dual emit.** In shadow mode (`VL_IR_SHADOW=1`, off by default), each covered function is
   emitted by both paths into separate buffers and compared byte for byte:
   - its body;
   - its locals vector;
   - the relocations (`relCopy`) and the statement spans (`bankBodyStmtSpan`).

   The legacy path runs first and owns every first-ask mint (type indices in first-ask order,
   E's `EmitCtx.typeIndexOf`). The IR lowering may only read an index that already exists. A miss
   or a byte difference unclaims the function and records its first differing node.

A step's PR turns claiming on for its construct set only at **zero dual-emit mismatches** over the
self-compile and the distilled corpus. After that the IR path mints for itself, and the seed `cmp`
proves the mint order held.

**Op seam.** `lower(op × rep)` is a plain function. So a legacy call site can call it in place of
its own ladder before any function is claimed, for example:
- `emitCoerced`'s `match ck` becomes `lowerCoerce(adapter(ck, ix))`;
- `binOpcode{I64,F64,F32}` becomes the `(PrimOp × PrimRep)` table.

A site is converted only where its bytes are identical. This is how the per-construct tables are
proved before the function seam uses them, and how a construct's legacy ladder deletes before I8.

**Deletion rule.** A legacy function deletes when nothing reaches it, neither from an unclaimed
function nor from the op seam. Each step's PR reports what it deleted, and what it left reachable
only from unclaimed functions, with their count.

### 5.3 Steps

"Covers" is the construct set added. "Claimable" is a **regex proxy** over the compiler's own
16,028 source functions (§A.6), not over instances. A function counts if its source uses only the
admitted features. It is an order-of-magnitude guide, not a measurement of the builder.

| step | covers | claimable (proxy, cumulative) | prerequisite | what deletes at the step |
|---|---|---|---|---|
| **I0** | IR types, arena, printer (`--dump-ir`), verifier, `fb` debug stack, both seams, shadow counters. Builds and verifies every function, claims none. | 0 | none | nothing; adds the instrument |
| **I1** | constants, `RPrimOp` over `PrimRep`, locals, `SIf`/`SLoop`/`SBlock`/`SBr`/`SReturn`, `RCall`, globals | 1,905 fns / 12,719 lines | E stage 1 (`RepId`) | op seam: `binOpcode*`, `emitExprAs*` and `ret*Flag` (rep-adt §1.2). Shared with E stage 5: whichever lands second deletes nothing new. |
| **I2** | `RGetField`/`SSetField`/`RMakeRec`, `RListGet`/`SListSet`/`RListLen`/`SBoundsCheck`, `RStrOp`, for-in desugared, object and array literals | 8,506 / 117,922 | E stage 3 (field reps) | op seam: the `emitArr*` family (380 lines) and the six "nested arrays" guards |
| **I3** | `RCoerce` (adapter, then M3's value) | — (it applies inside I2's set) | M3 for the final payload | **the six seats** (`armSeat`, `armServed`, `numSeat`, `coerceHeld`, `boxSeat`, `atomSeat`: 52 references) and `coerceKindAt`/`emitCoerced`'s dispatch. Q's `FnCtx` drops its seat field. |
| **I4** | `??`, `?.`, `RTest`/`RCast`, `RTagOf`/`SSwitch`, `match` | 15,428 / 290,431 | E stage 4 (`heapOf`) | op seam: the `Fit` family (49 functions, 1,438 lines) becomes one IR-owned `fitTest(RList, ty)` (rep-adt §4) |
| **I5** | equality per closed rep, recursive-record compare functions minted by the builder | (inside I4's set) | I4 | `synthRecEqCores` moves; `emit_eq_rows.vl` (368) and the `UnionEq` family (589) become reachable only from unclaimed functions |
| **I6** | `RMakeClo`, `RCallRef`, `RFnId`, cells, lambda lifting, `captureBoxRewrite` as an IR pass | 16,028 / 316,665 | S stage 2 (function storages as reps) | `captureBoxRewrite` and `cloLiftScan` move (about −800 net) |
| **I7** | `RMapOp`, the remaining list operations (push, pop, slice, spread, concat), print | (inside the set) | E stage 4 | the map and list helper ladders become reachable only from unclaimed functions |
| **I8** | **every function is claimed**, and the legacy expression emitter deletes. `vSlot` moves to an IR allocator in a following PR, and that PR is a named mover (local numbering). | all | I1–I7 at zero unclaimed on the self-compile and corpus | §7's I8 row: the bulk of `wasmEmit.vl`'s expression and statement lowering, `emit_classify.vl`'s re-classifiers, the retiring rewrite passes (§4.1), and the collect passes whose last reader went |
| **I9** | phase B: `irInstantiate(InstReq)` | — | I8, Q steps 1 and 6, H stage 5, S stages 3–5 | mono's clone, retype and string-key code (§3.2) |
| **I10** | the IR passes in §4.2, one PR each | — | I8 | `opt_*.vl`, about 9,400 lines, as each replacement lands |

The order is forced:
- I1 → I2 → I4, because each widens the operand reps the next one's lowering takes.
- I3 can land any time after I2. It belongs before I4, because box and unbox are coercions.
- I6 waits on S, and I9 waits on I8.
- I10's passes are independent of each other.

The "claimable" column jumps at I4 because the proxy counts any `is`/`as`, and the compiler
narrows constantly (`if e is Block`).

## 6. Which refusal families each step closes

There are two populations, and they are counted apart (CLAUDE.md, "name the population").

### 6.1 What runs: the live sites and the capability probes

`vl run scripts/capability-probes.vl` (`JOBS=3`) reports **243 of 247 capability probes run, 4
still refuse**:

| probe | outcome | mechanism | closes at |
|---|---|---|---|
| `lambda-record-result-at-generic-union-return.vl` | emit, "ref valtype with no interned shape" (D14082, a live site) | the box's destination union was never registered | **I3**: the `RCoerce` box names its destination `RUnion` by `RepId`, and `heapOf` is total (E stage 4). The mechanism was never traced (rep-adt §7), so this is the least certain. |
| `eq-record-generic-instances-stored-apart.vl` | emit, "struct equality is not supported yet" (D16397, a live site) | the field-wise rewrite runs in the checker, which sees only type parameters | **I5**, by construction: equality lowers per instance over closed `RRecord`s |
| `eq-litunion-list-vs-string-list.vl` | **check**, "has no lowering: … store their elements differently" | the checker acts as the emitter's capability oracle | **I5**: an atom list compares to a string list through an element `RCoerce`. The checker literal is then deleted, and that deletion belongs to I5's PR. |
| `eq-record-fields-widen-opposite-ways.vl` | **check**, "cannot compare {x: i32, y: i64} with {x: f64, y: i32}" | D16396: the checker refuses a program the existing rule makes legal (records of one field set compare pair by pair, each pair at its own join: D16395). Each pair here compares bare. | **I5**: equality lowers pair by pair over the closed `RRecord`s, and the checker's refusal deletes in the same PR |

**Checker-side capability literals.** Fourteen message literals in 7 `check_*.vl` files concede a
missing lowering ("has no lowering", "not yet supported by codegen", "is not built yet", "cannot
hold both", §A.7). Each is clause 2 by construction. The IR's contract is that the checker never
asks the emitter's capability: a literal deletes in the step whose construct set covers it. That
covers v128 inside containers (I2/I7), the converting copy into nested or nullable fields (I3),
the union-holding rules (I4) and the un-annotated-parameter return (I4/I6). A literal that asks a
typing question rather than a lowering one is graded case by case, per the plainest-program rule.

### 6.3 Acceptance rows parked for the IR

Rows whose fix in today's emitter would change a structure the IR replaces. Each one closes at
the step named, with its own grade:

| row | outcome | mechanism | closes at |
|---|---|---|---|
| [D16294](inventory/D16294.md) | emit, "this lambda is handed on at two different function types" | a maker twin shares the root's body nodes, so a returned lambda literal has no per-twin return slot to re-pin | **I9**: `irInstantiate` builds each instance's body, so each twin's literal is its own |

### 6.2 What deletes: the 850 emit refusal sites

By **message** (§A.4), not ablated:

| class | sites | what the IR does |
|---|---:|---|
| table or shape miss ("has no interned shape", "no row", "not collected", …) | 244 | unrepresentable: every `Var` has a closed `RepId`, and `heapOf` is total |
| kind disagreement or unexpected node ("expected an …", "not a …", "unknown kind") | 199 | unrepresentable: the lowering matches the node, and the verifier has already checked the operand reps |
| admits a capability ("not supported", "not yet", "cannot") | 63 | closed per construct, in the step that covers it (by enclosing function: list operations 12, mono 6, closures and calls 6, equality 6, casts 5, coercion 5, …; §A.4) |
| encoding limits (an over-long `array.new_fixed`, a non-ASCII name, float overflow) | 7 | stay: they are limits of wasm or of the literal, not capability |
| other | 337 | mostly internal invariant breaks. They delete with the code that guards them. |

By enclosing function, the 850 sites spread over the steps:
- list operations 100 (I2/I7);
- record, member and assignment 92 (I2);
- mono 85 (I9);
- casts and fit 77 (I4);
- unions, `match` and coalesce 76 (I4);
- closures and calls 74 (I6);
- coercion and delivery 67 (I3);
- equality 37 (I5);
- maps 29 (I7);
- 213 elsewhere.

**Two live, 848 not.** The emitter's sites are almost all unreachable from a checked program today
(`live-sites.json`: 2). So the IR's effect on them is deletion, and the claim is that they cannot
come back: a new rep or op is a compile error in `lower`, not a new `emitFail`. `--sites` reaching
zero is not clause 2 being met, and the probe runner stays the measurement.

## 7. Lines added and deleted, per step

**None of this was prototyped.** "Deleted" is a measured population times a stated fraction.
"Added" is an estimate from the nearest existing code of the same kind.

| step | added (est.) | basis for added | deleted (est.) | population measured |
|---|---:|---|---:|---|
| I0 | +2,200 to +3,000 | types 300; arena and builders 400; printer 300; verifier 700–1,000, against `opt_inline_scan.vl`'s operand-stack walk; seams and shadow 300; `fb` stack 200–400 | 0 | — |
| I1 | +1,200 to +1,800 | builder and lowering for scalars and control | −200 | `binOpcode*` 130, `emitExprAs*` 98 (shared with E stage 5) |
| I2 | +1,500 to +2,200 | records, lists, strings, bounds, literals | −400 | `emitArr*` 380, the six guards |
| I3 | +400 to +700 | `lowerCoerce`, the adapter | −250 | seats, `coerceKindAt`, `emitCoerced` dispatch |
| I4 | +1,500 to +2,000 | test, cast, switch, coalesce | −1,000 | `Fit` family 1,438, as a `fitTest` |
| I5 | +500 to +800 | equality per rep | −100 | the checker literal, `synthRecEqCores` moved |
| I6 | +1,200 to +1,800 | closures and cells; capture as a 300–400-line IR pass | −1,200 | `captureBoxRewrite` 1,193, `cloLiftScan` 478 |
| I7 | +1,500 to +2,500 | maps and the remaining list operations | 0 at the step | — |
| I8 | +300 (allocator) | | **−36,000 to −45,000** | `wasmEmit.vl` 35,011 function lines, `emit_classify.vl` 12,023, `emit_rewrite.vl` 4,874, `emit_collect.vl` 7,721: about 59,600 in all, of which 60–75% is assumed to retire. The rest is reused by the builder: rep queries, sections, `fb*`. |
| I9 | +1,000 to +1,500 | `irInstantiate` and the worklist | −8,000 to −12,000 | `emit_mono.vl` 22,771, less the pin walk (5,369, which is S's) and the key code (329, which is H's) |
| I10 | +2,500 to +3,500 | SROA, layout, inliner, BCE and LICM, specialization, unrolling | −9,400 | `opt_*.vl` |
| **total** | **about +13,800 to +20,100** | | **about −56,550 to −69,550** | net **about −36,000 to −56,000** of the tree's 408,756 |

**Where it is uncertain:**
- **I8's fraction** is the whole answer. It assumes that the decision code in `wasmEmit.vl` and
  `emit_classify.vl` is mostly re-derivation of facts that the builder reads from `Elaborated`,
  E and M3. Rep-adt §5 measured that re-derivation at 15.5% of a self-build. That supports the
  direction, not the fraction.
- **I8 overlaps I6 by one pass.** `captureBoxRewrite` is in both I6's row and `emit_rewrite.vl`'s
  I8 population, which is about 1,200 lines inside the range.
- **The deletions do not double-count E's.** E's stages 2–5 claim about −5,600 to −6,600, much of
  it in the same files. Read this table as what L1 deletes after E has landed.

## 8. Risks, and the settled language questions

### 8.1 Language-visible behaviour: settled by existing rulings

No step of this design needs a new owner ruling. Three language-visible questions came up, and
existing rules decide each one:
1. **Record `==` across opposite widenings is legal.** Records of one field set compare pair by
   pair, each pair at its own join (D16395). So `{x: i32, y: i64} == {x: f64, y: i32}` prints
   `true`. Today's checker refusal is D16396, a clause-2 row, and I5 closes it.
2. **A trap never moves past an earlier effect.** An optimisation never changes observable
   behaviour. A hoisted check has either been proved never to trap, or it stays behind the
   effects (a print, a store, a call). This is verifier rule 9, and it limits LICM to checks it can
   prove, or to loop prefixes with no effect.
3. **Evaluation order is source order**, each operand exactly once (DECISIONS.md, "Evaluation order
   is SOURCE order", D1510). ANF makes that explicit.

The I10 passes run by default, which changes performance and not semantics. None of them reorders
float operations.

### 8.2 Byte identity in phase A

- **Mint order.** The IR lowering asks for heap types in the same order the legacy path does, or
  the type section moves. That is mitigated by legacy-first dual emit with the IR side read-only
  (§5.2), and proved by the seed `cmp` at the switch.
- **Local numbering.** `vSlot` is copied from `buildLocals` and the scratch reservation (§1.4). The
  41 scratch and stash functions are the hardest part to reproduce exactly. A function whose temps
  cannot be mapped stays unclaimed until I8. At I8 the allocator renumbers as one named mover.
- **Spans and relocations.** `bankBodyStmtSpan` and `relCopy` are compared in the dual emit, so a
  source-map drift is a mismatch, not a silent move.

### 8.3 Cost

- **Phase A builds a second representation per function**, and dual emit doubles lowering under
  the shadow flag. The flag is off in the gate's fuel reading. With the flag off, claiming a
  function costs one build plus one lowering, against one legacy lowering that reads about ten side
  tables per node. Whether that is a net fall is I1's measurement (`self-compile-time.sh`, L2
  fuel 87.37 G at the baseline).
- **The verifier is on in every build.** If I0 measures it above 1% of L2 fuel, it moves behind a
  debug flag for release seeds and stays on in the gate.

### 8.4 Order and correctness

- **Phase B's function order** must equal mono's first-demand order. A worklist that drains in
  another order moves the function section. I9 runs string-key mono and id-key `irInstantiate` in
  shadow, and compares the sequence before the switch (H stage 5 does the same for keys).
- **A partial migration that stalls** leaves two emitters. The deletion rule (§5.2) and the
  per-step "reachable only from unclaimed" count make the remaining cost visible. The review's
  advice to pause defect lanes for IR-shaped families applies here: a defect fixed in legacy
  lowering between I1 and I8 is work done twice.
- **The prerequisites' shapes may move.** The node set depends on E's `RepNode` set (ten kinds
  today, with `RView`, `RSig` and the function storages still to come), M3's `Coercion`
  and Q's `InstReq`. Only `RCoerce`'s payload and `IrCallee` are open, and both are single-type
  substitutions (§1.5, §1.1).

### 8.5 What this design does not decide

- **Storage.** Which places share a rep is S's. Which rep a type has is E's. The IR consumes both,
  and the verifier checks agreement with them.
- **L2's interfaces.** An inferred interface changes which instances exist, not the IR.
- **L4's variants.** Nominal variants would add an `RRecord` arm discipline and `br_on_cast`
  lowering. They fit `SSwitch` and `RCast` without a new node.

## 9. Questions to the prerequisite lanes

These were sent to each lane before this PR. **One item is pending: `IrCallee` (Q step 6).**
`RCoerce`'s payload is agreed with M3 (§1.5). They do not block this design: each is a single-type substitution
(§1.5, §1.1). The replies received so far are recorded below.

- **M3, answered** (`refactor-notes/2026-11-15-relate-recorder-design.md`).
  - The value is `Coercion{conv: CoerceKind, at: TyId}`, from one pure query,
    `coercionAt(ix, inst)` (§1.5). It has no `kids` and no checker-side table.
  - The delivery position is the IR builder's own knowledge, not a parameter or a global.
  - Until relate's stage C, the query reads recorded facts and never calls `relate`.
- **E, answered.**
  - Today's `RepNode` set has ten kinds (§1.6). `RView`, `RSig` and the function storages come
    with lane S, and their fields are not pinned yet.
  - Containers of records are keyed by H's arm-aware id after `arenaFinal`.
  - `repOf` is total on closed instance types by measurement, with `RNoValue` for `never` and
    `void` (§1.3).
  - `coerce` and `fitTest` (rep-adt §4) belong to the IR, since a delivery is an IR edge. Rep owns
    only "what is the rep of this type".
- **H, answered.**
  - There is one persistent intern table (`emit_ty_seal.vl`). An id names content, so a closed
    instance type gets its id from the same table.
  - Instance keys become id vectors at H stage 5. Mono keys on `tyCanonKey` strings until then.
  - Emit-side `tyMutEpoch` reads end in the stage-4 slices. The checker's end only with the
    checker-side seal, after L2. Pins still happen during mono's instance re-checks, so an id is
    final only after `arenaFinal`, or after its instance's seal. Phase A's builder runs inside
    `emitFuncCode`, after `arenaFinal`, so it holds only final ids. Phase B must build an instance
    only after that instance's seal.
  - `TyId` is `tyCanonSet`, the type identity, used for diagnostics, the verifier and instance
    keys. `RepId` is the arm-aware layout id that H is building on `tyCanonLayout`, with each
    record's arm bit fixed after `repVariantShapesPrime`. Nothing keys instances on
    `tyCanonLayout`.
- **Q, answered.**
  - `Lowered` is its own product, keyed per `InstId`. `Elaborated` owns the instances and is the
    builder's input, not its container.
  - `EmitCtx` is per output module. `FnCtx` is per emitted function: locals, frames and buffer,
    with no seats. Its first slice (the `fnUses` record) landed, and `body: u8[]` is gone.
  - Each seat is "this delivery owes coercion K at node N". Under the IR it becomes an explicit
    `RCoerce` that the builder emits around the value.
  - Mono's hidden inputs are already explicit (#8121). They are `InstReq{frame, call, delivery,
    specK, retWidenTy, retTy, argLit}` and a `MonoBuild` frame `{own, bindN, bindT, widenRet,
    baked}`, and the IR builder owns both.
  - What the builder still has to absorb from mono's globals: the key-staging tables
    (`monoKeyExtra*`, `monoExplicitBN`/`BT`, which wait on S's pin-walk deletion) and
    `monoBakeSpecK`.

## 10. Addendum: incremental cutover after I1b

After I1b, cutover goes by construct family, one slice at a time. It does not wait for the
whole-function claim at I8. A slice switches one family, such as scalar arithmetic or list
element reads, to the IR's bytes, and deletes that family's legacy path in the same PR.

**A family is cut over at both seams at once.** Unclaimed functions keep calling the legacy
emitter, so a family's legacy code can only be deleted once every legacy caller reaches the IR's
lowering through the op seam (§5.2) instead of its own ladder. A slice therefore:
- routes every legacy site of the family to the shared `lower*` arm;
- deletes the ladder those sites used;
- lets claimed functions take the same arm through the function seam.

**"Fully matched" is counted per occurrence, not per function.**
- Before a slice, the shadow's dual emit counts every node of the family, in every function,
  covered or not: on the self-compile and the full distilled `cells/` and `named/`.
- The count must show zero byte or span mismatches and zero context mismatches.
- A per-function match count is not enough, because the deletion reaches functions the builder
  does not yet cover.
- Every legacy decision the family reproduces must be one shared pure function, with any context
  passed explicitly (§5.2, and the I1b claim rule).

**Bars for each slice:**
- output byte-identical for the corpus identity diff and the self-build;
- the seed reaches a fixpoint;
- L2 self-compile fuel within +1% (`self-compile-time.sh`);
- net-negative compiler lines;
- pin helpers in `emit_mono.vl` at 908 or fewer;
- the shadow's dual emit stays armed in the gate, as the check for the families not yet cut
  over.

**Order.** Take families in order of legacy lines deleted per IR line added, with the measured
occurrence counts quoted. Families still behind an unshared decision wait for that decision to
become shared, and they do not count as "fully matched" before then.

**What it does not change.** Phase B (I9) still waits for every function to be on the IR.
Movers (SSwitch, the local allocator, SDrop's removal and the I10 passes) still land as their
own named PRs.

## A. Commands

Run from the checkout root, with `PATH=$PWD/scripts/vl-host/target/release:$PATH`.

### A.1 Refusal sites and probes

```
vl run scripts/emit-refusal-sites.vl                    # 850 sites, 693 templates
vl run scripts/emit-refusal-sites.vl -- --json sites.json
JOBS=3 vl run scripts/capability-probes.vl              # 243 of 247 run, 4 refuse
cat scripts/capability-probes/live-sites.json           # 2 live literals
```

### A.2 Function index

The function index used in §A.3 to §A.6 is every column-0 `function` or `export function` in
`compiler/*.vl`, up to its column-0 `}`. It finds 16,028 functions and 316,665 lines.

```
python3 - <<'E'
import re,glob,os,json
out=[]
for f in sorted(glob.glob('compiler/*.vl')):
    L=open(f).read().split('\n'); i=0
    while i<len(L):
        m=re.match(r'^(export )?function (\w+)',L[i])
        if m:
            j=i+1
            while j<len(L) and L[j]!='}': j+=1
            out.append(dict(file=os.path.basename(f),name=m.group(2),start=i+1,end=j+1,lines=j-i+1)); i=j
        i+=1
json.dump(out,open('fns.json','w'))
E
```

### A.3 Families

Each family is the sum over the index of the functions whose name matches the regex:

| family | regex | functions | lines |
|---|---|---:|---:|
| emitter files (`emit_*.vl`, `wasmEmit.vl`) | — | 7,203 | 148,114 |
| `fb*` | `^fb[A-Z]` | 163 | 2,247 |
| coercion | `Coerc` | 42 | 1,659 |
| delivery | `Deliver` | 87 | 2,211 |
| scratch and stash | `Scratch\|scratch\|Stash\|stash` | 41 | 974 |
| hoisting | `Hoist` | 9 | 256 |
| fit | `^emit.*Fit\|Fit[A-Z]?\w*$` | 49 | 1,438 |
| union equality | `^emitUnion.*Eq\|UnionEq` | 9 | 589 |

The file totals are the sum over the index for one file: `emit_mono.vl` 22,771 (by name, `Pin`
5,369, `Clone|Copy` 1,022, `Subst|Retype|Rebind|Resolve` 640, `Key|Spell` 329); `emit_classify.vl`
12,023; `emit_rewrite.vl` 4,874; `emit_collect.vl` 7,721; `wasmEmit.vl` 35,011; and the `opt_*.vl`
files as in §4.2.

The other counts:
- the seats: `grep -ow` for each of the six names over `compiler/*.vl`, which totals 52;
- `grep -oE "\bmk[A-Z]\w*\(" compiler/emit_mono.vl | wc -l` gives 190;
- `grep -oE ": string\b" compiler/emit_mono.vl | wc -l` gives 634;
- `grep -oE "\bemit(List|Str)IdxGuard\w*\(" compiler/*.vl` gives 9 + 5 + 3 + 3.

### A.4 Refusal classes, by message

Each site in `sites.json` is classified by the first regex its template matches, in this order:

```
A kind:   expected|unexpected|unknown|unhandled|no (lowering|arm|case)|not a |wrong|mismatch|kind|valtype
B miss:   no interned|no row|not collected|carries no|has no|no (slot|shape|entry|index|pin|member|minted|resolved|struct|type|cell|rep)|unregistered|not registered|missing|never|not found|was asked
C admits: not supported|unsupported|not yet|yet\b|cannot|can.t|no way|not lowered|not built|does not (lower|support)
D limits: encodable|overflow|too (many|large|long)|leb|exceeds|limit|non-ascii|section
```

That gives A 199, B 244, C 63, D 7, and 337 in none.

The construct of a site is its enclosing function's name, matched in the order of §6.2's list.
The temporaries count is the templates that match `re-?read|reread|read twice|twice|non-binding|not a binding|operand`,
which is 31. Because the classes are message classes, a site can be counted in the wrong class.

### A.5 Pass sizes

A pass's size is its reachable set: the transitive closure of same-file function names mentioned in
the pass's body, starting from the pass's root function, with line counts summed from the index.
For example, `dispatchRewrite` reaches 47 functions and 1,278 lines.

### A.6 The claimable proxy

For each function, strip `//` comments, then record which features its body uses:
- member access `[\w\)\]]\.[a-zA-Z_]`;
- indexing `[\w\)\]]\[`;
- a string `"`;
- `for`;
- an object literal `\{\s*\w+\s*:`;
- an array literal `(=|\(|,|return)\s*\[`;
- `??` or `?.`;
- `is` or `as` followed by a type;
- `match`;
- `=>`.

The features are admitted cumulatively in §5.3's order, and the column reports the functions whose
features are all admitted. This is a proxy over source functions, not over instances or IR
coverage.

### A.7 Checker-side capability literals

```
grep -ohE '"[^"]*(has no lowering|not built yet|not yet supported|not supported by codegen|cannot hold both)[^"]*"' compiler/check_*.vl | wc -l   # 14
```

Those literals are in 7 files: `check_annot_resolve.vl`, `check_bind_adopt.vl`, `check_demands.vl`,
`check_fit_rules.vl`, `check_leaf_steps.vl`, `check_ty_relate.vl` and `check_union_arm_msgs.vl`.
