## Infrastructure (Track F)

- **Type parameters carry their declaration slot** (type hash-cons stage 1a–1d): `tySame` and the
  nested-generic test read `(binder, idx)` off the row, so `tyVarDeclOwner`, `tvNestOf` and
  `markNestRows` are deleted; `mkTyVarSlot` and a per-slot bound table serve L3's row variable.
  Output byte-identical.
