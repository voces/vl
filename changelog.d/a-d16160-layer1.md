## Type system (Track A)

- **D16160 closed:** a bound list of records whose function field holds un-annotated functions with different results, handed to an un-annotated parameter that calls through an element's field, dispatches. `const l = [{ f: inc0 }, { f: half }]; take(l)` prints `1.5`, where it was an emit reject that `vl check` passed. Two such lists through one parameter run too. A splitting list and an agreeing list through the same parameter are still refused (D16144).
