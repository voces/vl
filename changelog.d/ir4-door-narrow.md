## Codegen, memory & runtime (Track B)

- **IR door guard, per context (ir-design §10.2.1 step 1):** `legacyContextLiveWhy` takes the
  fragment's root.
  - A held coercion or a storage read misses only on the root.
  - A staged operand misses only inside the root's subtree.
  - An open list-build region misses only through a counted push inside it.
  - The coercion seats, `armServed` and the two lexical frames no longer miss.

  At the list-literal door, the remaining live hits fall to the 3 push-receiver casts. No emitted
  byte moves.
