## Codegen, memory & runtime (Track B)

- **IR S1a, the start body under the shadow:** the armed shadow now builds the start function as
  one IR body from legacy's merged order of top-level statements and global initializers, lowers
  it with legacy's pool-fill prologue and frame, and compares it with legacy's entry. A global's
  plain initializer is an `SGlobalSet`, and a promoted global is read and written as its start
  local. Two decisions are shared with legacy: `startInitArmOf` (how an initializer is written)
  and `promoSlotIn` (a promoted global's slot). Nothing is claimed yet. Its rows carry a `start`
  prefix. No emitted byte moves.
