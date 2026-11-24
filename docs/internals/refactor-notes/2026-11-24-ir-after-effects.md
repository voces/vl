# IR: a `??` whose left is typed `null` runs its left where its value is read (2026-11-24, lane S1, D17421)

`x ?? d` with `x` typed `null` is the default alone, after `x` runs for its effect. Legacy writes the
whole `??` where its value is read: the left (`emitNulNoneForEffect`), then the default. The IR's
`coal` arm `nulnone` wrote the left as statement-level drop nodes (`nulNoneEffect`) where the `??`
was built.

## The defect

The two agree only when nothing is written between the build and the read. Two consumers write
something first: `print` of a nullable string opens its guard, and so does a nullable compare's
guard head. In those cases the IR's drops land before the guard and legacy's inside it. The
function is claimed with other bytes (`call at 0x02 vs 0x10`), and both print the same. A
constant default, and an argument, return, `let` or list-element consumer, matched.

## The mechanism

- `RAfterEffects { aeEff, aeV, aeAt }` is value `aeV` after operands `aeEff`. The lowering writes
  each effect and drops it, then the value, where the value is read.
- `nulNoneEffect` takes a sink (`Opnd[] | null`): one walk serves both forms. With a sink it
  pushes each operand instead of emitting a drop node. The `nulnone` coal arm passes a sink. The
  global initializer (`nulNonePayload`) passes `null` and keeps its drop nodes, so it stays
  byte-identical (named cell `global_initializer`).
- `ret` writes a returned call after effects as legacy does: the effects dropped, then
  `return_call` (`retAfterEffectsTail`).
- Verifier: each effect and the value are used, and the node is at the value's rep. Self-tests:
  `after-effects-at-value-rep` holds; `after-effects-off-value-rep` is refused.
- A field-read left (`u.tags ?? g()`) also needs D17420's `nuRead`, so the read's own drop
  moves with its null. On this tree's base, with #9920, every spelling matches.

## Measured

`matrix/null-typed-left-coalesce.matrix.vl`: runs 76 of 76 graded on both seeds. The cells
read the call trace for `n() ?? g()`, a compare's left, a call receiver, a tail return, a chain and
a global initializer. `u?.tags ?? g()` is a loud emit reject on master, filed as D17422 and out of
this change.
