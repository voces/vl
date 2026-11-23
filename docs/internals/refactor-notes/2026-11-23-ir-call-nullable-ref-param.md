# IR: a function-value call at a nullable reference parameter, 2026-11-23

Lane IR-N4. Base: master 1b69a6af1. Batch 1 of `call of a non-declaration`: on master a79dae1d9's
fixpoint the class is 33 tests/cases rows (19 functions, 14 starts), all at `closureCallRhs` where
`callRefPlainKey` is empty. The nullable reference parameter is 9 of them.

## Change

`emitCallRefArg` writes an argument at a `nulmap`, `nulclosure` or `nulstr` parameter on its
`general` arm: `emitExpr` of the argument, then `emitNonNullParamRecover`, which writes nothing for a
nullable kind ("a nullable slot takes the value as it is"). Legacy's disassembly agrees. In the row's
`viaMapN`, the `(ref null $6)` map parameter is passed as `(local.get $1)` straight into the
functype's `(ref null $6)`, with no `ref.as_non_null`.

- `callRefArgPlain` (`wasmEmit.vl`), general arm: `nulstr` and `nulclosure` are plain, and `nulmap`
  is plain unless a narrowed arm needs unboxing. `plainListArg`'s refusals of a nullable argument
  exist for the non-null kinds' recover, so they do not apply here.
- `closureArgRepIs` (`ir_build.vl`): each of the three kinds takes the reference or its nullable.

**Why `callRefArgPlain` itself, and why no legacy byte moves.** Armed, `closureCallRhs` asks
`legacyPlainAgrees`. Legacy records `callRefLegacyPlain[callIx] = ckey` only when every argument's
`emitCallRefArg` returned 1, and that 1 is `callRefArgPlain`. An IR-only admission would make the
check fail. `callRefArgPlain` has two callers:
- `emitCallRefArg`, where it feeds only the 1/0 return; the arm and its bytes come from
  `callRefArgArmOf`;
- `callRefPlainKey`, which only `ir_build.vl` reads.

The flag reaches `argsPlain`, then `callRefLastPlain`, which is read only under `irShadowOn`.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `callRefArgPlain` (widened) | `emitCallRefArg`'s plain-call record (shadow only); `callRefPlainKey` (IR only) |
| `closureArgRepIs` | the IR's `closureCallAt`; it states `emitCallRefArg`'s general-arm valtype |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

`tests/ir-shadow-rows/closure-call-nullable-ref-param.vl` passes a map, a closure and a string, each
non-null and nullable, at a nullable parameter. Master leaves seven functions on
`call of a non-declaration`; this branch matches all eleven and the start, with the same output and
bytes. The class's own programs in this family move on to `expression null` (a literal `null`
argument, N5's class), or match.

Fixpoint seeds on both sides, master 1b69a6af1 against this branch, `VL_STD` the tree's:

| class (tests/cases census) | master | branch |
| --- | ---: | ---: |
| call of a non-declaration, functions | 31 | 27 |
| start: call of a non-declaration | 14 | 9 |
| expression null, functions (moved on) | 18 | 21 |
| start: expression null (moved on) | 3 | 8 |
| tests/cases functions matched | 79309 | 79315 |

- No program's covered count fell (per-program `blockers none`, master against branch: 0).
- Self-compile: 20419 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes,
  the same as master's.
- `ir-identity --names`: identical 9037, fail under both 3267, differ 0; self-compile identical.
  `--claimless`: identical 14054, differ 0. `--cases`: identical 7747, fail under both 68, differ 0;
  witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7460, fail under both 67, differ 0. That is the proof that
  widening `callRefArgPlain` moved no legacy byte.
- Armed shadow: 0 fail or mismatch rows on both. `--claims`: `ir-shadow: ok`.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB and
  fails at 900, as master's seed does.
- Fuel: L2 122267838057 against master's 122267838291.
