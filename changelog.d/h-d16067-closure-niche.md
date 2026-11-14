## Type system (Track A)

- **The `as` trio runs over a nullable function value (D16067).** `x as! F` hands back the
  closure, `x as? F` keeps the `F | null`, and a propagating `x as F` returns the enclosing
  function's null on a miss. The closure cell is the closure struct's own nullable ref, so it
  takes the niche lowering the other ref payloads use. The trio now covers every nullable-ref
  payload: string, list, record, map, union variant and function value.
