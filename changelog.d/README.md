# changelog.d — pending CHANGELOG entries

A PR never edits `CHANGELOG.md`. It adds ONE new file here, `changelog.d/<branch>.md`:

```
## Type system (Track A)

- **D12345 closed:** what now runs, in CHANGELOG's terse one-line style.
```

The first line is a `CHANGELOG.md` section heading, copied exactly; the rest is the entry's
bullet(s). A new file per PR means concurrent PRs never conflict on GitHub.

The orchestrator folds the queue in a docs PR: `vl run scripts/changelog-fold.vl` (from the
checkout root) moves each entry to the head of its section in file-name order, rewrites
`FOLDED` and deletes the entries; `-- --check` validates without writing. If a direct edit reaches master anyway, `-- --repin` accepts
`CHANGELOG.md` as it stands and re-pins it.
`tests/vl_changelog_d_test.ts` fails when `CHANGELOG.md` no longer matches `FOLDED`, which is
what a direct edit does.
