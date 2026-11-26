## Infrastructure (Track F)

- **A claimless comparison names its source:** `ir-identity.sh --build-claimless` prints which tree and commit it built from and writes `<out>.src` (the `compiler/` source hash); comparing two compilers built from one source, or reusing `$IR_IDENTITY_CLAIMLESS` built from another tree, now refuses (rc 2) instead of running a vacuous check.
