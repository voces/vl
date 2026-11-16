## Infrastructure (Track F)

- **`walk-limit` lint rule and ratchet:** a depth, hop or step counter compared with a fixed bound
  in `compiler/*.vl` is a `walk-limit` finding (mode flags over 1000 and sentinel loop exits are
  skipped), held per file by `vl check --budget scripts/walk-limit-budget-baseline.json` at
  today's 611; each conversion to a revisit-terminated walk lowers it.
