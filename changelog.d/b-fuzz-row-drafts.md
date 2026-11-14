## Infrastructure (Track F)

- **`fuzz-sweep.sh` drafts its findings:** each unsound finding gets a ready-to-file inventory row,
  `keep_<seed>/case_N.row.md`: minimised, de-duplicated, graded-as-filed, with its seed's repro and
  a family guess (`scripts/fuzz-draft-rows.sh`; `--no-drafts` skips it).
