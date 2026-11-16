## Type system (Track A)

- **The instance vector** (`refactor-notes/2026-11-16-l2-inst-vec.md`): each generic call's body
  check records its callee and the binding over the callee's type variables. Nothing reads it yet;
  it is STORE stage (a)'s input. No behaviour changes.
