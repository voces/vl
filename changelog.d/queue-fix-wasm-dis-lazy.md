## Infrastructure (Track F)

- `ir-identity.sh` checks for `wasm-dis` only when a listed divergence actually needs reading, so a run with no binaryen (CI shards without `node_modules`) no longer stops on every `--compare` (master-red fix for #9948).
