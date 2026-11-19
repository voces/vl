## Codegen, memory & runtime (Track B)

- **IR coverage, `.map` and `.filter`:** the IR builds a list's `.map`/`.filter` whose callback is a
  capture-free function or a function-typed binding (`RMapFilter`), through one plan
  (`mapFilterPlanOf`) and legacy's receiver and loop tails, which legacy's own arm now calls too.
  The corpus ships 846 more functions from the IR. No emitted byte moves.
