## Codegen, memory & runtime (Track B)

- **Three unreachable `??` refusals removed:** the `string|null` arms of the value-union `??` lowering (binding, call result, union field) were refused at emit, but no program can reach them. `string | null` is never boxed, and every string spelling, narrowed or not, lowers through the `nulstr` niche first. Emit refusal sites go from 850 to 847. D3172's ablation now records that a narrowed box with a numeric residual (`i32 | string | null` narrowed to `i32 | null`) refuses too.
