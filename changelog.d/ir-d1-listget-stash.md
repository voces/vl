## Codegen, memory & runtime (Track B)

- **A `.get(i) ?? d` nested in another's operands reads its own list again** (D17381, was silently wrong). A fused `.get` whose receiver or index is a call stashes it once; a second such `.get` nested in the first's index, default or receiver argument wrote the same stash, so the outer read the inner list, printing the wrong element or trapping. Each nesting depth now has its own stash, and a depth-1 `.get` is byte-identical.
