## Codegen, memory & runtime (Track B)

- **D16530 closed:** a literal-union value copied off a hole parameter, narrowed by `==` to one member and read by `??`, builds and runs. The per-instance `??` fold now widens the atom to the `??`'s own rep: the member string, or the box of a join with another type. Before, it was check-clean invalid wasm. D16552 is filed as an L2 acceptance row, with its `map_set` open-destination face.
