## Infrastructure (Track F)

- The lane brief drops lane-side corpus A/B and identity runs (CI's `ci-ir-identity` is that proof),
  records the coordinator's standing rulings so lanes stop waiting on repeat questions, and points
  lanes at the I8 draft's red list as their work source.
- `scripts/land-check.sh <pr>` lets a lane merge its own PR: it prints `LAND-OK <sha>` only when every
  CI run on the head is green, GitHub reports the PR mergeable, and master plus the PR typechecks.
