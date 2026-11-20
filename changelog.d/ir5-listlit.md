## Codegen, memory & runtime (Track B)

- **IR: a list literal boxed into a union's value-atom arm.** The box plan's scalar-list `atom` arm takes a list literal where every list rung ahead of the value-atom box declines it (`listLitTakesAtomBox`: not empty, not built at a ref-list arm of its own, no map or nested element, no arm it is built through). `emitUnionListLitViaRefArm`'s arm choice is now `listLitRefArmSlotOf`, and `arrLitRefSlotAtTy` moved beside it, so both emitters read one decision.
