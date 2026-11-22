## Codegen, memory & runtime (Track B)

- **IR coverage: a shared field read over a box whose member's field is `null`.** Legacy writes that arm as a constant with nothing read (the atom's `-1`, the bool niche's `2`, a null ref, `unreachable`, or the null-tagged box); `sharedArmNullOf` names which, and both emitters write `sharedArmNullTail` (distilled corpus `member box` 18 → 6).
