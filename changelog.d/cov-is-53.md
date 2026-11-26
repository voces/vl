## Codegen, memory & runtime (Track B)

- The IR delivers a union box with a record arm wider than an arm of the destination union (a
  `D | B` into `A | B` with `D` wider than `A`): the wide arm is re-boxed under the arm it
  subtypes, as legacy's ladder did, through a shared `wideRetag` box plan arm.
