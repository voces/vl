## Codegen, memory & runtime (Track B)

- **I8 census names the tree it measures:** `census.sh` prints the compiled `compiler/` tree's hash (`+dirty` when it differs from HEAD) in its header and `summary.txt`, and takes `--tree <dir>` so a before arm can build a merge-base checkout's compiler instead of the head's.
