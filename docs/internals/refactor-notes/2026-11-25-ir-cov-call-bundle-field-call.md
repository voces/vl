# COV-CALL: a call through a record field holding a bundle (2026-11-25)

Lane COV-CALL, class `method f`: the 8 rows left after the dead field calls (#10099).

## Mechanism

A record field holding a lambda's bundle (`{ f: lap((a) => a + 1) }`, one closure per signature
the lambda is called at) is a place holding a returned record whole. Legacy's `emitCallCore` sends
a call through it to `emitCallRef`, by its closure, place-record or result-member rung.
`emitHolderCall` then picks the member for the call's signature (`holderPickOf`) and calls it.

The IR's non-member indirect calls already take `holderCallRhs` on `holderCallSigs`. The member
branch (`methodRhs`) now does too, where `fieldCallRoutesRef` holds: the same three rungs
`emitCallCore` asks before it sends the call to `emitCallRef`.

## Legacy is byte-identical

From #10099's seed (this branch's base) and this branch's fixpoint seed: `tests/cases` 0 of 9,422
differ, distilled + capability probes + witnesses 0 of 18,150, and the self-compile is identical.

## Census (class programs, `CENSUS_CLASS=classes/method-f.txt`)

| row | before | after |
|---|---:|---:|
| `method f` | 8 | 1 |

The one left is `take` in `error-record-if-joined-with-records-handed-to-hole-param-one-type`:
legacy's own set-split refusal (D16747). Newly exposed first misses are other mechanisms, each one
function: `object field holder`, `field store coercion`, and `open local type` twice. No claim
falls back.

## Proof

- Q58 sweep: `tests/cases/closures/bundle-field-call-positions.vl`. The field is called at both
  signatures, printed, bound, passed as an argument, returned (over a capture), beside a scalar
  field, and at module scope. Before, the IR claims 21 of its functions and not the start body;
  after, 24 and the start, byte-identical under `VL_IR_STRICT=1 VL_IR_SHADOW=6`.
