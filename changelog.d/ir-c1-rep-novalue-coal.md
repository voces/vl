## Codegen, memory & runtime (Track B)

- **IR coverage: a returned call that never returns, and a `??` default that never returns.** `return fail("x")` in a valued function builds as the call and legacy's dead bare `return`, and `x ?? fail("x")`, including the capture-box `cell ?? __trap__()` of a shared `let` read before its write, builds the null arm as the call alone. The builder and the verifier share `irNodeEndsPath`. Over the class's 41 tests/cases programs `rep novalue` falls 33 → 14, and 18 more tests/cases functions are claimed.
