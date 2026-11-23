## Codegen, memory & runtime (Track B)

- **IR coverage, a `null` member read out of a union-box field:** a field read whose legacy tail leaves the union box as it stands (`unionBoxTailLeavesBox`) is that box, so `print` takes its union arm from it, as legacy does (closes D17071). Corpus and tests/cases `print operand rep` SUMMARY; covered = matched.
