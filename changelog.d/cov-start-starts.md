## Codegen, memory & runtime (Track B)

- IR coverage, start bodies (lane COV-START): a scalar value typed at a still-open variable, and a global initialized by an assignment to a literal-union cell, are now built by the IR's start body.  A function's read of such a global at `string` is no longer claimed into an invalid module: it decodes the atom. Start bodies claimed: tests/cases 7,978 → 7,985, witnesses 5,039 → 5,046.
