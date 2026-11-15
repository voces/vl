## Infrastructure (Track F)

- **`tySameSet` and `tySameSpelled` compare canonical ids** (type hash-cons stage 4b): each is
  one `==` on `tyCanonSet` or `tyCanonSpelled`. Their walks, pair stacks, walk budgets, depth
  argument and pair memos are deleted (net −334 compiler lines). Output byte-identical.
