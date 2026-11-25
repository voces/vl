## Infrastructure (Track F)

- **CI runs the IR byte-identity proof:** a new `ci-ir-identity` job (4 shards) runs `scripts/ir-identity.sh --cases` and `--claimless` on the seed the `seed` job proved, on every pull request that touches the compiler, std, a program it builds or the divergence baseline, and on every push. A differ the baseline does not list reds the job and names the program in an error annotation. `ir-identity.sh` gains `--shard i/n` and `$IR_IDENTITY_CLAIMLESS` (one claimless compiler for both modes).
