# IR: a lifted function's capture reads, 2026-11-20

Lane IR-N6 (closures, captures and indirect calls). The largest blocker class in the distilled
corpus was `read of <name>`: a nested function reading a binding captured from its encloser. The
builder resolved an identifier only to a local, a parameter, a global or a function, so a capture
fell through to the last miss.

## Sizing (census at master `6851d881`)

`read of <name>` stood in 575 corpus functions (any), 219 of them alone with `read of c`. Each
read the census names sits in a lambda-lifted function or in a closure body. A lifted function
(SP-037, `emit_lift.vl`) is a nested function whose every use is a direct call; it takes its
captures as parameters after the environment. A closure body reads them from its environment's
fields; this change leaves that spelling a named miss, the next step with `closure env`.

## The change

- `identRead` asks `captureSlotOf` first, as `emitIdentNode` meets the `capture` arm after the
  arms that precede it, and `captureRead` takes the read only where `identReadArmOf` names that
  arm.
- In a lifted function the capture is a parameter variable at slot `1 + fi`
  (`emitCaptureSlotRead`), made at its first read (`liftCapVar`). Its type is the binding's in
  the frame that owns it (`parentBindingOf`); the read must be at that rep.
- An agreement check, not a mirror: the variable's rep must have the valtype legacy's function
  type writes for the capture (`fbValtype` of `captureValKind`), else the read misses.
- Misses, named: an environment field read (`capture env read`), a lifted function that hands a
  capture back (`capture written back`), a `string | null` capture that recovers at the read
  (`capture recover`), and a binding the owning frame does not resolve (`capture binding`).

Compiler lines +55 / −1 (`ir_build.vl`). The shadow row `LIFTED_CAPTURE_READ` reads a parameter,
a string and a record capture; it is `read of s` on the base seed and covered and matched on the
candidate.

## Readings (base master `6851d881`, fixpoint seeds on both sides)

| reading | master | this change |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 41,780 | 42,033 (+253) |
| corpus `read of <name>` (any) | 575 | 0 |
| self-compile functions with no blocker | 19,056 | 19,056 |
| `tests/cases` functions with no blocker (census) | 54,061 | 54,396 (+335) |
| `tests/cases` `read of <name>` (any) | 2,253 | 38 |
| L2 self-compile fuel | 104,683,723,346 | 104,701,125,652 (+0.017%) |

The 575 split: 253 build, and the rest now stop at the class behind the read (`null test boxTag`,
`object field explicitNull`, `object variant field`, …). What remains in the capture family: 66
`capture env read` (the environment spelling, behind `closure env`), 15 `capture binding`, 4
`capture recover`.

In `tests/cases` the 38 `read of` rows left name no capture slot: a generic function's name read
as a value (`read of id`), and module-scope bindings a closure reads (`read of s`). 1,852 rows now
name a `capture` class, nearly all `capture env read`.
