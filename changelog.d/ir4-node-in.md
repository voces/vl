## Codegen, memory & runtime (Track B)

- **IR seam, the legacy-to-IR door:** `irLowerNodeIn` lowers one node through the IR inside a
  legacy writer's frame, so a family's legacy arm can delete before I8, and `irNodeInShadow`
  counts, per occurrence under the armed shadow, whether it matches legacy's bytes. The first
  measured site is the list literal. No emitted byte moves.
