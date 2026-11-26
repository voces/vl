# The I8 edges into stage B: the last five closed by declining (2026-11-26)

Follows `2026-11-26-i8-edge-proofs.md`. Five edges were open there: emitChainRead→emitExpr,
emitIdxIndex→emitExpr, refListReadAt→emitExpr, emitNulIsNullTest→emitOptChainIsNull and
rcReadSource→emitExpr. Each is the IR handing legacy an operand NODE to re-read where the IR has
no read of it (`irReadsAgain` false), or an optional chain's null test. The IR now declines at
each of those four points (`ir_lower.vl`: `structEqRootPlace`, `structEqElemPlace`,
`structEqSideNul`, `recCopyPure`), so each edge is proven by its refusal, as #10270 proves
arrLitDataElemExpr's.

Readings (master 290d1adc1):

| reading | result |
|---|---|
| a probe compiler that hard-fails at each of the five legacy arms while a claim lowers (`emitSoftFail`), over the sweep population (`scripts/sweep.vl`, 27,675 programs) and its own self-compile | 0 hits; the control (the same probe in `refListHoistOf`, which the IR calls) fires on a ref-list read |
| `sweep.vl diff`, master fixpoint vs candidate fixpoint, 27,677 programs | 27,677 same, 0 bytes-only movers |
| master's `compiler/entry.vl` built by master's seed and by the candidate | byte-identical |
| `ir-i8-sweep.sh --edges --check` | 24 edges, 20 proven; the 4 left are #10270's (emitStrValue ×2, arrLitDataElemExpr ×2) |

Re-readable non-name record-copy sources do not reach `recCopyPure` today, because the checker
refuses to copy a shared record. A fresh one is a call, a literal or a held literal adopted at its
destination (`const rs = [{ a: 1, b: 2 }]; const w: Wide = rs[0]` builds `rs` as `Wide[]`). So
the decline in `recCopyPure` moves nothing today. It is the contract I8 needs once legacy's
`emitExpr` is gone.
