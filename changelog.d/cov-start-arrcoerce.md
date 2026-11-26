## Codegen, memory & runtime (Track B)

- **IR list elements at another rep:** a list literal's element whose rep is not the list's element rep goes in by the cell converter (`irConvertStored`): a list at a twin list rep, or a closure into a nullable closure slot. An empty `Map()` element is built at the element's map rep, as a `let` held at its slot's map is. Nine of COV-START's ten `array element coercion` units are claimed; the tenth (a nullable closure read into a non-null element) is the list's storage rep, not a conversion.
