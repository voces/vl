## Type system (Track A)

- **Impossible tests are errors only by declared type (owner ruling, 2026-11-12):** an `is`, a `match` arm or an `==` that flow alone makes impossible (a write's or a guard's narrowing, or arms already covered) is now a `dead-test` warning and the program runs; declared types that can never overlap stay errors, and a `const` scrutinee's impossible arm says to declare the const's other values. The 11 programs rewritten under the earlier ruling run in their original spelling again.
