# IR: a box delivered to a destination with no type reads its rep's union (2026-11-26)

Lane COV-IS, regen-9 class `box into another union`. Stacked on cov-is-42 (#10311).

`widenTo` hands a box operand whose rep already equals the destination's to `boxIntoOtherUnion`,
which missed whenever the destination's type was unknown (-1). A closure's write to a hole-typed
`let` (`x = other` in a lambda) is such a destination. `boxIntoOtherUnion` now reads the union
the destination rep holds (`repTyOf(dst)`) when no type is given, then applies its own rules.
There the value's type is that union, so it is stored as it stands, as legacy stores it.

Measured:

- regen-9 row closed: `unions/list-union-for-nested-known-arm.vl` `__lambda_1`. The program now
  claims whole; `ir-parity --behaviour-only` reads `same`. Its byte differences (prefix or locals in
  `deep`, `rebind`, `viaClosure`) were there before the change.
- No other regen-9 cases or distilled program moves.
- The sweep `tests/cases/closures/hole-let-written-in-lambda-union-positions.vl` covers a lambda,
  a nested lambda and a lambda's branch over a list union, plus a value union. On cov-is-42's
  seed, 3 lambdas miss with `box into another union`; here none do. `ir-parity` reads `same`.
- Shared plan unchanged, so legacy bytes do not move.
