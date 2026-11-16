## Type system (Track A)

- **D16846 closed** (clause 2) and **D16850 closed** (clause 1, invalid wasm): two calls of a
  maker with an un-annotated parameter, at two pins, each bound and handed on to a parameter that
  calls it at its own signature, are each built at their binding's type. D16845, D16851 (clause 1)
  and D16852 are filed open.
