## Infrastructure (Track F)

- **`refresh-compiler.sh` no longer swaps a seed silently:** a seed that cannot compile `compiler/*.vl` is a loud exit 1 with the seed untouched; only `--allow-refetch` (CI's restored caches, `agent-setup.sh`) re-fetches `seed-latest` and retries. The silent swap built a source the seed refused with master's compiler and passed for a fixpoint (`tests/refresh_compiler_refetch_test.ts`).
