## Infrastructure (Track F)

- **Mono's instance key no longer parses its own text** (type hash-cons stage 5a). The exact-type
  bindings an instance key spells (`~tp=c;`) travel beside it as (name, canonical type) arrays, so
  the typed key and the explicit-binding filter read those arrays instead of scanning the key
  string. A registry lookup reads a key→row map instead of comparing every registered key. Output
  is byte-identical.
