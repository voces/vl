# Step 7, lane H: a push destination's kind is read off the element type, 2026-11-12

`pushDestVKind` (`wasmEmit.vl`) is the `.push` value slot's kind (D1197). It decoded the
ref-list element-kind table:

- `rlElemKindAt`'s `RLK_STRUCT`, `RLK_MAP` and `RLK_CLOSURE`;
- `rlElemListRepAt` for the lists.

It was one of the five codecs `vkind-census.vl` lists outside the descriptor. This change reads
the element type's rep (`repOfTy(rlElemTyIx[slot])`) instead.

The base is master `3293f74c`, with a fixpoint seed on both sides.

## Census

The probe compiler was scratch, never refreshed into a seed. Its accumulator was emptied per
program and the channel was checked against a control. The population is the sweep's, 24,070
programs. Each row is a (decoder's answer, element type's covered rep) pair, counted in programs:

| decoder | type's rep | programs |
| --- | --- | --- |
| struct | struct | 185 |
| closure | closure | 96 |
| map | map | 67 |
| reflist | reflist | 27 |
| list | list | 22 |
| variant | variant | 21 |
| strlist, f64list, f32list, i64list, u8list | the same | 13, 8, 3, 2, 1 |
| null | union | 114 |
| null | nulstruct, nulvariant, nulclosure, nulu8list, nullist, nulf64list, nulreflist | 13, 3, 2, 2, 1, 1, 1 |
| null | no type | 1 |
| **struct** | **variant** | **4** |

The 4 programs where the decoder says `struct` and the type says `variant` are union arms stored
in a struct row. Two of them are `tests/cases/soundness/arm-literal-through-a-list-conduit.vl`
and `tests/cases/arrays/arm-element-list-mutation.vl`. This is a storage fact, the same fact
`ifExprRefKindOf`'s rung reads: the slot holds the struct row's ref. The rung stays.

## What changed

`pushDestVKind` answers as follows:

- null for a nullable element (the stored `rlElemNullable` column, as before);
- null for no type or an uncovered rep;
- `struct` for a `variant` rep stored in a struct row (`rlElemStructRow`);
- the rep itself for `struct`, `variant`, `map`, `closure` and any non-null list;
- null otherwise: the union box, and the nullable niches.

`RLK_MAP` and `rlElemListRepAt` lose their last importer in `wasmEmit.vl`.

## Measurement

- **Sweep** (`sweep.vl diff`, fixpoint seeds on both sides): 24,184 same, 0 bytes-only movers,
  0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- **Seed:** 6,722,239 → 6,722,379 bytes (+140), a fixpoint.
- **vkind-census:** codecs 5 → 4. `pushDestVKind` is now "descriptor read + own rungs", the
  rung being the struct-row storage fact. It has no row in the census's `RULED` table. Ruling it
  by design, as `ifExprRefKindOf`'s variant rung was ruled, is the coordinator's call.
