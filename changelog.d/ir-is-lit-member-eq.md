## Codegen, memory & runtime (Track B)

- **IR coverage: litArms' `memberEq` arm.** `s is J` over a string receiver, `J` a literal union, compares the receiver with each member's literal, guarded at a `string | null`. Legacy's member compare is now one plan (`litMemberEqArmOf`) and shared tails (`strMemberEqTail`, the nullable guard, `memberOrTail`) the IR's `RLitArms` lowers through. A value-union receiver is a named miss.
