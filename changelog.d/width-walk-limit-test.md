## Infrastructure (Track F)

- **`walk-limit` covers `depth < 0` and camel-case counters, with a test:** a depth countdown's
  `< 0` and a camel-case `…Depth` / `…Budget` counter at a real bound are now findings (a
  camel-case counter's `<= 0` is a nesting test and stays silent); `tests/vl_walk_limit_test.ts`
  holds the firing and silence controls. The baseline moves from 558 to 586.
