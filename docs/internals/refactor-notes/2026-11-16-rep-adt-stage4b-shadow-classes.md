# Rep ADT stage 4b, part 1: the heap shadow reads its merges against today's heap key (lane REP)

[Stage 4a](2026-11-16-rep-adt-stage4a-heap-shadow.md) counted 151 struct-row merges that a
`tyRepId`-keyed `heapOf` would make across different layouts. It compared each field's element by
NAME, so two rows whose element rows were twins (`A0` vs `B0`, `#anon0` vs `#anon2`) read as
different. It also called a pair "same layout" whenever the codes agreed, even where today's heap
key keeps the rows apart. This part fixes both and names the classes. Unarmed, nothing moves.

## The change

`compiler/emit_heap_shadow.vl`:
- A field's element is spelled by the `tyRepId` of its recorded element type
  (`sFieldElemTyIx`); a field with no recorded type keeps its name.
- An atom code's literal set (codes 0, 4, 30, 3) is not spelled. An atom's code is global to its
  text (`litAtomId`), so two literal sets store one atom alike.
- A merge reads as same-heap only where today's twin key joins the rows: neither is an arm's ref
  row (`sIsRefRow`), and their `repHeapId` (`slotHeapId`) and `structFieldCodesEq` agree.
- Every other merge is labelled:
  - `discriminating arm row`: either row is a union arm's ref row. A union tests its arms by
    struct identity, so an arm keeps its own heap (coordinator ruling).
  - `function field`: the rows differ at a field one stores as a closure, or hold a function.
  - `hole or generic instance`: either row is typed at a type variable (`repRowAtTyVar`).
  - `unnamed`: anything else.

## Readings

Armed (`$VL_REP_SHADOW`) over `tests/cases`, `std` and the distilled `cells/` and `named/`
(20,588 files, `vl run --batch`), master 4947de739 plus this change:

| table | rows | merges, same heap today | merges, kept apart |
|---|---|---|---|
| struct | 22,481 | 1,119 in 473 files | **45** |
| ref list | 10,936 | 13 in 9 | 0 |
| map value | 3,789 | 32 in 32 (two map heap types today) | 0 |
| union | 18,723 | 0 | 0 |

The 45 struct merges by class:

| class | merges | files | closed by |
|---|---|---|---|
| discriminating arm row | 18 | 16 | kept by design |
| function field | 5 | 4 | slot-store stage 3 (lane SLOT) |
| hole or generic instance | 22 | 15 | the instance in the rep (D16720's class), REP's next stage |
| unnamed | 0 | 0 | |

Of the 1,154 same-layout merges 4a's spelling found, `buildStructTwins` already joins 1,119.
`tyRepId` is the looser key: it fuses rows `repHeapId` (function set groups, per-instance rows)
or the element descent of `structFieldCodesEq` keeps apart. Lane SLOT's `slot-2b3-d` read the same
153 / 32 files as master under the 4a instrument.

## Proof

- Unarmed identity: `corpuscmp.vl` against a master fixpoint seed, 8,379 modules, 0 differ,
  0 lost.
- The seed is a fixpoint; `scripts/gate.sh` passes.

## Next

Part 2 keys the struct table by `repHeapId` plus layout, an O(1) cache in place of
`buildStructTwins`' pairwise search and `structLateTwinOf`: byte-identical by construction, with
the three classes in its key and an `emitFail` on an unnamed merge under the shadow.
