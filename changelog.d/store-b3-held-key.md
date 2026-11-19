## Type system (Track A)

- **A list literal of records holding a function of a tagged set, handed straight to an un-annotated parameter of a function named once, runs:** the tag decision takes the handed literal as holding the set's ids (`ftHandedRecHolds`) and builds it, and each list literal around it, at its own rep. Mono pins the hole at the list of the set's id rows, and a clone of a call that already carries the set keeps it (`monoTagSetAt`). D15900's argument position runs; its other delivery positions stay open.
