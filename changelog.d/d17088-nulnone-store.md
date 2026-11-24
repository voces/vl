## Soundness

- **A binding of the `null` unit type runs its initialiser** (D17088): `const x = (s = null)` stores `null` into `s`, at a local and at a module global. It wrote the bottom null alone before, so `s` kept its old value.
