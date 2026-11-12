## Codegen, memory & runtime (Track B)

- **Step 7, struct name producers cut 3:** a field typed as a union arm finds the arm's heap-twin row by the field's type, not by its spelling (`armFieldStructRow`, `armTwinRowName`). Identity on the corpus.
