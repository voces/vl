## CLI (Track C)

- **The seed's compiled form lives only in the private seed cache (owner ruling, option C):** `vl` reads and writes the on-disk seed's `.cwasm` only in `$VL_SEED_CACHE_DIR` (default `seed/` under the user cache), keyed by the seed's content, never beside the seed in a checkout, so a `.cwasm` committed to a cloned repository is never run. `vl seed --cache-dir` / `--cache-files` name the directory and a seed's entries; CI caches `$RUNNER_TEMP/vl-seed-cache`.
