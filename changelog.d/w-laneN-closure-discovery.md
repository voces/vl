## Type system (Track A)

- **Closure capture and mutation, discovery:** ten position matrices (`cc-*`) over closures capturing and writing a `let`, a list, a record field and a map, written from outside or a nested closure, seeded from a hole parameter, nullable, two closures sharing state, and per-iteration loop capture: 459 of 460 graded cells run, none silent, wrong or trapping. Filed: D16567 (a closure field named like a map method, called on an un-annotated parameter, forces it to a map).
