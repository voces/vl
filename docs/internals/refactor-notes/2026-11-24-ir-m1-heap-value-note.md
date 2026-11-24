# IR heap identity 4b: a struct literal's temp carries the heap it was built at (2026-11-24, lane IR-M1, D17083)

`function mk() { return { r: { f: inc0 }, s: { f: dbl } } }`, called as `mk().s.f(3)`, missed with
`return coercion`. A diagnostic build of the four d15221 cells shows where the miss comes from:

| | outer | `r` kid | `s` kid |
|---|---|---|---|
| value | `rep6`, heap -1 (built at row h2) | `rep7` @ h0 | `rep4` @ h1 |
| result | `rep9` @ h2 | `rep3` @ h0 | `rep4` @ h1 |

The kid heaps already agree, field by field. The gap is the outer rep: its type `{r: {f: (i32) =>
i32}, s: …}` names no heap (`recHeapOf` -1), although `objLitAt` wrote it with `struct.new` at the
result's row. `recRowRetag` needs a heap for both reps, so the retag was refused. My pre-review had
assumed the siblings were one rep on two heaps. That was wrong, and a per-rep note was never the
missing fact.

## The mechanism

- `irVarHeap` (`IrFn`) maps a record temp to the struct heap it was built at. Only `objLitAt`
  writes it (`builtAtRow`, arm `struct`), with the row it built at.
- `recValRetag(f, v, src, dst)` (`ir.vl`) holds when:
  - `src` and `dst` are plain records and differ;
  - `src`'s rep notes no heap of its own;
  - temp `v`'s heap is `dst`'s;
  - the fields lower alike by name (`fieldsLowerAlike`).
- Its readers are the return arm (`recValRetagNoted`, which notes both reps' kids first) and the
  verifier's `RRetag` arm.
- A join (an `if` value, `??`) makes another variable, which has no note. So the note never crosses
  a join: `heap-value-join-*` and `heap-value-valif-*` are covered on both seeds and print the same.

## Legacy answers the IR calls (R8)

- The build row is `objLitLayoutRowOf`, `objLitStashRowOf`, `objLitDropStashRowAt` or
  `objLitOmitRow` (or their `…At(ix, at)` forms): the row `emitObj` builds at.
- `dst`'s heap is `recordHeapOfTy`, else `askRecordHeap` (`recHeapOf`).
- The kids' heaps come from `recHeapOf`, through `recHeapsNote`.

## Control

The head with the verifier line removed refuses `heap-value-ret-s.vl`'s `mk` with `fail rule 2 …
a retag is not …`. The head with the line verifies it.

## Position sweep (Q58), base 26a9bee97 → head, `VL_IR_SHADOW=2`, each side's `f` called

Calling both `f`s fills the result's holes, and then base already covers it. So each position is
two programs, `-r` and `-s`, under `tests/cases/closures/heap-value-*`.

| position | base | head |
|---|---|---|
| return (`ret`), through a second function (`nested`) | `return coercion` | covered, matched |
| beside a closure sibling (`bothclo`), if arm (`ifarm`), value if (`valif`), joined binding (`join`), `const` (`const`), argument (`arg`), closure result, annotated (`cloretann`) | covered | covered |
| one record deeper (`field`) | `return coercion` | `return coercion`: the inner literal's rep has no heap either, and only the outer temp is noted |

Every program prints the same on both seeds. A closure result with un-annotated functions is a loud
emit reject on both seeds (`cannot take the generic function … as a value`), so it is not a sweep case.

## Not closed here

The pin `mk2` (`hole-fn-param-into-returned-record.vl`) and `d15293_bound_returned` miss because the
result's kid has no heap (`rep16@h1{rep15@h-1}`, `list#6{rep7@h-1}`). That heap would come from the
result row's field: a per-position fact, so a separate pre-review.

## Readings

READINGS
