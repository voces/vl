## Infrastructure (Track F)

- **A PR that fixes a filed row no longer reds ci-witnesses.** `scripts/check-filed-witnesses.vl --gate` passes a row whose witness now runs and prints exactly its `Want:` block. It prints `D<id> now meets its Want: close it` with the row's path and, on GitHub Actions, adds a warning annotation. Any other movement still fails, including output other than the Want and a Want-less row that now runs. CI's ci-witnesses and gate.sh's `filed witnesses` row run `--strict --gate`. Plain `--strict` still reports a fixed row as MOVED, for local auditing.
