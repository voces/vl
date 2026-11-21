## Codegen, memory & runtime (Track B)

- **IR: a value `if` joined at a union builds at the box blocktype:** each arm runs its prelude and writes its value boxed into the join's union, and a missing `else` writes the null box, as legacy's `emitUnionIfValue` writes them.
- **IR: a list element before a valued `if` is staged below it:** `[n, if c { 1 } else { 2 }]` builds in legacy's order, as a call's arguments do (`irBStageLeads`), where it failed to lower before.
