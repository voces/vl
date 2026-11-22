## Codegen, memory & runtime (Track B)

- **IR coverage: a literal-union map's bare read at its nullable atom.** `const v = m[k]` over a `{[string]: AB}` map, typed `AB | null`, missed at `map get rep`. Legacy's probe returns the atom, its miss the `K | null` niche's `-1`. The IR takes the read at that nullable where `mapGetMissOf` says `-1`, as it already took a boolean map's `2`.
