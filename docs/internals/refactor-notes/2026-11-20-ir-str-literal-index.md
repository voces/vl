# IR: an index into a string literal (2026-11-20)

`blockers index receiver` named 29 self-compile functions, every one a read `"..."[i]` whose
receiver is a string literal rather than a variable. Legacy writes the literal at its use, as it
writes any string operand, and its index arm (`idxArmOf`) is `string`.

## The change
- `buildIndex` admits an `OStr` receiver when `idxArmOf` is `string`; any other literal receiver
  stays a miss.
- Rule 8's operand match (`sameOpnd` in `ir_verify_bounds.vl`) pairs two `OStr` operands only when
  they are the same literal node at the same rep, so a check and a read of two literals with equal
  text never pair. `irBoundsStrSelfTest` pins both faces.

## Measured on fixpoint seeds: merge-base `f2ec7aa7c` (#9252) against this branch

| | before | this branch |
|---|---|---|
| self-compile `blockers index receiver` | 29 | 0 |
| self-compile functions claimed | 18,329 | 18,358 |
| distilled functions claimed (`--claims`) | 40,548 | 40,548 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,519 identical, 0 differ.
- **Mode 3:** 0 differ, and the self-compile identical.
- **L2 fuel**, same box: 103,372,769,647 → 103,381,542,495 (+0.008%).
