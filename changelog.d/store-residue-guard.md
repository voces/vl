## Infrastructure (Track F)

- **Late tag residue is ratcheted:** `scripts/late-demands.vl` now also records each function set the tag decision after the elaboration changes, with the reason the check left it (`scripts/late-tags-baseline.txt`, 458 rows in 249 programs). `--check` fails on any row the baseline does not hold, so the late decider can only shrink.
