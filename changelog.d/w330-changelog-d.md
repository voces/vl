## Infrastructure (Track F)

- **Changelog entries are one file per PR:** a PR adds `changelog.d/<branch>.md` (its section heading, then its bullet) instead of editing `CHANGELOG.md`, so concurrent PRs no longer conflict on GitHub, whose mergeability check ignores the `merge=union` driver. `scripts/changelog-fold.vl` folds the queue into `CHANGELOG.md` and rewrites the `changelog.d/FOLDED` pin; `tests/vl_changelog_d_test.ts` fails on a direct edit.
