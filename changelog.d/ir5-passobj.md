## Codegen, memory & runtime (Track B)

- **IR: a narrowed box delivered into a union as it stands.** The box plan's `pass` arm no longer refuses every value typed as a record: it declines only where `emitUnionWideArmBox`'s narrowed-box rung re-boxes the payload (`narrowBoxWideArmOf`, now shared by both emitters). The builder reads such a value as its box local, as legacy does, not as the record its narrowing unboxes to.
