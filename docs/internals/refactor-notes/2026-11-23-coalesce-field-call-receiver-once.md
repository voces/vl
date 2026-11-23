# D17059: a union-field `??` evaluates a call receiver once (2026-11-23, lane IR-N2)

`emitCoalesceUnionField` (`wasmEmit.vl`) writes `o.v ?? d` over a value-union record field with
the receiver once for the null test and once in the `else` that reads the present field. A call
receiver ran twice. Its `unbox` arm is the one the `i32 | null` and `f64 | null` fields reach;
the `boxed` arm takes the same change.

## Design

- `coalFieldRecvStash(recv, p)`: -1 for a re-readable place (`unionEqOperandOk`), which both
  arms write again as before; otherwise `coalFieldRecvSlot(p.cfHeap)`, a new lazy scratch code
  51 keyed by the record heap and typed `(ref null $heap)` (`fbLazyListSlotRun`).
- `coalFieldRecvFirst` tees the receiver into the slot after `emitCoalArmRecv`;
  `coalFieldRecvAgain` reads the slot on the present path. The slot is minted on first use, so
  a function with no such `??` has the frame it had.
- The IR keeps missing a call receiver here (`coalesce field place`), so no claim changes.

## Measured

Against master `0ba14606f` at its fixpoint seed:
- Legacy A/B over tests/cases (non-`@error`), the capability probes and the distilled cells:
  20,035 programs, 20 moved (`2026-11-23-coalesce-field-call-receiver-once.moved.txt`). The
  witness is one; each of the other 19 holds a call or an index-with-call receiver under such a
  `??` and prints what it printed before.
- Matrix `scripts/capability-probes/matrix/coalesce-field-off-call-*.matrix.vl`, seven field
  shapes × the built-in positions plus an index-with-call and a closure-field-call receiver
  cell. On master, `i32` and `f64` fields are WRONG at all 42 graded cells, and `boolean`, atom,
  `string`, record and union fields run at all 42. After the fix, every template runs at 42 of
  42. The four `*_assign` positions are skipped, since they evaluate the value twice by
  construction.
