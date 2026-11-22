## Codegen, memory & runtime (Track B)

- **IR coverage, a tagged call's result at every unboxed kind:** a call through a tagged function set now builds at every result kind legacy writes without a box, a `boolean` result included. Legacy's box choice is split out as `tagDispatchBoxes`, and a union result is the named miss `tag dispatch result union`. tests/cases covered = matched +41.
