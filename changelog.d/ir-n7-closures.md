## Codegen, memory & runtime (Track B)

- **IR coverage, cached closure environments:** a closure whose environment the frame caches, capturing the frame's own capture, now builds through the IR, byte-identical to legacy. tests/cases +24 covered = matched; fully IR-only programs 5,574 → 5,576.
