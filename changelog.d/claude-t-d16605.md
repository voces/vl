## Type system (Track A)

- **D16605 closed:** a radix literal that a float does not hold exactly now adopts that float only under `as`, where ruling 4.1 rounds it. As the default of a `??` beside a typed float it keeps its own type and the join widens: `n ?? 0x1000001` prints `16777217`, as the decimal does. As an `f32[]`/`f64[]` element it is refused, as a binding is. Before, both positions silently rounded it.
