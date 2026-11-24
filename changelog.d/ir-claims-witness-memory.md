## Infrastructure (Track F)

- **The `ir claims` gate row no longer OOMs on a 15 GB box:** `ir-shadow.vl` builds the programs `heavy-programs.txt` names after its fan-out, in one process, so two multi-GB witnesses (D3417, D3465) never build at once. `gate.sh` budgets the row at its measured 4.6 GB, not the 200 MiB default. A test keeps the list resolving.
