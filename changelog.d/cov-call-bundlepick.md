## Codegen, memory & runtime (Track B)

- **IR raises the refusal for a bundle result used at none of its signatures:** a direct call of a function returning its parameter called at two signatures, whose value is used at neither (a map's value, a holder a lambda captures), is refused by legacy at `emitBundleResultPick`. The IR raised none and, armed, reported `internal: the IR's plain closure call disagrees with legacy's`, which at I8 would be its first error (D17096, D17106, D17585). It now raises legacy's sentence itself (`bundlePickRefused`), inside the claim's soft scope.
