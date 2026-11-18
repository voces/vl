## Codegen, memory & runtime (Track B)

- **A loop's hoisted receiver that is a global record's field reads as the IR's own read:** the builder records every plain field read (`irReadField`), and the prologue reads a field receiver's object the same way, so `a.nodes` with `a` a global no longer falls back to legacy (#9039's gap); the corpus gains the `ir-hoist-global-field` set, which the claims row now reds on without the fix.
