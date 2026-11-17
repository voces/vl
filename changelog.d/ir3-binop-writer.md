## Codegen, memory & runtime (Track B)

- **IR op-seam slice C4, the scalar binary-operator writer:** `emitBinNumeric`'s four width arms
  are one width-generic arm, and float `%`'s promote/call/demote sequence, written three times
  (legacy's two writers and the IR's lowering), is two shared writer halves. Byte-identical; 0
  per-occurrence mismatches over 77,843 self-compile and 151,828 corpus operators; compiler net −29 lines.
