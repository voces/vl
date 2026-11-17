## Type system (Track A)

- **The read query moves into the elaboration** (`refactor-notes/2026-11-16-l2-elab-read-query.md`):
  `elabReadFns` (`compiler/elab_reads.vl`) is what mono's read rewrite and now check ask.
  `$VL_REP_SHADOW` saves check's answer and compares every mono ask with it. `$VL_IFACES` prints
  the counts under `vl check --codegen`, a refused build included. No behaviour changes.
