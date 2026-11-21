## CLI (Track C)

- **`vl fmt` keeps a list or an or-pattern arm written one member per line.** A scalar list whose elements each start their own line stays one per line, and so does a `match` arm whose or-patterns do (`A |` / `  B => …`). Formatting is byte-identical on every tracked `.vl` file. The IR kind lists (the `Rhs` and `IrNode` unions, the long match arms over them in `ir.vl`, `ir_verify.vl` and `ir_lower.vl`, and the lint closed sets mirrored from `ir.vl`) now use that layout, so two PRs adding different nodes merge. The seed is byte-identical.
