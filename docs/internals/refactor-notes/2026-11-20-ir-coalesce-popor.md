# IR coverage step: the fused `pop ?? d`, 2026-11-20

Lane F2. A coverage step under `ir-design-2026-11.md` §10, on the `SCoalBox` node (#9217), to IR-REV's
design. Measured on fixpoint seeds of this branch and master `890abde55`.

## Why this class

`coalesce popOr` held 51 self-compile functions, 50 of them on their own. Legacy's `emitPopOr`
fuses `xs.pop() ?? d` over a scalar list:

1. It resolves the receiver: a held local, or a global or field staged.
2. It tests `len != 0` and opens an `if` at the element rep.
3. The present arm decrements `len` and reads the popped element.
4. The empty arm writes the default.

That is the shape `SCoalBox` already has: a legacy-written head, a lazy default and a valued out.
The IR's checked `popScalarTail` writes a different sequence, so it cannot stand in.

## What landed

- **Legacy split (byte-identical).** `emitPopOr` becomes:
  - `popOrPlanOf`, a `PopOrPlan` holding the element kind, wrapper, backing, scratch base and
    receiver;
  - `popOrOpen`, the length test, the `if`, the decrement and read, and the `else`;
  - the default, then `fbEnd`.

  Its refusals stay in `emitPopOr`.
- **The node's arm.** `SCoalBox.cbArm` is a `CoalValArm`. That set is `CoalBoxArm`'s nine
  members plus `popOr`, spelled out flat so `ladder-sets` can read it. The node's comment now
  states the general contract: a `??` whose head and present arm are legacy's shared tails, with a
  lazy default and a valued out.
  - `coalValBoxArm` maps a `CoalValArm` back to its `CoalBoxArm`, or null for the fused pop. It is
    the only crossing between the two sets, because VL does not narrow a literal union inside a
    match arm.
  - Every site that branches on the arm uses a `_`-less match: `irNodeFamily` (`popOr` is
    `list`), the lowering's dispatch and its binding re-read, and the verifier.
- **Builder.** `coalPopOr` requires:
  - the plan;
  - `endsInTemp` clear before the receiver;
  - an `RList` receiver whose element rep is the `??`'s rep;
  - a default already at that rep, or it misses `popOr default conversion`. Legacy's
    `emitScalarValue` conversions come in a follow-up.
- **Lowering.** A held receiver is `irLSkip`. A staged one is `irLOpnd` plus `stageListRecvTail` at
  `listOpStageBase(poBase, -1) + 3`, the slot legacy's `listOpRecvLocal` stages to. Then the shared
  open, the default into the slotless out, and the end.
- **Verifier.** A fused pop pops an `RList` of a scalar element (`i32`, `i64`, `f64`, `f32` or
  `bool`), and its out is at that element's rep. Its default must end by writing the out. Each rule
  has a hand-built negative case in `ir_selftest`:

  | case | breaks | rule it fails |
  | --- | --- | ---: |
  | 12 | pops an `i32`, not a list | 2 |
  | 13 | yields a `bool` from an `i32[]` | 2 |
  | 14 | its default leaves the out unwritten | 5 |

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered | 17,838 | 17,892 |
| corpus functions covered (45,678) | 39,941 | 39,949 |

- **Shadow mode 1:** everything covered is verified and matched. No `coalesce popOr` miss
  remains in the self-compile.
- **Mode-3 self-compile:** byte-identical.
- **Per-file `tests/cases` A/B,** master's seed against this branch's: same 7,231, fail under
  both 67, differ 0.
- **Witnesses** (`vl_ir_shadow_test`): every function is covered and matched.
  - The receivers: a held list, a staged global, and an `f64` list.
  - A variable default.
  - A default that reassigns the receiver, `xs.pop() ?? (xs = other).length`. It prints 33, as
    legacy does.
