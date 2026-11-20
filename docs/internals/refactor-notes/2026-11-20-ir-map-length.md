# IR: a map's `.length` (2026-11-20)

`member map` blocked 30 self-compile functions alone, every one `m.length` on a map (a probe naming
the member read's property). Legacy's `emitMemberNode` reads a map's `length` as its live entry
count, struct field 5 (`size`), after the receiver, once no earlier `length` arm takes it.

## The change
- **The decision.** `mapLengthPlain(m, memIx, fnIx)` names when `emitMemberNode` reaches its map
  arm: a map receiver that is no record field, list-fit grow row, arm site, list or string.
  `mapSizeTail(recvIx, fnIx)` is the arm's tail, which legacy now writes through.
- **The IR.** `RMapOp`, unbuilt until now, takes `size`: `mpArgs` the receiver, `mpAt` the member
  read; it moves from the `other` family to `map`. The builder takes a map receiver's `length` on
  `mapLengthPlain`, the receiver read as any map value; the lowering re-asks it, then writes the
  receiver and `mapSizeTail`; the verifier holds a map receiver and an i32 result. Every other map
  op is a named miss.

## Measured on fixpoint seeds: master `585f51b42` against this branch

| | master | this branch |
|---|---|---|
| self-compile functions claimed | 17,710 | 17,739 |
| self-compile `member map`, alone | 30 | 0 |
| distilled functions claimed (`--claims`), all matched armed | 39,604 | 39,610 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,516 identical, 0 differ.
- **Mode 3:** cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against master's seed: 102,506,157,404 → 102,517,843,386 (+0.01%).
- **Lines:** +76 / −11 in `compiler/`.
