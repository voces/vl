## Codegen, memory & runtime (Track B)

- **IR claim: RNumUnionConvert and RNulNoneBox are claimed.** Both had builders and were still filed in the unclaimed `other` family. RNumUnionConvert moves to `scalar` beside RNumUnionBin, and RNulNoneBox to `box` beside RNicheRead. Claimed bytes equal legacy's (`ir-identity.sh --cases`, `--claimless` and `--names`, all differ 0), and the order check finds 0 rows. tests/cases claimed functions 71,032 → 71,059 and start bodies 6,421 → 6,429.
