# Step 7 D6: lane E's last `nonNulBaseOf` callers go, 2026-11-13

Lane E, D6, co-owned with lane F, under the coordinator's twin ruling.

## `internNonLowerableFieldShapesTy` walks the record's type

This function descends the fields of a closure-result record that does not lower as a whole, so
each nested record and closure field still interns its own row. It split the record's spelling
into field texts, then peeled each text with `nonNulBaseOf` and `arrLeafNameOf` to a `{…}` leaf.

It now reads the `TyObj`'s field types:

- a function field is walked by lane F's `internShapeDeepTy`;
- any other field interns the record at the leaf of its non-null type's array spine, when that
  leaf is a record.

Its spelling split, its `nonNulBaseOf` call and `tyStepNulIf` are deleted.

## The declared-spelling preference is deleted

`variantRowAgree` and `armStageAgree` (`emit_union_atoms`) reconcile the element name a variant
and its struct row record for one field of one type. `elemNameIsDeclared`, which peeled `| null`
and `[]` with `nonNulBaseOf`, kept the declared spelling over the structural one. Under the twin
ruling the name is a label, so I ablated the rule:

- A probe compiler with the rule forced off produced 24,204 programs identical to master, bytes
  included.
- A second probe found the rule fires in 108 programs (`armStageAgree`; `variantRowAgree`'s arm
  never fires). In none of them does the kept label change a byte.

So `variantRowAgree` keeps the row's name, and `armStageAgree` and `elemNameIsDeclared` are
deleted.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `589ad226` against the candidate: 24,204 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass.
- Render-parse is unchanged at 2 parses. `nonNulBaseOf` keeps two callers, both lane F's:
  `rlElemStructRow` and `shapeFieldElemName`'s FC_STRUCT arm (the `sFieldElemName` re-key). It
  and its parse go with them.
