# IR coverage: captured and function-name reads (2026-11-25, lane COV-CLOS)

The 2026-11-20 I8 census put `read of <name>` at 2,042 / 1,058 / 23 distinct functions (tests/cases,
witnesses, probes) and `closure env capture` at 717 / 148 / 5. IR-N6 and IR-N7 closed nearly all of
it. On master 7eddff27 the classes held 16 + 11 start bodies / 4 + 5 / 0 and 2 + 3 / 0 + 3 / 0. This
PR closes `read of <name>` on every population and two of the eight `closure env capture` rows.

## Mechanisms (one commit each)

| mechanism | what the IR did | now | rows cleared |
|---|---|---|---|
| tagged-set name as a closure | a function name typed as a tagged set's id (`fnTagTyIsTagged`) at a read the set marks no leaf was read at its own rep, the set's `i32` | the closure its destination holds (`taggedNameCloValue`), as `emitIdentNode` writes `emitClosureValue` whatever the type | hole-function names (`inc`, `add`, `id1$1`, `inc0`) and maker instances' `return k` |
| cloned range loop | an instance clones a range loop's header; its body's reads name the source `ForRange`, which `ibDeclVar` did not hold | the loop variable, and an unrolled copy's constant, are also keyed by `nodeSrc` | `read of i`/`j` in hole instances (D16746's witness) |
| carried nested capture | a lambda that calls a capturing nested function carries its captures unread, so `liftCapDecl` found no binding | the walk follows a named nested function that captures the name, unless the lambda reads it through its cell | D3633, a module block's function called from a lambda |

## Census (O1), master 7eddff27 → head, every program of each population (`census.sh`'s probe)

| population | distinct claimed | `read of <name>` fn + start | `closure env capture` fn + start |
|---|---:|---:|---:|
| tests/cases (9,347 files) | 44,370 → 44,391 of 45,442 | 16 + 11 → 0 + 0 | 2 + 3 → 2 + 2 |
| witnesses filed `runs` (5,092) | 11,417 → 11,422 of 11,599 | 4 + 5 → 0 + 0 | 0 + 3 → 0 + 2 |
| probes (282) | 644 → 644 of 650 | 0 → 0 | 0 → 0 |

No function lost its claim on any population. One start body moved on: in
`captured-hole-fn-handed-on-two-generics.vl` the start is claimed and `viaReturn$1` shows its
`rep unsup`.

## Left in `closure env capture`

- A closure built in a global's initializer block over that block's local (`capture-module-value-
  block-local.vl`, D13081, D3383): the start body's own declarations (`ibStartRoots`) leave out the
  initializers it builds, so `liftCapDecl` finds no binding. Adding them claims the three, with
  claimless-identical bytes, but the armed shadow then mismatches each start as `prefix or locals`:
  built after legacy, the IR declares the block's value local non-null where legacy, and the claim
  built before it, hold it nullable with a `ref.as_non_null`. That order dependence is on master
  already (`const x = @B { const w = "q"; w + "z" }` mismatches the same way with no closure), and
  the `ir shadow cases` ratchet refuses the two new mismatch rows, so the mechanism waits for that
  fix (next PR).

- `heap-capture-annotated-binding-block.vl` `@start`: the capture slot is `J`, a record type with no
  struct row of its own; the binding holds `{ f: null }`'s row. Needs the rowless-record read that
  globals have (`globalRowlessTy`) at an environment slot.
- `capturing-nested-function-read-from-another-frame-equality.vl` `looped`: a lambda reaches a
  capturing function through its cell; the cell's closure needs `k`, which legacy reads through
  emit-time scope state (`scopeSlotOf`). Following the cell made the claim fall back, so it is left.
- `maker-delivered-at-two-function-types.vl` `counted`: a maker's hole lambda per signature captures
  `k`, whose capture has no rep (`capRepOf` -1).

## Q58 sweeps

`tests/cases/closures/tagged-name-closure-value-positions.vl`,
`range-loop-var-in-hole-instance-positions.vl`, `lambda-carries-nested-capture-positions.vl`. Each runs, prints its `@log`, and is claimless
identical. Positions uncovered in classes this PR does not touch: the closure into a
`((n: i32) => i32) | null` parameter (`argument coercion`) and the `??` over a nullable closure
(`coalesce nulRef default rep`).

## Legacy tails the IR calls

None new.
