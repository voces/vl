# IR coverage: `pre-path atom hook`'s staged and `wideLit` arms (2026-11-22, lane IR-N8)

The third and fourth families of `pre-path atom hook` (census in
`2026-11-22-ir-atom-hook-sole.md`), one PR under the 2026-11-22 batching rule.

## Design

- **Staged (`strToAtomArmOf`'s `staged`).** A value that is no place, a call, is built past the
  hook as the raw string `emitExprRaw` writes, then `strToAtomStagedTail` parks it in legacy's
  `atomStageSlot` and writes the tower over it (`RStrToAtomStaged`). The slot is reserved by
  `exprStagesAtomNarrow`, whose conditions are the arm's: not a string literal, not a per-arm
  join, not a re-readable place, not a literal-union alias (`strReppedLitUnionAt`'s
  `!exprIsLitAtom`), and a literal set by type (`tyIsLitUnionOrLit`). The tail still refuses
  loudly without it; over `tests/cases` under the head seed it refuses 0 times.
- **`wideLit`.** A read of a `const` bound to a literal: `emitStrToAtomWide` writes the raw read
  then `strToAtomWideTail` (drop, then the literal's id), byte-identical to the
  `emitStaticLitAtom` path it replaces; the IR builds the read and calls the tail (`RAtomWide`).
- Both nodes are family `other` (shadow only), built in `deliver`'s atom-hook block.

## Measured

Over the class's census files, functions covered (and `pre-path atom hook` misses), base #9604 →
staged → staged + `wideLit`: 637 (18) → 646 (7) → 649 (3); start bodies 24 (11) → 24 (8) → 27
(5). `tests/cases` covered = matched +14; `ir-identity --cases`, `--claimless` and `--names`
differ 0; L2 fuel per PR +0.24%, the same-tree pair +0.00001%.
