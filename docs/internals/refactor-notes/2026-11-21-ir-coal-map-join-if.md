# IR coverage: a union-valued map's read, and a `??` over one (2026-11-21, lane IR-N1)

A bare `m[k]` over a map whose value is a union reads its value through the null-tagged box
(`mapGetArmOf`'s `unionBox`: the stored box on a hit, a box tagged `null` on a miss), and
`m[k] ?? d` joining a union is legacy's synthesized `if m[k] != null { m[k] } else { d }`
(`coalNullTestIf`, the `mapJoinIf` arm). The IR left them `map get union box`, `map get rep` and
`coalesce mapJoinIf`. The coordinator ruled the two one PR, so it pays on its own.

## What landed

- **The read's tail.** `emitMapGetUnionBox` is the probe and `mapGetUnionBoxTail`, which the
  `RMapGet` lowering's `unionBox` arm writes after its probe head. A plain read is the value's box
  (`repBoxCore` strips the boxed nullables whose `null` is one more tag of the same box).
- **The narrowed read's tail.** `narrowedMapReadOf` states what `emitNarrowedMapReadTail` owes
  after a read (nothing, a union value's unbox to an atom kind, its container narrowing, or a ref
  value's non-null recovery); the tail writes from it, and the builder and the verifier ask it, so
  a narrowed read is built at its member's scalar. A container narrowing stays a miss.
- **The binding.** `const v = m[k]` over a union-valued map is legacy's own binding arm, which reads
  past `emitExpr` and banks no element-read row (`letNulMapReadUnionBox`); its `RMapGet` carries
  `mtRow` false.
- **`mapJoinIf`.** The builder builds legacy's synthesized null-test `if` as the valued `if` it is.

## Coverage

MEASURED
