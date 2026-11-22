# IR coverage: a niche cell's `??` re-reads its operand as built (2026-11-22, lane IR-N1)

`o[i] ?? false` over a `(boolean | null)[]`, and `g ?? true` over a global, are legacy's
`emitCoalesceNicheCell`, whose present arm re-emits the operand (`reEval`, where `coalLhsStashes`
does not stash it). The IR's `coalNicheCell` re-read only a variable, so a list element's read or a
global's, a temp, left it `coalesce niche place`. Stacked on #9485, whose re-read it extends.

## What landed

- **`irReadElem`** (a new `IrFn` table): `buildIndex` records the `RListGet` it built where its
  receiver is a variable and its index an immediate or a variable (`readsAgain`). The lowering's
  `irHoistRecv` writes a recorded read again through `rhs`, which banks its element-read row as
  legacy's second `emitExpr` does. A pure read built twice by the node's own shape, minting
  nothing per build (the coordinator's ruling); the bounds-check node writes no bytes.
- **`recvReadsAgain`** also takes a recorded element read, and the niche cell admits a temp operand
  where it holds; the present arm re-reads through `opndAgain` (`irHoistRecv` for a temp).
- **Side effect:** `irHoistRecv` is shared with the loop-prologue header hoists, which may now
  write a recorded element read again where they missed before. `--claimless` and `--cases` show
  0 differ.
- `coalesce-niche-cell.vl` pinned the miss (`uncovered coalesce niche place >= 1`); its function
  now covers, so the pin goes and its floor rises to 9.

## Coverage

Measured on fixpoint seeds of this branch and of its parent (#9485 with master `a1270d7b`
merged), each building this branch's source.

| population | parent | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,749 | 19,751 |
| corpus with no blocker (45,678) | 45,028 | 45,028 |
| `tests/cases` covered / matched (armed shadow) | 68,121 / 68,120 | 68,131 / 68,130 |
| `tests/cases` start bodies covered / matched | 5,669 / 5,668 | 5,673 / 5,672 |

`coalesce niche place` falls from 8 rows to 0 and from 8 start rows to 2 (a global list's element,
whose receiver is a temp); `coalesce field place` from 7 to 2. The armed shadow adds no fail,
differ or mismatch row (the one fail row, `generics/hole-map-tail-value.vl`, is on master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,609, differ 0, witnesses same 60;
  `--claimless` identical 14,018, fail under both 3,267, differ 0; `tests/cases` A/B same 8,723,
  differ 0.
- **Fuel:** L2 self-compile per PR +0.05% on master `a1270d7b`.
