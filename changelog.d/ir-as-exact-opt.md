## Codegen, memory & runtime (Track B)

- IR coverage: an exact numeric `as?` (D1041) is built by the IR as `RNumCast` over legacy's `numExactCastTail`, yielding its value-union box; the propagating exact `as` is a named miss.
