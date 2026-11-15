# Rep ADT: stage 2's gate, the variant axis at zero during emit, 2026-11-15 (lane E)

This note continues [the stage-1b note](2026-11-14-rep-adt-stage1b.md). That note closed with stage
2's remaining gate: `rvsSync`'s whole reset still dropped the rep tree during emit. This change
removes that drop.

## The change

After stage 1b, the tree reads only bits 1 and 4 of a shape's variant bits: the checker's members
and elaboration's union-arm types. `rvsSync` still reset its whole bit table, and dropped the tree,
whenever any of three things happened:
- the pass moved;
- `uVarTyIxResets` moved;
- one of its source lists shrank.

After a reset it re-adds bits 1 and 4 from the same lists, so they are the same bits. Each re-add
still dropped the tree a second time (`variantBit1`, `variantBit4`).

Now:
- `rvsTreeBits` keeps, per canonical shape, the tree-input bits any build of this program has met.
- A whole reset no longer touches it.
- `rvsAdd` drops the tree only for a bit new to it.
- The one source whose shrinking removes an arm, the checker's member list, still clears it and
  drops the tree.
- It is cleared per program in `repReset`. Canonical ids are stable within a program, since
  `hcReset` runs once at its start.

The tree's own axes (`tyMutEpoch`, `cUserTypesVer`) still rebuild it through `rtSync`. A type
mutation therefore still refreshes any arm answer that depends on the mutated type.

## Measured

Both seeds are fixpoints of the same master commit (`e1458f7d6`), one with this change and one
without.

| | before | after |
|---|---|---|
| self-build: tree rebuilds | 12 | 3 (`first`, 2 `declRows`, all in `passes`) |
| corpus (12,029 cells, 8,677 reach emit): rebuilds after `passes` | 26,494 | 1,500 |
| — `variants` (the whole reset) | 18,696 | **0** |
| — `variantBit1` / `variantBit4` (re-adds) | 3,352 / 4,339 | **0 / 0** |
| — `declRows` | not seen (masked by later variant drops) | 1,393 |
| — `tyMutEpoch` | 107 | 107 |
| corpus exit codes / module bytes changed | — | **0 / 0** |
| self-build bytes | — | identical (fixpoint) |
| guest fuel (`plumb-shape-cost.vl`) | 9,041,958,646 / 6,550,679,012 | 9,042,805,603 (+0.009%) / 6,551,251,693 (+0.009%) |
| peak live heap | 120,061 / 84,104 KiB | 120,062 / 84,105 KiB |

**Stage 2's gate, as the coordinator ruled it: the variant axis during emit is 0.** Two causes
remain after `passes`. Neither is a variant drop.
- **`declRows`, 1,393.** `repDeclRowsPending` marks the record types about to get declared struct
  rows, and `repVariantShapeHas` reads that set through `repTyHasDeclRow`. It is one more
  emit-state input to an arm answer. Its drops were hidden before: a rebuild is labelled with its
  last drop, and that used to be a variant one. Making a declared row a fact the tree does not
  read is the next cut, the same kind as stage 1b's bit 2.
- **`tyMutEpoch`, 107, in 103 programs.** Lane H's #8073 (per-instance holes) owns these.

Net compiler lines: +10 (`emit_rep.vl` +20 −10). Pin-helper delta: 0.
