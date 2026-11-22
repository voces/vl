## Codegen, memory & runtime (Track B)

- **IR: a function with a declaration-time address fold stays legacy's.** A `const p = K + bounded`
  that legacy keeps in a scratch local is now a named miss for its whole function, so a claimed
  function can no longer ship the unfolded memory offset or drop the scratch local. No emitted
  byte moves.
