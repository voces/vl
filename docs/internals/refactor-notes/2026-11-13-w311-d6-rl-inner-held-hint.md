# Step 7 D6: a ref-list's inner row is keyed by the held element type (2026-11-13)

`ensureRefElemTys`'s kind-9 arm (`emit_union_atoms.vl`) interns a list-of-lists element's inner
row first. Its key hint was the stored type's element, `tyStepElem(ty)`. When the outer call
held no stored type (`ty == -1`), the inner row was keyed by its spelling
(`repElemIdOfNameTy(name, -1)`), even though the caller still held the element type as `kindTy`.
The inner hint now falls back to `rlKeyTyOf(innerKindTy)`. A type `rlKeyTyOf` declines (one holding
a type variable, or a function inside a record or list) still reaches the name, by design.

This is caller-side only: the body of `rlInternNameTyK` is lane B's and is unchanged.

## Probe (lane B's method, master `577f120b`, 24,227 programs)

At the intern, every reach whose key hint was -1 was graded against the caller's `kindTy`:
`k`/`K` says whether the key is the same, and `t`/`T` whether `tySame` agrees with the name's
resolved type. The grades for the inner recursion count programs per site path (a program can
reach two depths, so the rows overlap):

| path | `kt` | `K` or `T` | `x` (declined) |
| --- | --- | --- | --- |
| `K9>in>…` | 52 | 0 | 6 |
| `MH>in`, `FRL>in` | 2 | 0 | 0 |
| other callers' `>in>…` | 51 | 0 | 6 |

Lane F's other six sites (`ensureRefElemKindTail`'s tail, `forceRefListOfTy`, and
`collectAArrayLit`'s NEST, SHAPE, K9 and MH calls) reach the intern either hinted or with a type
`rlKeyTyOf` declines, so they hold no hint to pass.
