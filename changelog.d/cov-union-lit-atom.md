## Codegen, memory & runtime (Track B)

- **IR holds a binding of a single string literal as the atom legacy keeps it as (lane COV-UNION):** `const k = b.kind` under `b is B` (`kind: "a"`), or `const v = r.k` after `r.k = "zz"`, is the atom node typed at its literal, which prints, interpolates and compares as that text.
