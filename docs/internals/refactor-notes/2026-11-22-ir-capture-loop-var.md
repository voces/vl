# IR: a closure capturing a loop variable takes the variable its frame's loop made, 2026-11-22

Lane IR-N6. This is the third family from the capture-class ablation
(`2026-11-22-ir-capture-instance-decl.md`). A closure captures a `for-in` element or key, or a
range counter. A loop variable has no `let`. So `liftCapDecl` found no binding, and `callee
captures` missed. `parentBindingOf` has nothing for it either, so `capRepOf` had no rep and
`closure env capture` missed. On the instrumented scratch seed the family was 31 functions:
20 `callee captures` and 11 `closure env capture`.

## The change

Legacy reads the capture as `emitCaptureRead` → `captureHomeOf` → `declaredIndexAt(fnIx,
scopeSlotOf(name))`, the frame's loop-variable local, typed by `captureValKind` off
`forInElemKind`.

The new builder query `loopCapVar(fe, name)` asks legacy which loop binds the name,
`captureLoopNodeOf`. It takes that loop's declaration: `captureLoopVarDeclOf` for a `for-in`,
the `ForRange` node for a range. It returns the variable this frame's loop made for it,
`ibDeclVar`, which is set only where this frame's builder built the loop. `cloEnvOf` and
`liftCaps` take that variable at `capRepFor(fe, name, its rep)`. That rep stands only where
legacy's capture valtype agrees, and `liftCaps` also requires the callee's to agree.
`capRepFor`'s loop clause now asks `captureLoopNodeOf`, so a range counter qualifies as a
`for-in` variable does.

The semantics are proved by running, not only by bytes.
`tests/cases/closures/capture-loop-variable-called-during-and-after.vl` creates closures over a
`for-in` element, a range counter and a map's key and value inside each loop. It calls them
during the loop and again after it, and each sees its own iteration's value under both seeds.

## Readings (base master 454e5ab9b, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases functions with no blocker | 69,221 | 69,259 |
| tests/cases `callee captures` (any / alone) | 40 / 29 | 17 / 7 |
| tests/cases `closure env capture` (any / alone) | 48 / 40 | 40 / 34 |
| tests/cases `capture binding` (any) | 114 | 104 |
| corpus functions with no blocker | 45,225 | 45,225 |
| self-compile functions with no blocker | 19,898 | 19,898 |
| `capture instance twin ambiguous`, all three populations | 0 | 0 |
| `ir-only-census`: tests/cases programs fully IR-only | 4,353 of 7,056 | 4,363 of 7,056 |

The `capture binding` fall comes from the captured read side. `capRepFor`'s widened loop
clause admits a range counter read in its closure.

Legacy lines deleted: 0. Moved to `@ir`: 0.
