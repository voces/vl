## Type system (Track A)

- **A list literal of records holding a function of a tagged set, handed straight to an un-annotated parameter, runs:** the tag decision takes the handed literal as holding the set's ids (`ftHandedRecHolds`, for a callee named once) and builds it, and each list literal around it, at its own rep; mono pins the hole at the list of the set's id rows (`monoTagRecListTy`) and a clone of a call already carrying the set keeps it. D15900's argument position runs; its other delivery positions stay open.
