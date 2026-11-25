# I8 re-entry: a record copy's source, 2026-11-25

Lane COV-CALL, its second I8 re-entry port: `rcReadSource`, the coerceTail → `emitRecCopyInto` hook.

## The re-entry

`recCopied` hands a record copy whose source the copy re-reads (`recCopyReReads`) to legacy whole
(`RRecCopyPure` → `recCopyPureEmit`). Legacy's `rcReadSource` then wrote the source node through
`emitExpr`. Most of the 310 programs are a one-field copy, such as `const wideJ: J = mk()`, of a
source that is no place. `rcReReadable`'s second arm counts that as re-readable, because the copy
reads it once.

## The port

- `RRecCopyPure` gains `rpV` (the source the builder built) and `rpOnce`.
  - A source that is no place (`recCopyReadsOnce`, the shared negation of `exprReReadable`) is built
    whole and written once into bytes at the lowering.
  - A name's source (a variable or a global, no capture, `recCopySourceIsName`) is built and
    skipped. Its read is written again (`irHoistRecv`) where `irReadsAgain` holds.
  - Any other source keeps legacy's read from the node.
- `recCopyPureEmit(exprIx, fnIx, src)` holds those bytes in `rcSrcBytes` around the copy, as it
  holds `coerceHeld`. `rcReadSource` appends them (`wBytes`) in place of `emitExpr`.
- `irReadsAgain` is the predicate the `emitChainRead` port (branch `cov-call-reentry-chainread`, now
  COV-UNION's) adds too. Whichever lands second drops its copy.

## Measurement

`scripts/ir-i8-sweep.sh scripts/ir-i8-census/keep.txt` (all populations), master
against this change:

| | before | after |
|---|---:|---:|
| `reentry rcReadSource` (programs) | 310 | 0 |
| unexplained newly failing | 529 | 220 |
| newly failing: distilled / cases / probes / witnesses | 170 / 1014 / 31 / 466 | 70 / 904 / 24 / 374 |

The 310 programs claim the same functions and start bodies before and after (census probes of
master and of this change: 492 functions, 200 start bodies, no miss). Each is claimless-identical
with no armed mismatch under `VL_IR_SHADOW=6`. `sweep-baseline.txt` drops the cause.
