## Codegen, memory & runtime (Track B)

- **IR coverage: a closure read across closure openness.** A hole lambda's cell read where one closure type leaves a parameter or result open and the other closes it missed at `narrowed read` or `global read coercion`. An example is `const c = (y) => y + "C"; const fs = [c]`. Every closure lowers to the one closure struct, so the read is now the cell retagged, by `cloHoleRetag`. tests/cases `narrowed read` went from 81 functions to 55 and `global read coercion` from 68 to 52, and a new tests/cases program calls through each retagged form.
