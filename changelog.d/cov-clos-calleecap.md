## Infrastructure (Track F)

- The IR passes a respelled parameter's seed to a lifted callee that captures it, and reads the
  parameter through that seed in its own frame (D3025's shadowed capture; `callee captures` → 0,
  lane COV-CLOS). Files D17674, a written reference-typed parameter with such a seed, which builds
  an invalid module.
