## Type system (Track A)

- **D16237 closed:** a map walk's value variable (`for k, e in m`) reads the map's value slot, so its call pins a hole function written into a value's field through a narrowed read of the map, by name or as a lambda. Filed D16239: a walk over `.values()` still pins nothing.
