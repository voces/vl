## Infrastructure (Track F)

- **A claimless comparison names its source:** `ir-identity.sh --build-claimless` prints which tree and commit it built from and writes `<out>.src` (the `compiler/` source hash); comparing two compilers built from one source, or reusing `$IR_IDENTITY_CLAIMLESS` built from another tree, now refuses (rc 2) instead of running a vacuous check.
- **ci-ir-identity's cold-start timeouts:** `ir-identity.sh` warms each compiler with one untimed build before its parallel batch; the first four builds against a fresh claimless compiler used to compile it four times at once and could pass the 60 s per-build limit together (`ci-ir-identity (2)`'s recurring four `TIMEOUT … (b)` on the first capability probes).
