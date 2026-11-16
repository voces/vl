# Rep ADT stage 4b, part 1: the heap shadow reads 10 different-layout merges by class (lane REP)

[Stage 4a](2026-11-16-rep-adt-stage4a-heap-shadow.md) counted 151 struct-row merges that a
rep-keyed `heapOf` would make across different layouts. Its layout spelling compared each field's
element by NAME, so two rows whose element rows were twins (`A0` vs `B0`, `#anon0` vs `#anon2`)
read as different. This part fixes the instrument and names the classes. Unarmed, nothing moves.

## The change

`compiler/emit_heap_shadow.vl`:
- A field's element is spelled by the `tyRepId` of its recorded element type
  (`sFieldElemTyIx`); a field with no recorded type keeps its name.
- An atom code's literal set (codes 0, 4, 30, 3) is not spelled. An atom's code is global to its
  text (`litAtomId`), so two literal sets store one atom alike.
- A different-layout struct merge is labelled `function field` (the rows differ at a field one
  stores as a closure), `hole or generic instance` (either row is typed at a type variable,
  `repRowAtTyVar`), else `unnamed`.

## Readings

Armed (`$VL_REP_SHADOW`) over `tests/cases`, `std` and the distilled `cells/` and `named/`
(20,588 files, `vl run --batch`), master 4947de739 plus this change:

| table | rows | same-layout merges | different-layout merges |
|---|---|---|---|
| struct | 22,481 | 1,154 in 493 files | **10 in 9 files** |
| ref list | 10,936 | 13 in 9 | 0 |
| map value | 3,789 | 32 in 32 | 0 |
| union | 18,723 | 0 | 0 |

The 10 by class:

| class | merges | files | closed by |
|---|---|---|---|
| function field (closure vs set id) | 5 | 4 | slot-store stage 3 (lane SLOT) |
| hole or generic instance | 5 | 5 | the instance in the rep (D16720's class), REP's next stage |
| unnamed | 0 | 0 | |

The 144 name-only merges 4a counted, and the 7 alias twins (`Circle`/`Dot`, `R|null`/`S|null`),
now read as same-layout. The one 4a-era merge in `tagged-arm-nullable-field-literal` was an atom
field naming two literal sets. Lane SLOT's `slot-2b3-d` (9099b3d7c, merged with master) read
the same 153 / 32 files as master under the 4a instrument, so the flip does not move the shadow.

## Proof

- Unarmed identity: `corpuscmp.vl` against a master fixpoint seed, 8,379 modules, 0 differ,
  0 lost.
- The seed is a fixpoint; `scripts/gate.sh` passes.

## Next

Part 2 keys the struct table by rep with the two classes kept on their spelling key, and
`emitFail`s on an unnamed different-layout merge under the shadow.
