## Type system (Track A)

- **Fixed D17322** (clause 1): a generic function value assigned to a binding annotated with another type parameter whose generic function type no call closes (`let b: F = a1`, with `F` called at two types) was never compared with it, so `<T>(T) => string` was accepted into `<T>(T) => T` and reached emit. The value is now instantiated at the binding's parameters, the binding's type variables held rigid, and refused when it does not fit (`cannot assign <T>(T) => string to 'b' of type <T>(T) => T`), or when one of its type parameters is fixed by no parameter.
