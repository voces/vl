## Codegen, memory & runtime (Track B)

- **IR claim early-out:** a claim's build ends at the first node of a family no claim admits,
  since the function cannot be claimed. The self-compile's fuel falls 0.63%; no claim changes,
  the shadow modes still build every function whole, and no emitted byte moves.
