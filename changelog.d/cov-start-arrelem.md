## Codegen, memory & runtime (Track B)

- **D17673 closed:** an all-`null` list literal of a literal set's `| null` element (or `boolean | null`), delivered into a union, is built by the IR at the element's own null. Legacy stored the i32 sentinel 2, which a literal set read back as an atom (`b` of `"a" | "b"`); the program now prints `none`. Closes the three `array null sentinel rep` units.
