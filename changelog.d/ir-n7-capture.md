## Codegen, memory & runtime (Track B)

- **IR coverage, captured calls and capture reads:** a call of a capturing nested function whose argument legacy widens or boxes, a closure capturing a walk variable, and a capture whose binding type is open in its owning frame now build through the IR, byte-identical to legacy. tests/cases +21 covered = matched; fully IR-only programs 5,605 → 5,608.
