## Tooling & tests

- **The sweep's owed list accepts a designed trap.** A clause-1 fix whose witness ran wrong and
  now stops at the run-time error the design gives it (a `__trap__` with a sentence, such as
  a read before the first write) lists it as `<cell key> <D-id> trap: <sentence>` in
  `scripts/sweep-owed.txt`. `diff` accepts that move only when the new trap is a `__trap__`
  whose last printed line contains the sentence; any other trap still blocks. A recording's trap
  line now carries what the program printed last (`said`).
