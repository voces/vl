# Step 7: `fnValuesStampSlot` is deleted

Measured 2026-11-09 on a 4-core box. Both seeds are fixpoints (two builds byte-identical). The
base is #6968's head `9ee31999`. The population is the sweep's 23,775 programs.

## What moved

`fnValuesStampSlot` (`emit_classify.vl`) walked a function's returned values and took the row
their rep stamps agreed on (a call-built value's root call's stamp). Two readers asked it after
reading the recorded result: `cloRetKeySuffix` for an un-annotated record or variant result's
`$fnsig` token, and `frsColsOfTy` for the return columns. So a record result's row was decided
twice, once from the recorded result type and once from the values.

The recorded result now takes the values' agreed stamp for every record result
(`frsRecordedRetCore`, through the existing `frsValuesStampRow`), not only for one whose type has
no row. Both readers answer from `repOf` of that result, and the walk is gone.

## The test-delete

Deleting the walk alone, before the recorded result took the stamp:

| | same | output movers | runs → not-runs | new traps |
| --- | --- | --- | --- | --- |
| walk deleted | 23,759 | 16 | 13 | 13 |
| walk deleted, recorded result at the stamp | 23,775 | 0 | 0 | 0 |

Every lost program had one returned literal whose stamp named a different row from its recorded
result: a record result shared with a binding that stores a field wider (`const _k: K = mk()`
beside `const y = mk()`, D15247, D15317, D14383, D15264). The literal is built at its stamp, so
the recorded result must name it.

## Proof

* Sweep diff, base against candidate: 23,775 same, 0 bytes-only movers, 0 output movers.
* Seed: 6,583,848 → 6,583,406 bytes (−442).
* Plumb-shape cost, candidate against base: fuel main 9,047,381,287 against 9,047,371,783, tail
  6,559,116,243 against 6,559,115,775; peak RSS main 320.6 MB against 320.5 MB, tail 318.4 MB
  against 318.3 MB.
* `rep-fuzz-check.sh`: exact.
