## Codegen, memory & runtime (Track B)

- **IR valued `if` joins at another rep:** a non-record valued `if` delivered at another rep than its own type's (a list of un-annotated-function records as an element of an annotated list) is typed at the rep it is held at, which the verifier refused before (rule 3); a ref `if` arm at another rep goes in by the cell converter instead of missing `ref if arm rep`. Claims `record-join-layout-prefix-runs.vl` and D2701's start body; the coalesce spellings move to the named `convert record -> nullable`.
