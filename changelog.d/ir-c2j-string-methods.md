## Codegen, memory & runtime (Track B)

- **IR cutover C2j, string `.slice` and `.cpLen`:** both methods go through legacy's own tails in the
  IR (`strSliceTail`, `strCpLenTail`), chosen by legacy's `exprIsStrMethod`. The IR covers 2,366
  more corpus functions and 133 more self-compile functions, every one matched. A method call the IR
  does not build is now named `method <name>` rather than `indirect call`. No emitted byte moves.
