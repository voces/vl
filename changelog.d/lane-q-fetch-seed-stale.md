## Infrastructure (Track F)

- **`scripts/fetch-seed.sh` no longer keeps a stale seed** (external report AE-003): a present
  seed without a `refresh-compiler.sh` provenance sidecar is compared with the release's
  `.sha256` (or `seed-v0`'s pinned hash) and refetched on a mismatch, printing which; one it
  cannot check fails loudly unless `VL_SEED_OFFLINE=1`, and a local build is left alone.
