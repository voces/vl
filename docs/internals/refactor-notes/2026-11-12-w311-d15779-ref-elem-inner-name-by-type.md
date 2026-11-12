# D15779: a nested ref-list's inner row is named by a closed type, 2026-11-12

`ensureRefElemTys` (`emit_union_atoms.vl`) names a nested ref-list's inner row from its kind
type's element. Where that element still held an inference hole, it fell back to the spelling,
`refArrElemName(elemName)`. Probed on the 3 fixtures that reach the fallback, the kind type held
`(_) => _` while the spelling held the resolved form (a tagged set's `i32` ids, or the hole's
pinned signature). Two changes give the floor a type:
- the inner row is also named from the stored type `ty`'s element, which a tagged set has
  resolved to ids;
- `collectAArrayLit` hands a list literal's element type through `arrLitClosedElemTy`. Where the
  element holds a hole, that is the one closed type the elaboration records for the literal's
  instances (`elabNodeInstTys`), or for its lead inner list's functions (`elabListFnElemTy`).
  These are the facts mono already pins from. It covers the kind-9 arm and the empty-literal arm.

Validated `emitFail` probes: before the change the fallback fired on 3 of the 7,816 fixtures;
after it, on 0, on none while self-building `compiler/entry.vl`, and with no runs → not-runs over
the distilled corpus. The fallback is deleted.

## Measurement

| measure | before | after |
| --- | --- | --- |
| fixtures reaching the spelling fallback (probe) | 3 of 7,816 | 0 of 7,816; none in the self-build |
| the 3 fixtures' modules | — | byte-identical |
| distilled corpus cells, per-cell JSON against a seed of master | — | 0 differ |
| emitter type-string parses in `emit_union_atoms.vl` | 1 | 0 |

The name-based ref-list cluster's last external root is `iisPushFieldElem`'s code-5 spelling,
D15778, which waits on Family B's keying decision.
