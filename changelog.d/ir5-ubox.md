## Codegen, memory & runtime (Track B)

- **IR: a value boxed into a non-null value union.** A scalar, a literal or a box delivered into a non-null value-union box (an argument, a return, a declaration) takes the hole's shared box plan (`holeBoxPlanOf`), as a `T | null` box does; a returned call passed into a wider box keeps legacy's tail call, and a template hole an instance pins to a string stays legacy's.
