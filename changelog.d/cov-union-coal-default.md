## Codegen, memory & runtime (Track B)

- **`n ?? Z` over a literal union runs when `Z` is a `const` bound to a member literal (lane COV-UNION):** `vl check` accepted it and `vl build` refused it (`?? over this nullable value is not supported yet`). The atom-niche arm now admits that default as its member's atom, in both legacy and the IR, which delivers it at the atom as `const d: K = Z` does.
