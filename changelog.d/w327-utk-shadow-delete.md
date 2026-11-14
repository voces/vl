## Codegen, memory & runtime (Track B)

- **The union type-key shadow harness is gone.** `unTyKeyShadow`, its sweep, its tallies and the
  mono pins' staging (`monoShStage`, `monoShOffer`, `monoShPendFlush`) only ran when the A/B
  harness was armed. They compared a spelling's row with its type's key, which `unRowOfTyKey` now
  answers directly. Every program builds to the same bytes.
