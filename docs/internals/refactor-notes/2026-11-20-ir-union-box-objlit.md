# An object literal boxed into a union (2026-11-20)

After #9205 the shared box plan (`holeBoxPlanOf`) took a record value into a union box, but an
object literal with no variant of its own (`const n: Node = { numText: t, pos: p }`) still fell to
legacy's ladder (`box ladder: L5 struct`), the largest remaining box-ladder row.

## Shape
- **The `obj` arm.** `emitUnionCoerceRecord`'s literal rung builds the literal as the arm the
  union's context picks (`unionArmVariantForObj` → `emitUnionBoxAs`): the arm's tag, the literal
  built on that arm's variant struct, `struct.new $box`. The plan names it `obj` with the arm in
  `hbKind`; legacy writes it with `emitVariantStruct`, the IR from the record operand it built.
- It is a separate arm, not `rec` with a marker: `hbSrc` is the numeric widening source every
  writer of the plan reads, so a marker there widens the payload.
- The builder takes it only when the literal's own layout is that arm (`objLitVariantLayoutOf`);
  a literal built elsewhere misses as `box literal arm`.
- Legacy's `emitUnionBoxArg` reads the plan first, so its literal boxes move onto `emitHoleBox`;
  the corpus measures that path byte-identical.

## Measured
See the PR body.
