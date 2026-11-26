# A map operation's computed receiver (lane COV-UNION, 2026-11-26)

## The refusal

`(o ?? mk())["a"] ?? 0` and `(if c { a } else { b })["a"] ?? 0`: the receiver is computed by a
statement, a boxed `??` or a valued `if`. `mapRecvLoc` took only a variable or the one temp its
use writes, so it refused (`map read receiver computes`, `map store receiver computes`).

## The change

The map operation's lowering reads its receiver once, first, before the key (`mapRecvRead`). A
valued `if`'s or a boxed `??`'s out is the receiver's value left on the stack, so it is read in
order. `mapRecvLoc` now takes a receiver whose last built statement is such a node and whose out it
is (`recvIfOut`). Legacy writes the receiver's value in the same place.

## Measured

Both arms run from their own checkout (census.sh builds its probe compiler from the cwd's
compiler/): master `af5532762` from the base worktree, this tree from its own, over tests/cases plus
the 65 regen-9 COV-UNION programs.
- `map read receiver computes` 9 → 0, `map store receiver computes` 1 → 0. One function
  (`shared-let-without-zero-value.vl` `go`) moves on to `store element record literal`.
- tests/cases: unclaimed distinct functions 290 → 282; programs fully claimed 7,865 → 7,870.
  Witnesses: 18 → 19 of 22 functions claimed. No class rose apart from the one move above.
- `ir-identity.sh --cases`: differ 0. The 8 programs of the class are byte-identical to the
  claimless build, apart from `unions/as-prop-niche-in-each-position.vl`, whose bytes already
  differed (same behaviour) before this change.

Q58 sweep: `tests/cases/maps/map-read-computed-receiver-positions.vl` (a `??`, a block arm and a
valued `if` as the receiver, in a function, bound and at the top). Master reports
`map read receiver computes` on 3 functions and the start body; this tree has blockers none, and
the claim takes it, matched under `VL_IR_SHADOW=6`.
