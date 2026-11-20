## Codegen, memory & runtime (Track B)

- **IR decision modules 3b-1b, a narrowed union-box read:** a box local the checker narrowed to
  one atom is read unboxed through one shared decision, `identUnboxAtomOf`, which legacy's `unbox`
  arm and the IR's narrowed local read both ask; the IR now claims those reads instead of missing.
  No emitted byte moves.
