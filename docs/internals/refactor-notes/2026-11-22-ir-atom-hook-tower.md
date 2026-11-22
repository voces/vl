# IR coverage: `pre-path atom hook`'s two-member place (2026-11-22, lane IR-N8)

The second family of `pre-path atom hook` (the census is in
`2026-11-22-ir-atom-hook-sole.md`): a literal place narrowed out of a mixed box, as in
`type M = 1 | "a" | "b"` read past `m != 1`, into an atom destination. Its narrowed read is the box's
string payload; without the number arm the place reps as the atom and is covered. 28 `tests/cases`
functions in 16 files on master 14d707ae.

## Design

- **Tails (`wasmEmit.vl`).** `emitStrToAtomChain` writes the same bytes through
  `strToAtomIdTail` (member `i`'s id) and `strToAtomTestTail` (the string compare against member
  `i`, then `select`), over `strToAtomTexts`, the plan's members.
- **`RStrToAtom { saReads, saAt }`**, family `other` (shadow only), on `strToAtomArmOf`'s `chain`
  arm. The lowering writes every member's id, then from the last tested member to the first its
  read and test, the chain's byte order.
- **Builder (`atomTower`).** A local's string read (`identRead` at a string, the box's payload)
  built once per tested member, last first; a second build only of a read with no effect
  (`exprEffectFree`). Each read temp is typed at the string legacy reads.
- **Verifier.** The reads are strings, at least one; the destination an atom (self-tests 28, 29).

## Measured

Against #9583's head d70392a1 at its fixpoint:
- `tests/cases` covered = verified 69,490 → 69,510 (+20), matched 69,489 → 69,509; corpus
  unchanged at 45,255;
- `ir-identity --cases`, `--claimless` and `--names` differ 0 (the tail split is byte-identical:
  `--names` self-compile identical); the legacy A/B differs 0;
- L2 fuel per PR +0.14%, source growth: the same-tree pair is +0.0004%.

The row `tests/ir-shadow-rows/atom-hook-tower.vl` has 5 functions, 4 of them `pre-path atom hook`
on the base seed, all covered and matched here, including a three-member tower with two reads.
