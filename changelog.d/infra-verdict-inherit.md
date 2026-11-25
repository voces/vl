## Infrastructure (Track F)

- **A catch-up merge no longer inherits a job its previous run never passed:** `ci-verdict.sh` answers `inherit` only when the previous head's run has a successful job for every job of this tree's `ci.yml` (but `ci-proof`). A PR whose last green run predates `ci-ir-identity`, or skipped a job, now runs everything, so the identity proof is made.
