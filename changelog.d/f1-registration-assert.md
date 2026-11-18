## Codegen, memory & runtime (Track B)

- **A union row registered once the rows are final is refused:** `unTyKeyPushRow` fails the emit with the union and its producer (an inline, declared or value union) when `registerReachRows` has already run, so no rep read after the step can miss a row. The census runs on the `sweep` label as its own job.
