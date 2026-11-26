## Infrastructure (Track F)

- The IR reads a capture of a union box narrowed to a closure's or a map's `A | null` as the box
  the capture holds, then its niche, as a box local's narrowed read is (`read of <name>` on the
  `niche` arm; lane COV-CLOS).
