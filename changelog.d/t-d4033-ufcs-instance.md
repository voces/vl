## Type system (Track A)

- **D4033 closed:** a member call at a type-parameter receiver (`x.grow(y)`, `xs[0].grow(xs[1])`, `p.a.grow(p.b)` in a generic body) resolves type-bound at each instance, so two instances whose types live in two modules each reach their own module's `self`-function. The same call in a nested function of the generic body is refused when two instances need two modules (D16383).
