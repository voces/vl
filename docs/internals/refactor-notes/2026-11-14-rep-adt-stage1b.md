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

## Stage 1b: what it did, measured

### 1. A record's arm status comes from the checker and elaboration alone

**Before.** `repTyIsVariant` answered "variant" when the checker's member set held the type, or
when its canonical shape carried any of three bits (`rvsAdd`):
- bit 1, the checker's members (`cVariantMemberTyIxs`);
- bit 2, the emitter's own variant rows (`uVarTyIx`, minted by `mintVariantRows`);
- bit 4, elaboration's union-arm types (`elabInstUnionArmTys`, primed before emit).

Bit 2 made a record's rep depend on emit-time registration. Every bit-2 registration also
dropped the tree.

**Measured first.** An armed probe tallied, per record type, whether the arm answer held without
bit 2.
- On the self-build, all 175 arm types were backed by bit 1 or bit 4. All 67 `variantBit`
  rebuilds were bit 2. Bit 2 dropped the tree without ever changing an answer.
- On the corpus, 58 programs had an arm answer on bit 2 alone. These were record literals stored
  as arms:
  - a union nested inside a list, map or field type (`d361e*`, `d223e*`, with arms such as
    `{r: {c2: i32}}`), which elaboration's node scan did not descend into;
  - a union boxing a record beside a non-record (`d2781_*`: `{a: string | i32} | string`;
    `fz_a_*`: a record beside a function), which the scan's two-records rule excluded.

**The change.**
- Elaboration's prime walks every node type to depth 4 (`elabBoxedUnionsInto`). At a written
  annotation (a `TypeRef` node) it counts a value box holding a record beside any other member
  (`elabBoxesARecord`). At an inferred type it keeps the two-distinct-records rule.
  - The annotation-only limit is the measured one. Counting the wide rule at an inferred type
    broke `closures/void-seeded-let-written-value-fn-called-at-two-types.vl` and D15031
    (`runs` → emit reject). There, the call tuples `{ a: 1 }` and `3` make an inferred
    `{a: i32} | i32` that is never a box row, because the generic is instanced per call type,
    so the primed arm had no row.
- `repTyIsVariant` reads bits 1 and 4 only, and a bit-2 registration no longer drops the tree.
- `mintVariantRows` still keeps its rows, which `repVariantShapeRowOf` reads for which row,
  not whether it is an arm.

**Result.**
- Self-build: byte-identical (fixpoint). Rebuilds fall from 70 to 12. The 9 remaining variant
  drops are bit 4, elaboration's pre-emit set applied lazily.
- Corpus, all 12,029 cells: built by a seed of the master commit this branch merges (itself a
  fixpoint) and by this branch's seed. 0 exit codes changed and 0 module bytes changed. The probe
  finds 0 emitter-only arms. **No byte movers.**

**Cost** (same seed pair):

| | |
|---|---|
| net compiler lines | +106: `emit_elab.vl` +74 (the walk and the wide rule), `emit_rep.vl` +29 (`RNoValue` and its arms, the arm probe), `emit_vk_shadow.vl` +3, `lint.vl` 0 |
| pin-helper delta | 0 (baseline 908) |
| guest fuel (`plumb-shape-cost.vl`) | main 9,020,596,426 → 9,041,958,578 (+0.24%), tail 6,535,300,926 → 6,550,678,944 (+0.24%): the prime's nested walk over every node type |
| peak live heap | main 120,257 → 120,061 KiB (−196), tail 84,308 → 84,104 KiB (−204): fewer tree rebuilds |
| seed size | 6,873,417 → 6,875,227 bytes (+0.03%) |

What remains on the variant axis during emit:
- The bit-1 and bit-4 drops, which are pre-emit facts applied lazily when the bits are first read.
- `rvsSync`'s whole reset (the `variants` cause, 18,657 corpus rebuilds after the `passes` phase),
  keyed on the pass and `uVarTyIxResets`.

With bit 2 no tree input, a reset keyed on `uVarTyIx` no longer needs to drop the tree. That is
the next cut, and stage 2's gate. It is left out of this PR because its keying also serves
`repVariantShapeRowOf`'s rows, and splitting the two needs its own measurement.

### 2. `never` is a node of its own

`never` builds an `RNoValue` node in place of the `unsup` leaf `prim:never`. Every projection
answers for it as it answered for `unsup`, so no flat answer moves. The shadow now reports the
three `d947` cells' `std:test` results as `noValue`, not `uncovered`.

### Shadow, after 1b (corpus, 8,662 programs reaching emit)

- 185,243 entries agree, and 6 results read `noValue`.
- The 6 `variant tree=struct` locals from the stage-1a triage remain. They are a literal's
  recorded type, stage 2's input.
- New since stage 0, and present with the pre-1b seed too: cells master added in the meantime,
  all already-filed defects.
  - `d16364_ies_two_instances_unann` (invalid wasm) reads `f64list tree=list`, the very list type
    the validator rejects.
  - `dord037` (invalid wasm in `mkStruct`) reads `uncovered map` for that result, where the flat
    `i32` default meets a map ref.
  - `dord032` (wrong value) reads `struct tree=variant` on two parameters.
  - `dord003` and `dord029` (traps) read `i32 tree=closure` results.

  The shadow localizes these defects to a kind disagreement. They are stage 2's to grade, where
  the tree's answer becomes the one emitted.
