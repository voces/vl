## Type system (Track A)

- **D16293 closed:** an integer literal `let` joins a float stored into it that holds the literal exactly (owner ruling 2026-11-15, ruling 4.3's join for a literal `let`'s stores): `let t = 0; t = t + 1.5` is `f64`, and the generic accumulator `function sum(xs) { let t = 0 … t = t + xs[i] … }` types `t` at each call's pin, so `sum([1.5, 2.5])` prints `4`; integer-only stores keep the integer widening and an inexact float keeps the refusal.
