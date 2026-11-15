## Codegen, memory & runtime (Track B)

- **IR step I1b-2:** the compiler can claim a function for the IR. When every node of a function is in a
  cut-over construct family, the IR's lowering writes its code and legacy's body emission does not run.
  No family is cut over yet, so no byte moves. Claiming the I1 families over the whole distilled corpus
  gives byte-identical output. `ir-shadow.vl` now runs in `scripts/gate.sh`, and global storage
  decisions take their emission context as an explicit argument.
