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

Measured on fixpoint seeds of this branch and of master `ef8c507d`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,607 | 19,607 |
| corpus with no blocker (45,678) | 44,724 | 44,724 |
| `tests/cases` covered / matched (armed shadow) | 66,679 / 66,678 | 66,708 / 66,707 |

On `tests/cases` `map get union box` (67 rows) and `coalesce mapJoinIf` (18) are gone; the
functions they blocked that do not yet build reach `map store value union` or `map read mv`. The
corpus's `mapJoinIf` functions each have another blocker, so its count does not move. The armed
shadow adds no fail, differ or mismatch row.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,598, differ 0, witnesses same 60;
  `--claimless` identical 14,017, fail under both 3,267, differ 0; `tests/cases` A/B same 8,712,
  differ 0.
- **Fuel:** L2 self-compile per PR +0.04% on master `ef8c507d`'s L2.
