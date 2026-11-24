## Infrastructure (Track F)

- **The gate checks that a shipped build is never worse than the claimless one:** a new row, `ir claim cross` (`ir-parity.vl --cross`), builds and runs every capability probe, every IR pin and a fixed 1-in-12 of `tests/cases` both ways. It reds when the shipped seed fails to build, or runs otherwise, where the claimless compiler builds and runs clean. It costs about 121 CPU-s. `ir-parity.vl` gains `--cross`, `--pop pins` and `--sample N`.
