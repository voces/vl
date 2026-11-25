## Codegen, memory & runtime (Track B)

- **IR claims a string field read where a literal-union atom is wanted** (a layout family's `{ k: string }` field delivered to a `"a" | "b"` destination), legacy's atom tower over the field read again per member. In the layout-family positions and hazards programs, 7 functions that missed on `atom tower place` now match.
