## CLI (Track C)

- `vl check`/`fmt`/`test` over a directory walk a user's `dist/` and `reference/`; only `node_modules` and `.git` are skipped (`--exclude` drops any other). The draft Homebrew formula is deleted and backlogged, and ci.yml's editor-suite step fails on a missing seed instead of skipping (`seedPresent`, tests/support/tree.ts).
