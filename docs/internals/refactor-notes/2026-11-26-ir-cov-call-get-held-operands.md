# COV-CALL: plain `xs.get(i)` with held operands (2026-11-26)

Lane COV-CALL; census rows `get index operand` and the plain `.get`'s
`coalesce listGetOr after an operand`, on CENSUS's nested-stash and closures programs. Follows
the IR-owned locals of the nested fused read (refactor note 2026-11-26-ir-cov-call-get-or-nested).

## Mechanism

`getValueRhs` took only an index legacy re-reads in place or one temp. A global read is a temp
that legacy re-reads, so it refused. An inner fused `??` in the index refused too, because the
receiver's temp was still pending when the index built.

- **Receiver.** Ahead of an index legacy cannot re-read, a receiver legacy re-reads
  (`optRecvReReadable`) has its pure read wait aside while the index builds, then go back before a
  plain index or after an index's statements. Any other receiver is held in an IR-owned local
  (`heldInLocal`).
- **Index.** An index that built nothing is legacy's own re-read. One temp takes the once-slot,
  and any other is held.
- **`irGetIdxBegin`** sets `listGetIdxHeld` whenever it hands the index, and `irGetIdxEnd` clears
  it. A held local index is then read only through the hook, never staged and evaluated again by
  legacy. The fused read's own wrap around its open is no longer needed.
- **`repLocalValtype`** takes `refRepValtype` for a ref-element list or a closure. An owned local
  of a record list then declares the wrapper legacy keys, where `fbValtype` refused ("ref valtype
  with no interned shape").

## Proof

- **Census**, CENSUS's nested programs plus `closures/record-list-fn-field-two-results-opt-call`:
  every start body is claimed except `list-get-nested-stash-string`'s. Its lines 7 and 8, a
  string-list `.get ?? d` whose receiver's argument holds a fused read, fall back on
  `stack value read out of order`, as line 7 already does on a current-master seed. That is a
  separate mechanism.
- **Armed sweep:** every `@run` program under `tests/cases/lists/` (258) prints the same with
  `VL_IR_SHADOW=6 VL_IR_STRICT=1` as without.
- **Q58:** `tests/cases/lists/get-held-operand-positions.vl` puts a plain `.get` with a fused-`??`
  index behind a call receiver and a name receiver, an inner miss, a global-read index, a record
  list and a function, with a call counter. On the master seed one function and the start body
  miss; on this branch all are verified, and the armed run prints the `@log` list.
