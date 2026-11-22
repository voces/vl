## Codegen, memory & runtime (Track B)

- IR coverage: a read typed at its binding's still-open type in an instance takes the variable's storage where legacy's cell holds the closure the IR retyped it to, and a return, record field, element read or shared local at an open type takes a value whose valtype legacy writes alike (`repStoresAs`, one rule for builder and verifier).
