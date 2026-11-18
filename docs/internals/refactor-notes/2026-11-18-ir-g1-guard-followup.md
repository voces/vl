# IR G1: the pre-path guard's follow-up, 2026-11-18

Lane IR2. IR-REV's non-blocking notes on B3's `exprPrePathWhy`, and one script fix.

- **The dead-`never` check asks `exprReadsDeadNever`**, legacy's own predicate, not B3's local
  approximation (a non-call node typed `never`), so the two cannot drift. It reads the tree and
  checker types only. Measured alone it costs 52,005,669 guest fuel (+0.05% L2), and one more
  self-compile function covers and matches.
- **`scripts/ir-identity.sh` and `scripts/ir-driver-census.sh` default `$VL` to the checkout's
  own host** (`scripts/vl-host/target/release/vl`), as the other scripts do. A bare `vl` failed
  with "command not found" where the host is not on `PATH`.
- The primitive shortcut stays: skipping the coercion, tag and atom checks at a node the checker
  typed a numeric or boolean primitive. The shadow and `--cases` cover it. The guard's remaining
  cost (about 0.2% of L2) is left to a cost pass.

## Bars

Fixpoint seeds of master 559a02d2 and of this step.

| bar | reading |
|---|---|
| self-build | fixpoint; master's seed builds this source to it byte for byte; armed self-build identical |
| self-compile covered = matched = claimed | 11,011 → 11,012 |
| corpus | 30,400 covered = matched; `--claims` 30,400, ok |
| `--cases` | identical 7,433, fail under both 69, differ 0 |
| corpus identity | 9,030 identical, 3,267 fail under both, 0 differ, with `--names`; self-compile identical |
| L2 self-compile fuel | 96,859,371,797 to 96,911,851,126 (+0.05%) |
| lint-self, phase-state | clean, ok |
