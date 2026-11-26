# A `for ... in` over a narrowed union global's map (lane COV-UNION, 2026-11-26)

## The refusal

`const u: {[i32]: i32} | string = Map()`, then `if u is {[i32]: i32} { for k in u { ... } }`.
The walk's receiver names a global (`mapRecvGlobalIx` >= 0), but `mapGlobalOf` refuses it, because
the global's declared rep is the union and not a map. The builder skipped it
(`for in map receiver`), and the lowering refused it too (`walk map receiver`).

## The change

- **The builder** no longer skips such a receiver. It builds it as an operand (`irBExpr`), which
  reads the global narrowed to its map, as every other map operation's receiver already does.
  `mapRecvRepOk` still requires that operand at a map rep.
- **The lowering's operand arm** writes the receiver, then legacy's recovery (`mapRecvRefTail`,
  a `ref.as_non_null` for a nullable map), the stash and the list, as it does for a local
  receiver.

Since #10329 bytes are not a gate. Here they also did not move: `ir-identity --cases`
informational byte differences are unchanged.

## Measured

Each arm runs from its own checkout: master `fa5d6e86e` from a base worktree, and this tree. The
population is tests/cases plus regen-10's COV-UNION programs.
- `for in map receiver` 3 → 0. No other class moved.
- tests/cases:
  - unclaimed start bodies 125 → 122;
  - programs fully claimed 7,916 → 7,920.
- D2699's witness (the fourth regen-10 row) is claimed: `VL_IR_REQUIRE_CLAIM=1` exits 0, and its
  output equals master's under `VL_IR_STRICT=1`.
- `ir-identity.sh --cases`: differ 0.

Q58 sweep: `tests/cases/maps/for-in-narrowed-union-global-map-positions.vl`.
- Positions: a union global narrowed to its map, walked by keys, by values and in pairs, in a
  function and at the top.
- Master blocks 3 functions and the start body. This tree has blockers none and matches under
  `VL_IR_SHADOW=6`.
- `VL_IR_REQUIRE_CLAIM=1` exits 0, and the `@log` lines match under `VL_IR_STRICT=1`.
