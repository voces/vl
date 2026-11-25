# START-2: `widen literal` (2026-11-25)

Census restricted to the class's two programs (`bitwise/shift-count-widens-untyped-literal.vl`,
D16318): `widen literal` 2 → 0, both start bodies claimed. The case's `variableCount` stays
unclaimed on `operand coercion` (COV-START's class).

A literal operand whose own rep is not the operator's width (`binWidthRep`) was refused so legacy
could write it at that width (`emitNumLitAs`); the IR builds it there with `signedLitAt`.

Looked at and left open, with reasons:
- `for range dynamic step` (`loops/for-step-expression.vl`): `forRangeTestOf` and the helper loop
  (`SRangeLoop`) carry only a static step; a dynamic one needs the step local, the run-time
  direction test (`emitRangeTest`'s `select`) and the wrap exit in both the builder and the
  lowering.
- `string literal rep` (`match/open-scrutinee-arms-narrow-to-their-own-pattern.vl`): the literal
  handed to an open scrutinee's instance is typed at a union box; building it at `str` only moves
  the start to `box ladder` (COV-IS), so it is left as is.
- `global initializer rep` (D6120): `const x = if c { [] } else { null }` has an open element type.
- `expression as` (`maps/scalar-read-as-opt.vl`) is claimed on master 91452f48 already.
