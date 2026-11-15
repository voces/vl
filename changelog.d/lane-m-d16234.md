## Type system (Track A)

- **D16234, D16236 closed:** a generic body's bound list literal of records holding a generic function is built at each instance's own `T`: pushed, index-written or only read, by index or by a `for` straight over the call, instead of a trap or a missing-signature emit refusal at the second instance.
