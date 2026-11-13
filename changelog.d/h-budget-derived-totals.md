## Infrastructure (Track F)

- **Budget baselines derive their totals.** A `vl check --budget` baseline now
  stores its budgeted `codes` instead of a `total`, and the total is summed from
  the per-file rows. Concurrent PRs lowering different files no longer conflict
  on one line, and two identical lowerings can no longer merge into one and
  loosen the ratchet. All nine baselines are migrated.
