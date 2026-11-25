## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): a list literal past the `array.new_fixed` operand cap with computed elements is now built by the IR, both from its constants' data segment with each computed element stored after, and in chunks (a packed list's computed elements, a v128 list). Each build is one writer that legacy's arms and the IR share; the long ref list builds on the chunk writer next. Start bodies claimed: tests/cases 7,868 → 7,871, witnesses 5,060 → 5,062.
