## Testing

- **`scripts/gate.sh --fast` runs the IR shadow suite.** `tests/vl_ir_shadow_test.ts` (205 cases, about 11 s) now runs as its own `--fast` row on the tree's seed, as `ci-native` runs it in the full gate, so a stale miss expectation reds in a lane's pre-push check instead of in the queue's ci-native. CLAUDE.md §Gates says so; the lanes' manual run of it can stop.
