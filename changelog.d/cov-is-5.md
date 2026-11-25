## Codegen, memory & runtime (Track B)

- IR coverage, `is` and null tests (lane COV-IS): `x is U` for a union alias arm `U` (the or-ed tag chain), a null test whose left `null` side runs for its effect, and a null test of a `const` holding a record of members are claimed. Over the programs these classes held: tests/cases distinct functions claimed 53 → 75 of 87, witnesses 3 → 7 of 9.
