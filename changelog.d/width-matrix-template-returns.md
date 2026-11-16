## Infrastructure (Track F)

- **368 position-matrix templates measure again:** their tail-expression function bodies (a value without `return`, no longer a function's result) take `return`, so their cells stop refusing for the template's own sake. Graded on master: 3,501 → 18,507 cells run, 0 lost; four cells this exposed build invalid wasm and are filed as D16708 and D16709.
