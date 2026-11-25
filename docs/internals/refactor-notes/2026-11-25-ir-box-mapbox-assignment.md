# IR box family: `mapBox` and an assignment under a leading box (2026-11-25, lane COV-IS)

Two `box *` classes, measured by a probe that names which `ladder` exit of `holeBoxPlanOf` each
`box ladder` miss took. A scratch copy tags every exit with its line.

## `box ladder`: which exit (tests/cases and witnesses, master 7eddff27)

| exit | functions | what it is |
|---|---:|---|
| map read of a union-valued map (`mapReadBoxPlanOf` then `boxStored`) | 25 | legacy's `emitMapGetUnionBox` rung |
| a value with no scalar base (`tyScalarBasePrim` null) | 12 | several coerce rungs: nested lists, nullable maps |
| a ref-list arm with no carrier tag | 7 | |
| the rest (no `pk`, an `if` join, a `never` call, a mismatched union) | 19 | |

## What landed

- **`mapBox`**: `holeBoxPlanOf` names a union-valued map read into a box as its own arm. Legacy
  still writes it through its ladder (`unionBoxArgLadders`), so legacy's bytes do not move. The IR
  reads the stored box whole (`RMapGet.mtWhole`: the `unionBox` arm, no narrowing unbox, no
  element-read row), then writes `mapBoxTail`: the wide arms' retag chain, then the members'
  retag where the box owes it. That is what `emitUnionBoxArg` writes after that rung.
- **An assignment under a leading box**: legacy writes the box's tag, then the assignment's store
  and value. An assignment value now notes its span (`tagSpanNote`), and `boxTempIn` hands a
  leading box over that span to the lead-first lowering the tag dispatch already uses
  (`irBoxLeadFirst`). `deliver`'s check for statements below a lead stops at the span. The box's
  immediate stands for the assignment, whose store is the span (`bxFree`).
- **Named misses kept**: a box whose plan writes no leading head (`box of an assignment`), and one
  over an operand built just before the span (`box of an assignment after an operand`). That
  operand is a temp written where it is read, so the head would land above it, as a first try
  showed (bytes `call at 0x20 vs 0x41`).

## Legacy tails the IR calls

- `mapBoxTail` (new, `wasmEmit`): `wideRetagPairs`, `emitWideRetagChain` and `boxRetagTail` after
  the box.

## Census (restricted to the 41 tests/cases and 20 witness programs these classes held)

Base rows from master 7eddff27; head on this branch.

| reading | base | head |
|---|---|---|
| tests/cases distinct functions claimed | 316 of 417 | 341 of 417 |
| tests/cases `box ladder` / `box of an assignment` | 39 / 24 | 22 / 0 (+16 `… after an operand`) |
| witnesses distinct functions claimed | 18 of 30 | 25 of 30 |
| witnesses `box ladder` / `box of an assignment` | 10 / 2 | 5 / 0 |
| start bodies claimed (cases, witnesses) | 40, 12 | 41, 14 |

## Witnesses (Q58 position sweeps, armed shadow)

- `tests/cases/maps/union-map-read-boxed-positions.vl`: into the map's own union and a wider one,
  as a call argument, a return, an annotated `let`, an assignment, a record field, a list element,
  an `if` arm value, a `??` default and a `??` operand. Base: 2 `box ladder`. Head: 5 of 5
  matched.
- `tests/cases/assignment/assignment-value-boxed-positions.vl`: a literal, a call and a compound
  assignment, into a local, a field, an element and a global, as a call argument, a return, a
  `let`, a record field, a list element, an `if` arm and a `??` default. Base: 1 `box of an
  assignment`. Head: 4 of 4 matched.
