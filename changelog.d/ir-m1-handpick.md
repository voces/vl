## Codegen, memory & runtime (Track B)

- **IR coverage: a bundle record handed to a one-closure parameter is the member legacy picks.** A bundle parameter or holder read passed to a parameter that takes one closure (legacy's `bundleArgArmOf` member arm) lowers as the record read and the `struct.get` of the member legacy's own `bundleMemberPickOf` picks, the new `RHandPick`; legacy's `emitBundleMemberPick` is split byte-identically to share it. tests/cases `argument coercion` 21 → 6, `start: argument coercion` 18 → 15, programs fully IR-only 4,904 → 4,910.
