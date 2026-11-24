## Infrastructure (Track F)

- **`agent-setup.sh --host-check` knows a host without the claims-off fallback:** besides the mode-6 `[ir]` rows, the check now runs a claimed program that `$VL_FAULT_INJECT_CLAIMED` corrupts. It wants legacy's output with the fallback line, and rc 70 under `$VL_IR_STRICT=1`. A host built before the fallback (c0cbdab7) ignores the seam, so the check rebuilds an isolated host into the worktree, as it does for a host that lacks a shadow mode.
