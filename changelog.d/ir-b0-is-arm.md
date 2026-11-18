## Codegen, memory & runtime (Track B)

- **IR B0, the `is` test's rungs as one decision:** legacy's `is` ladder dispatches on
  `isArmOf`, which names its 19 rungs in their order, and a try rung that declines passes to the
  next. This is the decision the IR's `is` test will read. No emitted byte moves.
