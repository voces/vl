# IR: closures over an environment, 2026-11-21

Lane IR-N6, step 2. This step is stacked on the lifted capture reads
(`2026-11-20-ir-capture-read.md`). A function value that captures missed at `closure env` in its
maker, and its body's capture reads missed at `capture env read`. The closure family was the
largest class in `tests/cases`: 884 functions there name `closure env`.

## The change

- **The environment build.** `RMakeClo`'s `mcEnv` is now filled (`cloEnvOf`), one operand per
  capture in `captureNamesOf` order, as `emitClosureEnvOf` reads them. Each operand is one of:
  - a parameter of this frame;
  - a binding of this frame (`liftCapDecl`, the step-2 lookup a lifted callee's captures use);
  - this frame's own capture, env to env: its lifted parameter, or its own environment field.

  `makeClo` lowers the operands, then `struct.new` of the closure's environment, then legacy's
  `emitClosureIds`. Misses: an environment cached per activation (`irEnvCached`) or kept in a
  shared cell (`cloCellReaches`), both `closure env cache`; a cell or global capture, or one at
  another rep, `closure env capture`.
- **The environment read.** A new right-hand side, `REnvGet { evSlot, evAt }`, holds capture slot
  `evSlot` of the function's environment. `evAt` is the read it recovers at, or -1 for an env-to-env
  copy, which recovers nothing. Its lowering is legacy's writer, `emitCapturedRead`, now exported;
  the IR writes no byte of its own for it. It joins the claimed `closure` family. A capture's rep
  is `capRepOf`: the binding's type in its owning frame, an instance's own, held to the valtype
  `captureValKind` gives the env field. A read at another rep is a miss (`capture binding`), as
  is an `is K[]`-tested capture, which legacy may stand in with an empty list (D4935,
  `capture list test`).
- **Found while proving.** In two corpus cells, `d15199_run_function_field` and
  `d15199_run_no_write`, the IR now reached a pre-path tag dispatch delivered into a box whose
  tag leads. They are a `fvaAdapt` lambda returning `i32 | f64`. The IR wrote the dispatch's id
  stash before the box's tag immediate; legacy writes it after. The armed shadow read
  `mismatch bytes: call at 0x41 vs 0x20`, and identity `--names` showed differ 2. `boxTempAt` now
  refuses that shape (`boxed tag dispatch`); the stash placement is the box ladder's to fix.

Compiler lines +147 / −33 over step 1 (`ir_build.vl` +105 −23, `ir_lower.vl` +29 −3, `ir.vl` +6
−2). The shadow row `ENV_CAPTURE` builds a closure environment, its field reads and an env-to-env
copy; all five functions are covered and matched.

## Readings (base master `6851d881`, fixpoint seeds on both sides)

| reading | master | step 1 | this step |
| --- | ---: | ---: | ---: |
| corpus functions with no blocker (census) | 41,780 | 42,033 | 42,116 |
| `tests/cases` functions with no blocker | 54,061 | 54,396 | 56,483 |
| self-compile functions with no blocker | 19,056 | 19,056 | 19,061 |
| `tests/cases` `closure env` (any) | 884 | 884 | 184 |
| corpus `closure env` (any) | 52 | 52 | 11 |

## What is left in the family (`tests/cases`, any)

`nested function env cache` 223 and `closure env cache` 90: an environment kept in a frame slot
per activation (D7480), which needs a cache slot in the IR. `capture binding` 209: mostly a
narrowed read of a nullable capture, which owes the read's recovery. `callee environment` 172,
`callee captures` 150, `closure env capture` 96, `indirect call` 659 and `call of a
non-declaration` 1,094.
