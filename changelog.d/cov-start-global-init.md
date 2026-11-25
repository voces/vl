## Codegen, memory & runtime (Track B)

- IR coverage, start bodies (lane COV-START): a global's alias, holder and atom initializers, a widened value join, a list declared at its initializer's instance list, a nullable map's `Map()` and a narrowed arm's initializer are now built by the IR's start body. Start bodies claimed: tests/cases 7,707 → 7,727, witnesses 4,957 → 4,966; `global initializer *` start misses 39 → 13 and 17 → 5.
