## Type system (Track A)

- **Two diagnostic helpers say what a missing type means:** `braceNameNote` gives no note for a
  name with no type, and `witnessOf` asks nothing of a bound parameter whose annotation failed,
  where both relied on `assignable` accepting a negative type. Behaviour unchanged.
