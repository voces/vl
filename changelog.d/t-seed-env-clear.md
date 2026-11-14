## Infrastructure (Track F)

- **Native tests that clear their environment keep the seed cache:** `seedEnv()` carries `$VL_SEED_CACHE_DIR` with the ISA pin, so a `clearEnv` spawn no longer JIT-compiles the seed on every run (ci-native shard 4 took 263 s against 22 s).
