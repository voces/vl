# Step 7 D6: a map value's tagged function list is keyed by its `i32` list type (2026-11-13)

A list of functions whose holes a tagged set resolved to ids, such as `((_) => _)[]` as a map
value, is stored as an `i32` list. Its ref-list row is named `i32[]` (`fnTagListRepName`).
`rlKeyTyOf` declines the held type because it has a type variable. So the MV6 caller in
`mvShapeOfValNameArmTyGo`, and `ensureRefElemTys`'s kind-9 inner rung under it, interned the row
with no type, and the key came from re-resolving `i32[]`.

## The change

`rlKeyOrTagRepTyOf` (`emit_union_atoms.vl`) answers `rlKeyTyOf`, else, for a tagged list it
declines on its type variable, the `i32` list under the same depth (`rlTagListRepTy`). The
MV6 caller and the kind-9 inner rung (only where the rep rung named the inner row) pass it as
the key hint. This touches no site of lane B's.

## Refused version: every tagged rep

The same fallback for a record's struct row type and for a list of records also resolved
`collectAArrayLit`'s kind-9 outer `{fs:i32[]}[]`. In
`scripts/silent-sweep/distilled/named/d15220_run_element_binding.vl` the key agreed with the name
parse, but the type did not (`tySame` false). The row would then record a different `rlTy`, so
the change keeps tag lists only.

## Measured

Site-tagged probe, master `e243c499` against this branch, 24,236 programs. Every
`rlInternNameTyK` reach with no type is marked, and so is every hinted one whose key, `tySame`
type or stored name (`rlElemStoredName`) disagrees with the name parse.
- Resolved: the MV6 `i32[]`, `i32[][]` and inner `i32[]` reaches, in 4 programs (D15779,
  D9715, `hole-fn-list-map-value-tagged.vl`, `hole-fn-nested-list-map-value.vl`).
- New marks: none.
