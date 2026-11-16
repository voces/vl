## Type system (Track A)

- **D16815 narrowed:** a maker with an un-annotated or generic parameter, its two call bindings called with the wider pin's first (`const x = adder(1.5)`, `x(2.0)`, then `const v = adder(2)`, `v(3)`), now runs instead of being refused at emit. A maker returning its lambda through a local `const` is still refused.
