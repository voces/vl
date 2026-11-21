## Infrastructure (Track F)

- **`scripts/ir-identity.sh` reports a build the 60 s limit stopped as `TIMEOUT f (a|b|both)`, never as a differ.** Every summary line gains `, timeout N`; a run with any timeout exits 3 with a "rerun on a quiet box" hint (a differ still exits 1), so a timeout under load is neither passed nor mistaken for a byte difference. The logs of every non-identical file are kept under `$IR_IDENTITY_KEEP` (default `$TMPDIR/ir-identity-keep/<run>/`) instead of being deleted with the run. `tests/vl_ir_identity_compare_test.ts` pins both.
