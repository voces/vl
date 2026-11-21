## Codegen, memory & runtime (Track B)

- **IR coverage: a nullable record or string boxed into a union that admits `null` (box plan arm `nulNiche`).** The value is read once into the niche stash and tested. Its null is the union's null box, and any other value rides under its arm's tag (`emitUnionBoxNulNiche`). The plan returned the ladder for it. Legacy's rung and the plan now share one tail, `nulNicheBoxTail`, through `emitHoleBox`. A niche whose union has no arm for it keeps the ladder's record rungs, and the IR misses it by name, `box niche with no arm`.
