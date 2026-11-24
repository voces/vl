## Infrastructure (Track F)

- **A missing `wasm-dis` no longer reads as a plain differ.** `scripts/ir-identity.sh` stops, naming the disassembler, when the divergence baseline lists anything and `$WASM_DIS` is not executable; before, each listed program read as `DIFF` with no reason. `scripts/agent-setup.sh --host-check` fails on a worktree with no `node_modules/.bin/wasm-dis` and names the link.
