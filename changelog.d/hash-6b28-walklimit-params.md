## Infrastructure (Track F)

- **`walk-limit` tightened and tested:** a depth countdown's floor (`<= 0`, `< 0`, `< 1`) is a finding
  only on a parameter of the enclosing function, so a local holding a computed depth stays silent;
  a camel-case `…Depth` / `…Budget` counter at a real bound is a finding (its `<= 0` is a nesting
  test). `tests/vl_walk_limit_test.ts` holds the firing and silence controls. The baseline is 583.
