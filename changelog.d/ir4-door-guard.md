## Codegen, memory & runtime (Track B)

- **IR door context guard:** `irLowerNodeIn`, the door through which legacy lowers one node
  through the IR, now misses `legacy context live` unless legacy's lowering context is at rest:
  the coercion seats, storage-read mode, narrowing frames, staged operands, open list-build
  regions and loop hoists, and the union-sink cursor (`legacyContextLiveWhy`, ir-design §10.2).
  This is the precondition for a shipping caller. No emitted byte moves.
