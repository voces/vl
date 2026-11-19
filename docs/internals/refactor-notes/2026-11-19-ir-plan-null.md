# IR decision modules 2: the coercion and null plans (2026-11-19, lane IR6)

§10.1(a) stage 3, step 2. The inventory is in `2026-11-19-ir-plan-list.md`. This step moves the
coercion and null families out of `wasmEmit.vl`. It converts one mirror, splits two legacy
writers called whole, and covers the `null test dead` blocker.

## Moved

- **`compiler/emit_plan_coerce.vl`** (22 declarations): `coerceKindAt` and the box-record
  decisions it reads (`boxOwedAt`, `boxOwedAtRecord`, `boxDstTyOf`, `recCopyRowAt`,
  `copyArmRowOf` and kin).
  - The three coercion seats (`boxSeat`, `armSeat`, `atomSeat`) move with their one reader.
  - Legacy writes them as imported lets.
  - They are -1 wherever the IR asks (the C2i audit), and they still delete at I8.
- **`compiler/emit_plan_null.vl`** (48 declarations): `nullOwnAt`, `coalArmOf`, `coalNicheArmOf`,
  `nulTestArmOf`, `binNulTestOf`, `deadNullTestOperand`, `nulNoneEqSides` and the coalesce kinds.

## Deleted or shared

| item | before | after |
|---|---|---|
| `nullOwnIsAtom`, `nullOwnIsStr` | IR-only wrappers over `nullOwnAt` | deleted; the IR reads `nullOwnAt` |
| `RNullOf` lowering | `emitNullAt` re-derived the null inside the writer | the node carries the null the builder decided (`nuOwn`); the lowering writes `emitNullOwn` |
| `emitNullForRet` (111 lines) | decision and bytes in one writer | `nullRetPlanOf` (byte-free, in `emit_plan_null.vl`) and `emitNullRetTail`; the boolean, atom and string arms reuse `emitNullOwn`; the IR calls both, and legacy's entry keeps its name |
| `coalNulStrBlockPlain` | an IR mirror of `emitCoalesceNulRefCtx`'s first three tests | deleted; both read `coalNulRefArmOf`, whose `litAtom` arm is heap-independent, so legacy keeps its own `isSTy` test and no type is minted earlier |

## Coverage: `null test dead`

- **Before:** a null test the checker proved dead (`deadNullTestOperand`) missed in the builder.
- **Now:** it builds as legacy's `emitDeadNullTest` writes it. The operand is written for its
  effects and dropped (`SDrop`), unless it is a bare name, and the result is the constant.
- **Exclusion:** a numeric union's per-member compare (`njDispatches`) takes the node first in
  legacy, so that case stays a named miss.

The armed shadow found one divergence, and it is fixed:
- An always-true dead test as an else-less `if`'s condition gave the IR an immediate `true`.
- The lowering inlined the arm, while legacy writes `i32.const 1; if`. Legacy inlines only a
  literal `true` (`condLitTrue`).
- The lowering now reads the source condition with `condLitTrue` before inlining.

## Lines

Code lines (comments and import lists excluded), from a multiset diff against master:

| | lines |
|---|---|
| moved | 692 |
| deleted | 80 |
| new | 69 |

The compiler total rises because the two modules' import blocks are new.

## Bars

On fixpoint seeds: master 5c0fd9a6 (6,797,398 bytes) against this branch merged with it (6,798,005).

| bar | reading |
|---|---|
| corpus identity | 9,034 identical, 3,267 fail under both, 0 differ, 0 one-only; self-compile identical |
| `--names` identity | the same, self-compile identical |
| `ir-identity.sh --cases` | 7,512 identical, 68 fail under both, 0 differ |
| mode 3 | 9,034 same, 0 differ; self-compile identical |
| shadow | 31,361 covered, verified and matched; `ir-shadow: ok` |
| `--claims` | 31,361 functions emitted by the IR |
| blocker census | functions with no blocker 31,176 to 31,361 (+185); `null test dead` (189 alone) gone |
| self-compile coverage | unchanged |
| L2 self-compile fuel | 99,570,469,641 (master) to 99,601,689,229 (+0.031%) |
| seed size | 6,798,005 bytes (+607 on master) |
| late demands | 9, baseline 9; late tag rows 307 |
| phase state | distinct checker symbols 1,185 on both; imports 2,762 to 2,797 (`emit_plan_null.vl` 25, `emit_plan_coerce.vl` 13, `ir_build.vl` +1, `wasmEmit.vl` −4); the 3 hidden seats moved from `wasmEmit.vl` to `emit_plan_coerce.vl` |
| lint-self, ladder sets | clean; 59 closed sets match (`CoalNulRefArm` registered) |
