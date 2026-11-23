## Codegen, memory & runtime (Track B)

- **IR claim: the atom hook is claimed.** RAtomSole, RAtomWide, RStrToAtom and RStrToAtomStaged move from the unclaimed `other` family to `scalar`, so a function whose only unclaimed node was an atom-hook read is now emitted by the IR. Claimed bytes equal legacy's (`ir-identity.sh --cases`, `--claimless` and `--names`, all differ 0), and the order check finds 0 rows. tests/cases claimed functions 70,651 → 70,713 (+62) and start bodies 6,347 → 6,355 (+8).
