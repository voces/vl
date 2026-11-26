# IR: a list literal built at a list union's ref-list arm (`armLit`) (2026-11-26)

Lane COV-IS, regen-10 class `box ladder` (the list-to-list-union literal family).

1. Shared plan: `holeBoxPlanOf` names `armLit` (`hbKind` the arm's tag, `hbSrc` its ref-list
   slot) for a list literal its own type is no arm of, which legacy's ladder builds at the arm its
   first element names (`emitUnionListLitViaRefArm`): legacy's writer is now that tag, the literal
   by `emitArrAt` at the slot's `LBK_UNION` build, and the box.
2. IR: `deliver` builds such a literal at the arm (`armLitAt`: `arrayLit` at the arm's list rep,
   `unionListArmTyOfSlot`), each element into the slot's union box by `irConvert` (its box case),
   then boxes it. The lowering widens a plan's `hbSrc` only for an `atom` plan, since `armLit`
   carries its slot there.

Graded by behaviour (coordinator ruling: since #10329 a ladder-to-plan switch needs behaviour
parity, not a byte compare):

- `ir-parity --behaviour-only --pop cases` over 8,340 programs: differs 0, build-fails(on) 0.
- `regress.vl` on the branch's seed: distilled, no runs lost.
- Against master `9fce35f4d`'s compiler, over `tests/cases` and the distilled `cells` and `named`
  sets, two programs change, both claimed whole and `VL_IR_STRICT=1` / `VL_IR_REQUIRE_CLAIM=1`
  clean: `generics/type-param-list-join-null-pin.vl` (`w3`) and
  `unions/list-union-for-through-hole.vl` (`@start`).
- Sweep `tests/cases/unions/list-literal-built-at-list-union-arm-positions.vl` (graded by `@log`):
  on master 2 functions and the start body miss with `box ladder`; here none, and its output is
  the same under strict IR and on master's seed.
