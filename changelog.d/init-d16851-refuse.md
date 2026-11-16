## Type system (Track A)

- **D16851 loud** (clause 1 → clause 2): a maker returning only lambdas it writes, whose calls'
  values are delivered at two function types with no call building its own copy, is refused at
  check with the two-function-types sentence instead of building an invalid module or trapping;
  a build stops on a check error raised in the elaboration's preparation. The twin build that
  makes it run is next.
