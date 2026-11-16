## Type system (Track A)

- **D16815 closed:** a maker with an un-annotated or generic parameter, its two call bindings called with the wider pin's first (`const x = adder(1.5)`, `x(2.0)`, then `const v = adder(2)`, `v(3)`), now runs instead of being refused at emit: each binding holds its own call's instance of the lambda. Files D16818: a maker returning its lambda through a local `const` builds invalid wasm at a non-default pin.
- **D16818 closed (clause 1):** a maker returning its lambda through a local `const` (`const f = (a) => a + n; return f`), called at a non-default pin (`adder(1.5)`), no longer builds invalid wasm: a call through its binding is typed by that lambda at the call's pins. Files D16819: two such bindings, both called at two pins, are still refused at emit.
