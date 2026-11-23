## Codegen, memory & runtime (Track B)

- IR coverage, closure thunks (lane IR-M1): a thunk whose target's result type is open now returns at its rep's own type (`repTyOf`), where that type is closed and maps back to the same rep. The thunk is marked (`irRetFromRep`), and the verifier checks that a marked thunk forwards faithfully: one call, its parameters in order at the callee's reps, and that call's value returned. 19 more thunks are claimed.
