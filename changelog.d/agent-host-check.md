## Infrastructure (Track F)

- **A lane worktree checks its host behaviourally:** `scripts/agent-setup.sh` (and `--host-check` alone) builds a tiny program under `VL_IR_SHADOW=6`. When the shared host prints no `[ir]` rows, because it predates a shadow mode, the script builds an isolated host from the worktree's own `vl-host/src` into a `$TMPDIR` target that it deletes, and installs it in place of the worktree's target symlink. The shared target is never built into. The ir-shadow "no `[ir]` rows" refusal names the fix.
