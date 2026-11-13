# The field recorder's name fallback is deleted, 2026-11-13

Lane A. `recordFieldElemRow` records each struct and variant field row's element type. When a
caller handed no type, it resolved the element's name (`fieldElemTyIxOfName`), a parse of the
spelling. A probe over the sweep population (24,215 programs) listed every call that reached
that fallback.

**Population before the change.**
- Nearly all of those calls had an empty name, which resolves to nothing and involves no parse.
- A non-empty name reached it in about 16 programs, through two callers:
  - `pushFieldRow` for a list of literal unions (`K[]`, `K0[]`): 14 programs.
    `fieldElemHintOfRow` declined that row on purpose, and the recorder re-derived the same
    type from the name.
  - The anonymous recorder for a ref-list field whose row is typed at the hole (D16061): 2
    programs. The field's key had been rendered from the value's recorded type, but that type
    was not handed over.

**The change.**
- `fieldElemHintOfRow` hands a literal-union list its projected row.
- `anonRefListKeyElemTy` hands an anonymous ref-list field the element type its key was
  rendered from.
- The re-run probe found 0 non-empty names without a type, so the fallback and its comment
  are deleted. D16061 closes.
- The two `isValueUnionName` sites in `iisPushFieldElem` ask `valueBoxOfTy` of the element
  type computed on the line above.

**Hint against name.** The probe also compared each hint with what its name resolves to,
under `tySame && tyEq`. No name from the two callers above disagrees with its new hint.
Existing hinted paths disagree in 49 programs (the probe recorded the first disagreement per
program). The hint already won in all of them, so nothing read changes. The coordinator's
grades:
- A hole-typed function hint against a scalar name: floor (checker coarseness).
- An alias against its structural spelling: one type.
- A literal union against its widened spelling: storage-identical by design, floor.
- `twin-fieldset-closure-field-string-vs-bool-result`: the field is
  `{f: (i32, i32, i32) => boolean}`, and its name is the `=> string` twin row's label, folded
  by layout. The program prints `false` at that site as it should, so the name was stale and
  the hint is the true type.
- `PView`, `EView` and `NK` are not instance copies. The hint is the newtype's brand, and the
  name resolves to its unbranded base. Filed as D16003.
