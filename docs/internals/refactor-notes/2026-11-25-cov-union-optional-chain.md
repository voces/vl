# IR coverage: `?.` chains (lane COV-UNION, 2026-11-25)

`optional read chain` (10 rows) and `coalesce optional place` (13 rows) of the I8 census
(`2026-11-25-ir-i8-census.md`), on a fixpoint of master d27b5082.

## Mechanism

Legacy writes a `?.` over a chain link by link: `emitOptChainIsNull` tests each link's receiver,
then the link's own field where it has a null, and `emitOptChainValue` reads the root, recovered,
then each link's field (`struct.get`, `ref.as_non_null`). The IR built only one link over a
re-readable base and missed any receiver that was itself a `?.`.

- The builder builds the chain's root (`optChainRootOf`), with the single-link checks applied to
  the root, and the lowering walks the links as legacy does (`optChainIsNullAt`,
  `optChainValueAt`). Each link's value tail is one shared writer, `emitOptLinkValueTail`, which
  `emitOptChainValue` now calls too.
- Each such read is recorded (`irReadOpt`). `irHoistRecv` can then write a `?.` receiver again
  whole, root read again from the first read on, as `emitOptRecvBase` re-emits it. A `?? d` whose
  `?.` receiver is a chain (`a.b?.c?.d ?? e`) reads it again in its present arm.

## Census, cut to the 19 programs (rows = unclaimed distinct functions + start bodies)

| population | before | after |
|---|---:|---:|
| tests/cases (16 programs) | 17 + 12 = 29 | 9 + 5 = 14 |
| witnesses (3) | 1 + 2 = 3 | 0 + 1 = 1 |

`optional read chain` 10 → 0; `coalesce optional place` 13 → 3. What is left is mostly
`null test optChain` (7, COV-IS's) and `coalesce optional record field` (3, COV-CALL's), there
before; unmasked: `optional read staged` 1, `map get rep` 1.

## Position sweep (Q58)

`tests/cases/expressions/optional-chain-links-in-each-position.vl`: two- and three-link chains
over a local, a parameter, a field and a global, standalone and under `?? d`. 75 of 76 matched,
both start bodies matched; the one left misses `box of a valued if`. Claimless-identical, as are
the 18 class programs.

## Not taken

The staged receiver (`optional read staged`, `coalesce optional staged receiver`): legacy tees a
non-re-readable root into its `?.` stash (`optRecvStageMark`, `emitOptRecvBase`), with a
save/restore discipline for nested chains. Next batch.
