## Codegen, memory & runtime (Track B)

- **IR: a one-group spread literal lowers:** `[...xs]`, `[...f()]` and `[...[1, 2]]` build through `RSpread`, reading the plan legacy's own arm now reads (`spreadPlanOf`, moved to `emit_plan_list` with the helpers it decides from) and the shared group stash and join tails, into the literal's recorded slots; a list literal's build rides on `RMakeList`. A boxing, converting, sub-row or many-group spread is a named miss.
