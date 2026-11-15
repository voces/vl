## Type system (Track A)

- **The elaboration's pin notes are a rollback family** (L5 step 3b): `RB_ELAB_PIN` restores the
  binding register, the hole-pin rows and the last row's appended pins to a `CheckMark`. No site
  rolls it back yet; it is the mechanism lane relate's P3 needs to delete the two quiet gates.
  Byte-identical over 20,312 corpus programs and the L2 build; +46 compiler lines.
