# IR: a union of maps delivered as its one map (mapUnbox), 2026-11-22

Lane IR-N4. A union of maps whose members all store as one map (D2692, D15540) is delivered as
that map: legacy builds the box, then `emitMapUnionPayloadTail` casts the box's payload to the
map's struct. The IR's node-keyed coercion route (`coerced`) admitted only `listCopy`,
`mapRetag` and `recCopy`, so a `mapUnbox` node missed with `pre-path coercion mapUnbox`.

## Change

- **One decision.** `mapUnboxTailTy(exprIx, fnIx)` (`wasmEmit.vl`) returns the map the value is
  delivered as, or -1 when the value is no union box (delivered as built). Legacy's
  `emitCoerced` asks it before the value, where it asked `exprUnion` inline. `coerceTail` gains a
  `mapUnbox` arm that asks it again after the value, as its `mapRetag` arm asks `exprUnion`.
- **One tail.** `mapUnboxTail(exprIx, dstTy)` writes the payload cast (or nothing at -1). It is
  the tail of both legacy's arm and `coerceTail`'s.
- **The IR.** `coerced` admits `mapUnbox`. `coercedTy` gives the delivered type:
  `mapUnboxTailTy`'s map, held at this instance, or the node's own type for a value that is no
  box, whose built rep must then be that type's (the `mapRetag` check, now shared).
  `RCoerce`'s lowering already calls `coerceTail`.

New admission predicate (R8): `coerced`'s `mapUnbox` arm calls `mapUnboxTailTy`, legacy's
decision, and restates nothing.

Compiler lines +36 / −8 (`wasmEmit.vl` +19 −5, `ir_build.vl` +17 −3). The shadow row
`tests/ir-shadow-rows/map-union-unbox.vl` delivers `LM | IM` as `{[i32]: T}` at a parameter, a
call result and a module global.

## Readings (base: fixpoint seed at master `2de2ffc1`; candidate fixpoint)

| reading | base | this step |
| --- | ---: | ---: |
| armed `tests/cases` covered = matched + 1 pre-existing | 66,856 | 66,859 |
| armed `tests/cases` start covered = matched + 1 pre-existing | 5,412 | 5,414 |
| `tests/cases` `pre-path coercion mapUnbox` (any) | 8 | 0 |
| corpus covered = verified = matched | 44,792 | 44,792 |
| corpus IR claims | 44,646 | 44,646 |
| self-compile covered = matched | 19,634 | 19,634 |
| L2 self-compile fuel | 108,665,384,061 | 108,666,033,930 (+0.00%) |

Three files gain coverage and none loses. The fail and mismatch rows are the same on both
seeds. Of the four files that held the class, two now stop at other classes (`map get rep`,
`map read mv`). `ir-identity.sh --cases`: 7,601 identical, 0 differ. `--claimless`: 14,017
identical, 0 differ.
