## Codegen, memory & runtime (Track B)

- **IR coverage: a map boxed into a union under its map arm's tag.** A map delivered into a union box was the box plan's ladder. It is now the plan's `map` arm: the tag (`mapArmBoxHead`, legacy's `mapBoxTagOf`), the map, `struct.new`. Legacy's `emitUnionMapArmBox` writes its non-null case through the same head. A boxed value that is an assignment is a named miss for every arm that writes a tag (`box of an assignment`): the builder writes the store as a statement ahead of the tag.
