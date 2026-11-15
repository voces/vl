## Infrastructure (Track F)

- **Which writers move `tyMutEpoch` during emit** (type hash-cons stage 4e, a census; docs only).
  Over 19,779 files, three writers bump it during emit, in 194 programs: `applyGenAliasTys` (P6
  removes it), `tyPinElem` and `inferRetPublish`. The emitter's epoch reads delete together once
  those finish before emit.
