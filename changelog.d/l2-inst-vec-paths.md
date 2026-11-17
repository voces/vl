## Type system (Track A)

- **The instance vector is recorded on every pin path**
  (`refactor-notes/2026-11-16-l2-inst-vec-paths.md`): member calls, a lambda handed to a hole
  parameter, a set-of-functions binding's re-check and declared constraints at a binding, each
  row keyed by node, path and sub. Nothing reads it yet. No behaviour changes.
