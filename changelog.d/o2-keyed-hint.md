## Type system (Track A)

- **A shape-suffixed name suggests the method that replaced it:** `a.ltF32x4(b)` and `ltF32x4(a, b)` are refused as before, now with `; did you mean \`a.lt(b)\`, the \`lt\` that takes \`F32x4\`?` when a receiver-overload set `lt` the call reaches has a candidate on the type the name ends in. Generic, with no table of retired names; a non-head suffix, a prefix with no set, a shadowing local and a receiver of another type get no hint.
