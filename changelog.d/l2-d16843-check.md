## Type system (Track A)

- **D16843 closed:** a generic function handed to a callee that hands it back in a closure or a record field (`wrap(a)()(3)`, `mk(a).f(3)`, `const h = () => a; h()(3)`) and called at a second type runs; the set stays tagged and each call dispatches to its own instance.
