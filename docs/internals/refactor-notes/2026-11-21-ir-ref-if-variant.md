# IR: a reference join at a variant row, and its bare `null` arm (2026-11-21, lane IR-D1)

Coordinator assignment, 2026-11-21: the self-compile classes `expression if ref variant` (4
functions, plus 1 sharing `ref if arm null`), `ref if arm null` (3) and `ref if chain join` (3), at
master 94356c86.

## The witnesses

A debug build named the function behind each row at master 41144724:
- `expression if ref variant`: `irStrHashFnCode`, `irMapProbeFnCode`, `irMapProbeI32FnCode`,
  `irMapCompactFnCode` (`test(op, a, if w == 4 { lim } else { n })`, an `OVar` join), and
  `bodyRule`.
- `ref if arm null`: `recBuildOwnEdges`, `emitMapUnionForArm`
  (`forInPairBox = if boxV { row } else { null }`), `stmtNode`, and `bodyRule`.
- `ref if chain join`: `canonFnTags`, `ifExprPlainWhy`, `stmt`. An inner link's own
  `ifRefJoinOf` names no kind while the head's is `str`, and legacy writes every link at the head's.

## The change

- `ifRefExpr` takes the `variant` kind. The lowering's `fbRefIfOpenType` already writes it, and
  `refIfArmOf` gives its arms `plain`.
- A bare `null` arm is `RJoinNull { jnKind, jnSlot }`, the `ref.null` of the join's heap
  (`fbRefNullOfKind`, as `emitRefIfArm` writes it). The builder takes the kind and slot from
  `ifRefJoinOf` once, and the lowering asks nothing (coordinator ruling, like IR-N4's `ggAt`).
  The verifier delivers it only into a nullable reference (rule 2).
- A string `??` whose operand built a valued `if` is the named miss `coalesce of a valued if`.
  Legacy writes the operand inside the coalesce's block, which the IR's stacked `if` value
  cannot sit under. Master already mismatched there
  (`(if c { a.get("a") } else { b.get("b") }) ?? "none"`), and the null arm reached 7 more
  tests/cases functions of that shape (`?.` under `??`).

## Measured vs master 41144724 (fixpoint seeds on both sides)

Self-compile blocker census:
- `blockers none`: 19,511 → 19,516.
- `ref if arm null`: 3 → 0.
- `expression if ref variant`: 4 → 0, and `expression if ref variant + ref if arm null`: 1 → 0.
- `box ladder`: 0 → 3. These are the three `test(...)` helpers, an `OVar` join delivered into an
  `Opnd` parameter through the hole box's `ladder` arm. They are IR-N2's.
- `ref if chain join`: 3 → 3, still open.
</content>
</invoke>
