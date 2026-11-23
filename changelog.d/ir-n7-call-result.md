## Codegen, memory & runtime (Track B)

- **IR coverage, direct call results:** a direct call whose callee returns a value at another rep than the call's type (a hole function or a pinned generic through a lifted binding) builds through the IR at the callee's rep, byte-identical to legacy. tests/cases +20 covered = matched; fully IR-only programs 5,669 → 5,683.
