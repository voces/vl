## Codegen, memory & runtime (Track B)

- **D16897, step 1; D2832 and D4883 closed:** `.length` of a union of lists now runs where a pin binds the receiver: an un-annotated parameter or lambda, or a generic's if-join of two list types. The pin types the read without rewriting the shared body, and the instance reads the length out of whichever list arm the box holds. Element reads and `for` stay open.
