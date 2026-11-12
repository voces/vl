# Step 7, lane H: a list binding's declared element by type, 2026-11-12

`listAnnNameOf` (`emit_closure_sites`) was the last unowned NAME classifier the census graded
for conversion (`2026-11-12-step7-vkind-name-classifiers-graded.md`). It returned the
annotation text of a list's parameter, `let`, global, one index level of one, or a direct
call's declared return. Its premise: "inside a monomorphized instance the checker never typed
the cloned body, so only the substituted annotation is left". A comment beside its
`listElemIsBool` caller added that substituting the arena twin broke
`generics/bool-list-arg-print.vl` (B77).

## The premise, probed

The annotation node is typed in an instance: `nodeTyIxOf` reads it under the instance key,
which is how `tyIsBool` already reads a parameter's type node. The probe (scratch compiler,
24,070 programs, a control tag checked on every program) ran the name path and the type path
side by side at both callers:

| caller | agree | disagree |
| --- | --- | --- |
| `listElemIsBool`'s declared-element rung | 1,608 (1,040 numeric, 565 none, 3 boolean) | 0 |
| `exprBoolListCode`'s annotation rung | 413 (250 none, 163 code -1) | 0 |

The first type walk disagreed on 16 programs. These belong in the twin, not the floor:

- 15 were numeric literal sets (`type K = 0 | 1; const ks: K[]`), whose spelling renders `i32[]`.
  The element's scalar is the set's base (`numLitUnionBaseName`).
- 1 was D4320's `i32[] | K[]`, a union of lists that share one rep and render as one spelling.
  A union answers when every member list agrees.

B77 no longer reaches either rung; the control showed the program is probed.

## The change

- `listAnnTyOf` returns the annotation node's type; one index level takes the `TyArray`'s
  element.
- `listAnnElemScalar` reads the element's scalar, an exhaustive `match` over the `Ty` kinds.
- `exprBoolListCode` takes `tyBoolListCode` of that type.
- `boolListCodeOfName` (`emit_map_twins`) loses its last caller and is deleted.

**Measurement:**
- **Sweep** (`sweep.vl diff`, master `82ca1ef1` against this, fixpoint seeds on both sides):
  24,196 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps.
- **rep-classifier-census:** NAME 23 → 22 classifiers (50 → 47 call sites); REPNAME 90 → 89
  call sites. With #7668 the NAME column reads 21.
