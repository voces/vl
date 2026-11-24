# IR: a `null`-typed module global's initializer, 2026-11-24

Lane IR-N4. Base: master 67327cc9. Class `start: global initializer nulnone`.

## Change

- Legacy's `emitStartGlobalInitValue` writes the `"nulnone"` arm of `startInitArmOf` as
  `emitNulNoneBoxPayload(init)`, then `emitUserGlobalSet`. That writes:
  - a value `if` for effect, then `ref.null none`;
  - otherwise `emitNulNoneLeafPayload`: a call's own value; `a ?? b` as `a` for effect, then
    `b`'s payload; an assignment yielding a `null` literal (`asgYieldsNullLit`), then
    `ref.null none`; anything else for effect (`emitNulNoneLeafForEffect`), then `ref.null none`.
- `globalInit`'s `nulnone` arm builds the same ladder (`nulNonePayload`), then the store
  (`gsSym`/`gsSrc`, with `irGlobalWriteMiss`):
  - a call: `irBExpr`, at the cell's rep or a named miss (`global initializer nulnone call rep`);
  - `a ?? b`: the existing `nulNoneEffect(a)`, then `b`'s payload;
  - an assignment: the IR's own `assign`, then the `NULL_OWN_NONE` operand;
  - anything else: `nulNoneEffect`, the twin of `emitNulNoneLeafForEffect` for a non-`if` node,
    then the `NULL_OWN_NONE` operand (`ref.null none`, `emitNullOwn`).
- A value `if` keeps a named miss, `global initializer nulnone if`. The IR has no twin of
  `emitIfForEffect`, so the 2 such starts are a follow-up.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `startInitArmOf` `"nulnone"` (existing) | `emitStartGlobalInitValue` |
| `plainCoalesceAt` (existing, new use) | `emitNulNoneLeafPayload`'s `??` arm |
| `asgYieldsNullLit` (existing, new use) | `emitNulNoneLeafPayload`'s assignment arm |
| `nulNoneWritesNothing` (existing, via `nulNoneEffect`) | `emitNulNoneLeafForEffect` |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

READINGS
