# IR coverage: a nullable reference's `??` builds a temp operand inside its block (2026-11-22, lane IR-N1)

`(o[i] ?? { x: 9 }).x` over a `(R | null)[]`, and `(mk(b) ?? r).x` over a call, are legacy's
`emitCoalesceNulRef` plain arm: it opens a `block`, then writes the operand, then `br_on_non_null`.
The IR built the operand into the enclosing block, so a temp operand sat below the block and was
refused (`coalesce nulRef operand temp`); and a `??` whose ladder reaches those rungs past the
optional chains (`emitCoalesceOptMember` passing on) was left `coalesce optional next`. Stacked on
#9499.

## What landed

- **`SCoalBox.cbLB`**, the operand's block (a node field, not a kind): the plain nulRef builder
  builds the operand into it, and the lowering writes it inside the opened block
  (`body(cbLB, keepTop)`, then the operand). The verifier allows it only on the nulRef arm, its
  definitions seen by the operand and dropped with the node; the IR text, the `bodies` list and
  `bodyAssigns` visit it. An outer temp pending at the plain arm is a loud lowering miss (`coalesce
  nulRef below a temp`), which no corpus or `tests/cases` program reaches.
- **`coalOptPassesToNulRefs`** (`coalOptArmOf` is `next`), split out of `emitCoalesceOptMember`,
  which dispatches on it; the IR's `coalBox` routes there to `coalNulRef` (legacy's
  `coalNulRefPlanOf`). A join reached that way declares its operand's stash slot (`optRecvSlot`)
  where legacy's does not (`d15241_param_J.vl`), so it stays a named miss, `coalesce nulRef join
  past the optional chains`.

## Coverage

Measured on fixpoint seeds of this branch and of #9499's head `9e8b83a1`, each building this
branch's source.

| population | #9499 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,761 | 19,763 |
| corpus with no blocker (45,678) | 45,029 | 45,042 |
| `tests/cases` covered / matched (armed shadow) | 68,224 / 68,223 | 68,238 / 68,237 |
| `tests/cases` start bodies covered / matched | 5,687 / 5,686 | 5,701 / 5,700 |

`coalesce optional next` (34 rows, 13 start) and `coalesce nulRef operand temp` (18, 13) are gone;
the functions that do not yet build reach `coalesce nulRef heap` (22 → 42, start 11 → 16) or the
named join (5, start 2). The armed shadow adds no fail, differ or mismatch row (the one fail row,
`generics/hole-map-tail-value.vl`, is on master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,612, differ 0, witnesses same 60;
  `--claimless` identical 14,018, fail under both 3,267, differ 0; `tests/cases` A/B same 8,726,
  differ 0.
- **Fuel:** L2 self-compile per PR +0.13% on master `898b840d`.
