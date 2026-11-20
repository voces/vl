## Testing

- The kind-ladder lint's closed sets and set-typed fields are row tables keyed by name
  (`klSets` and `klFields`, each ordered by name) instead of positional
  parallel arrays, so a PR adding a set or a field adds one row and no longer renumbers others;
  `scripts/ladder-sets.vl` checks the order.
