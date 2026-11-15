## Type system (Track A)

- **D16278 closed (clause 1):** a list of records holding un-annotated functions that return different types, read straight off a call (`take(mk().a)`) into an un-annotated parameter that calls each field, checked clean and trapped (indirect call type mismatch); it is now judged through the call's returned values and refused as the same list read through a binding is (every function a call through the place may run must return one type).
