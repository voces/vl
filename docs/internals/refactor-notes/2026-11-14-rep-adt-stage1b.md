# Rep ADT stage 1b, and the stage plan after lane Q's L5 design, 2026-11-14 (lane E)

This note continues [the Rep ADT design](2026-11-14-rep-adt-design.md) §3. It builds on stage 1a
([the arena](2026-11-14-rep-adt-stage1-arena.md), #8096). Stage 1b's measurements will be added
here.

## The stage plan, amended for L5

Lane Q's phase-products design (`2026-11-14-phase-products-design.md` §2.1 and §4, #8100) makes two
requests:
- the rep arena lives at session lifetime, so a `RepId` is stable across programs;
- the heap-type cache is split: `RepId` → heap type is a session fact, and the wasm type index
  is per output module (`EmitCtx`).

Both fit this design. They change four stages.

| stage | was | now |
|---|---|---|
| 1b | arm status from the checker; a no-value result | the same, and named as **the precondition for a session-level arena**. A node's inputs must be facts of its type alone. Today two inputs are emit state: the variant bit from the emitter's own rows (`uVarTyIx`, bit 2 of `rvsAdd`) and the registry rows that `rtBoxHasRow` and `rtNulElemListVKind` consult. 1b removes the first. The second moves to stage 4, where box rows become `heapOf` facts. |
| 3½ (new) | — | **The arena moves to session lifetime**, after lane H's stage 4 seals the type arena. `repOf` becomes an array indexed by `TyId`, and `rtSync`, its epoch, the rebuild counter's axes and the `rtKeys` reset per program go. `rtTy` provenance goes with them, once its five readers ask the type through the `TyId` the memo is indexed by. |
| 4 | `heapOf(rep)` interns one heap type per `Heap`, and the slot tables become caches by `RepId` | **two tables.** `heapOf(RepId) → HeapId` is session-level and interned like the reps, and `Heap` values are `RepId`-keyed. `EmitCtx.typeIndexOf(HeapId) → wasm type index` is per output module, minted in first-ask order, so a module's type section is the same as today's. The struct, ref-list, mv and union slot tables are caches on the second table. Their twin columns and spelling keys delete, as planned. |
| 6 | `$fnsig` keys become `RSig` ids | `RSig` ids are session-level. A signature's wasm type index is in the `EmitCtx` table with the other heap types. |

What does not change:
- the ADT's node set (§2);
- the projections (§2.3);
- the emitter's exhaustive match (§2.4);
- the acceptance rows (§4);
- stage 2, which is still gated on the variant axis reading 0 during emit (stage 0 note), and
  which 1b's first item delivers.

Order: 1b → 2 → 3, and H's stage 4 → 3½ → 4 → 5. Stage 6 can follow 3½ at any point.

## Acceptance rows

Lane L froze D4089 to these stages (via the coordinator, 2026-11-14).

| row | outcome | what closes it | stage |
|---|---|---|---|
| [D4089](../inventory/D4089.md) | open. Since lane L's partial-fit check the `is` test runs, but narrowing to `B` stays refused. | After `r is B` over `r: A \| C`, a read of `r.x` at `B` must read a value stored as arm `A`. The narrowed read needs a checker-recorded fact, "`r` is stored as arm `A`", in place of `emitVariantCoerce`/`exprVariantIndex`, which know arms only. 1b records the arm status from the checker (the `RRecord` arm of the storage type). Stage 2 is the first stage where emit reads a node's rep from that fact, at every narrowed-read site. | the arm fact in 1b; the reads in 2 |

The grading list is the row's: the repro; `r: A | C | null`; and the `match` spelling (D4087).
