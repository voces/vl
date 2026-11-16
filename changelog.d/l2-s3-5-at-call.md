## Type system (Track A)

- **L2 S3.5: a callee's failed bound names the parameter and the body site at the call**
  (`refactor-notes/2026-11-16-l2-s3-5-at-call.md`). "(the body of `f` at the call's argument
  types)" becomes "(parameter `x` of `f`, used at L:C)"; each bound keeps its own sentence and
  hint. No verdict changes: 1,161 distilled cells move loud→loud, 0 change class. D16862 filed for
  a structured related location.
