## Codegen, memory & runtime (Track B)

- The slot store's call-result pass (`eplCallResults`) now ends when a round draws no new edge, rather than after at most eight rounds, so a deep chain of calls through function values can no longer be cut short without a word. No program's output changes.
