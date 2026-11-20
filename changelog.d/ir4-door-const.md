## Codegen, memory & runtime (Track B)

- **IR door, const initializers and legacy's slots:**
  - The door (`irLowerNodeIn`) now hosts a fragment in a const cell's constant initializer, where
    it had missed with `fragment outside a body`. Such a context has no frame, so any variable
    misses.
  - Every local a fragment reads must agree with the slot legacy declared (`irSlotRunAgrees`), or
    it misses with `local cell rep`. Before this, a const holding its literal set's atom was
    pushed raw into a string list under the probe.

  No emitted byte moves, since the door has no shipping caller yet.
