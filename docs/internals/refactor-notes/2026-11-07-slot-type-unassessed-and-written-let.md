# Slot type's 15 unassessed, and the written-let gate and type

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Slot type's 15 unassessed, measured** (2026-11-07, 23,456 programs, master `7a471b8c`).

Each function's answer was compared with the stored slot fact `elabSlotTyAt(holder, path, frame)`,
by type (`tySame`) and by spelling:

| function | same | differ | mono only | elab only | both none |
|---|---|---|---|---|---|
| `monoPinFieldContainer` | 6 | 0 | 2 | 80 | 113 |
| `monoPinObjFields` | 6 | 0 | 0 | 171 | 856 |
| `monoPinStoredRecords` | 14 | 0 | 7 | 3 | 1 |
| `monoLetWritesAt` | 77 | 0 | 0 | 0 | 0 |

The same answers also spell the same. What each of the 15 comes to:

- **Deleted here:**
  - `monoListSrcElemTy`, its arm and `mfrListSrc`. It answered nothing in 23,456 programs: the map
    was keyed by the original `Index` read, and its one caller passes the read the flow rewrite
    minted.
  - `monoLetWritesAt`'s per-write type walk. A `let` now passes where its slot fact is `t`, and the
    elaboration closes that fact only where every write agrees. It keeps recording a fresh `Map()`
    write at `t`.
- **Lane F's switch:** the record-field trio (`monoPinFieldContainer`, `monoPinObjFields`,
  `monoPinStoredRecords`), with `monoPinFieldValue` delegating. Mono's gate decides whether to
  pin, and the slot fact gives the type. The 254 elab-only decisions are not acted on, and the
  D15494 cells are a named fallback.
- **(c):**
  - `monoWritesCoercedFirstCall`, a walk-order gate ("no call has given it a signature yet"). It
    reads the call-signature table that lane F's c89 rewrites, so it is rechecked against that.
  - `monoRetypeLamCells`, which retypes capture cells the capture rewrite generates. The
    elaboration has no node for them.
  - The two delegators, `monoPinFieldValue` and `monoPinFieldContainers`.
- **Already settled:**
  - `monoSigJoin` and `monoPinJoin`, deleted by #6626.
  - `monoRenameInitAt`, recorded as (c) there.
  - `monoNoteBindCall`, inlined by c89.
- **Blocked:** `monoLetWritesClosed`, on split-dep's written-value reader. Its gate is that each
  write reads a binding already closed. 5 decisions (D9182) are no for mono and closed for the
  elaboration.
- **Parked:** `monoReachLitTys`, with `monoReachSlotTy`.

**Written-let gate and type, measured** (2026-11-07, 23,456 programs).

The gate, `monoWrittenGenLetFrame`, was shadowed against `elabBindingFnSet(d)`, read before the
walk retypes the values the set is read from. Its first reading (109 of 112) was taken after the
walk and is void. On split-dep's #6631 head, every one of 112 decisions agrees:

| mono | elaboration | decisions | files |
|---|---|---|---|
| needs instancing | every member a named `monoIsGenericDecl` function | 40 | 10 |
| no | empty, a lambda, or a non-generic member | 72 | 29 |

- **Switched in #6631:** the gate reads one snapshot of that set, taken before the walk. Hole
  functions count, as `monoIsGenericDecl` admits them. `monoArmWrittenLetSeed` reads the
  switched gate.
- **Deleted:** `monoLetSeedGenFe`, `monoListElemGenFe` and `monoValueNamesGenOrInst`.

The type, `monoCoerceWrittenLetTys`, was shadowed against the per-read fact `elabSlotDeliveries`.
The slot fact is the wrong reference: a written `let` of generics has no one closed type.

| site | agree | parameters agree, result differs | no elaboration answer |
|---|---|---|---|
| delivery (115) | 85, + 15 one of two | 14 | 1 |
| by call (51) | 25 | 0 | 26 |

- **Result-only differences are not a defect.** The by-call site spells the binding's signature
  with an unpinned `void` result and takes the call's own result. Its parameters come from
  `monoDeclPathPins` and agree.
- **Blocked on Fn#d's scoping note** (the concrete rep of a function-holding value at a site): the
  27 with no answer. Each signature takes a hole function as a parameter, which no closed delivery
  carries; D5841 and D6480 are among them. Once that fact exists, all four callers that pass
  `tname` switch together.
- **Switched in #6645, the by-call site** (the call through the binding that takes the chosen
  instance's signature). `tname` is `elabKeySig` of the member keys `elabValueInstKey` gives the
  binding's read. By `sigKeyOfTy` against mono's signature, 42 decisions agree, 0 differ and 9 have
  no key. The 28 that differ in spelling are a hole parameter written as its pin (`=>i>i` against
  `(i32)=>i32`) or bracketed.
- **The fallback is deleted.** The 9 with no key read the written `let` in an alias's initializer
  (`const k = lap`, then `k(...)`), and the call's own callee read carries the key; all 9 agree. The
  call reads the binding's keys, else the callee's, inside `monoCoerceWrittenLetTys` after its gates,
  so only a call it coerces asks. Of the 1,917 calls that reach the site, the 51 the gates pass all
  have one closed signature: 42 from the binding's keys, 9 from the callee's.
- **The delivery path stays mono's.** `elabValueInstKey` reads none at 99 of its 115 decisions: a
  delivered read is not a callee read, so no member key is noted on it.
- **The hole-function argument is not switched: it replaces nothing.** Its read agrees at 59, differs
  at 0 and is none at 49. But the by-call signature already comes from the binding or callee keys,
  so no mono derivation is left for it to replace.
- **Parked: `monoCellCall`, the capture-cell call.** It makes 10 type decisions, all at its
  named-generic seed: D12213 ×2, `closures/captured-cell-shared-writer-hole-lambda-alias` ×4 and
  `closures/nested-generic-written-into-capture-cell-at-two-instances` ×4. No elaboration fact
  answers them. The call reads the cell `cell[0]` that the capture rewrite generates, and that read
  has no source node. Neither the original captured read nor the binding's function set carries a
  key. The missing fact is a per-instance signature for the cell read, keyed through the captured
  binding's declaration at the capture frame's key, which the elaboration would have to mint.
  `monoInstParamPinTys` stays for this site.
- **Parked: `monoInitHeldTy`, adopt-init's held type.** It hands `monoBindingAdoptInit` mono's
  current column for the initializer, and every program its deletion moves is a map holding hole
  functions. The binding's slot fact (`elabSlotTyAt`) answers 27 decisions in 5 of those programs
  and differs at none. Three programs have no fact: `fn-value-generic-handed-from-call-map-or-repointed-let`,
  `hole-fn-generic-map-stored-through-parameter` and `hole-fn-generic-in-map-called-at-two-types`.
  The stored values are top-level named hole functions, which the per-instance lambda bank
  (`elabLamSigAt`) does not record. The missing fact is the held value's member-instance key: which
  instances of the named function the map's stored value reaches (the `elabValueInstKey` family).
  Where the stored function is called at two types it reaches several keys, which is MULTI,
  prerequisite A. Deleting the function loses `hole-fn-generic-in-map-called-at-two-types`,
  which then traps.
- **Deleted: the cell's hole-lambda seed arm**, with `monoCellSeedLamFe`. It never fired: under a
  loud floor, no program in the 23,456-program census reached it, and 0 programs moved.
