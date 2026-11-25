# IR coverage: staged `?.` roots (lane COV-UNION, 2026-11-25)

`optional read staged` (3 rows) and `coalesce optional staged receiver` (5 rows) of the I8 census.

## Mechanism

`optChainStagesRecv` marks a `?.` root that is no re-readable place (a call). Legacy evaluates it
once, tees it into `optRecvSlot`, and reads it back, cast to its record where it is read as one
(`emitOptRecvBase`). The IR's chain walk (`optChainRoot`) and the `?.` leaf under `??`
(`coalOptLeaf`) now write the same through shared writers: `optRecvStashTee`, `optRecvStashGet`,
`optRecvStashCast` (legacy's `emitOptRecvBase` calls them too). The leaf's lowering asks
`optChainStagesRecv`, not legacy's lowering-time marker. A staged read is not recorded for a whole
re-read (`irReadOpt`), and a staged receiver under `??` must be the chain's base (a nested chain's
staging is its own: a miss).

## Measurements

- The 7 class programs: every function and start body matched under the armed shadow;
  `tests/cases/expressions/optional-chain-guarded-dot.vl`'s start stays a miss (a nested staged
  receiver, deliberately).
- Q58 sweep `tests/cases/expressions/optional-staged-root-in-each-position.vl`: 75 of 76 matched
  (1 `string operand after another`), both start bodies matched, claimless-identical with the
  class programs (8 of 8); each call runs once.
- `ir-identity.sh --cases` on the branch before #10060's squash: identical 8253, differ 0.
