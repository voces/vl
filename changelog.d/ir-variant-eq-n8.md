## Codegen, memory & runtime (Track B)

- **IR coverage, `==`/`!=` over one record-union arm:** a field-wise compare over a variant's row
  builds through the IR on the stage, roots and tails the struct compare shares with legacy. No
  emitted byte moves.
