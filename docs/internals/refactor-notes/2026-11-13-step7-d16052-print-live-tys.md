# D16052 close, step 2a: a print plan's narrowing keeps members by box arm, not spelling, 2026-11-13

`printUnionPlanCode` (emit_fn_scans) drops the members a narrowing excluded. It used to read the
narrowed type's member atoms (`printNarrowLiveAtoms`, from a row-less slice's atom column) and
keep a box member whose spelling was among them. Now `printNarrowLiveTys` (emit_union_registry)
returns the narrowed member types, and `printPlanTyLive` keeps a box member when either:
- the two members ride the same value box arm (`boxTagOfTy`; `null`, as -1 or as its primitive,
  is 6); or
- neither has a value tag and they are the same type under the same declaration (`tySame`,
  `armDeclSame`).

## Decision table (probe over 24,020 corpus and witness files)

| | programs |
| --- | --- |
| narrowed print plans | 24 |
| typed decision equals the spelling decision | 15 |
| differs: the literal-union arm `AB` (or an inline `"a" \| "b"`) beside its narrowing | 9 |

In those 9, the narrowed set spells the literal run differently from the box's alias, so the
spelling check dropped the `AB` arm even though the narrowed type contains it. The typed check
keeps it. All 9 programs print the same output either way, and the CI sweep grades it.

A first draft compared raw types with `tySame`. That split `null` (-1 against the `null`
primitive) and literal unions from their alias or base, hence the box-arm rule.
