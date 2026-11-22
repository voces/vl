# IR: a union map read legacy's box ladder writes itself banks no element-read row (2026-11-22, lane IR-N1)

`show(m["k"])`, a union-valued map's read delivered into a union box, is written by legacy's
`emitUnionBoxArg` (through `emitCoerced` where the checker records the box, `emitUnionBoxOwed`
where it does not). Its ladder's union-valued map rung (`emitUnionBoxArgGo`) writes the read by
`emitMapGetUnionBox` itself, past `emitExpr`, so legacy banks no element-read span row for it. The
IR banked one (`mtRow` true), and every such function IR-N3's union store made claimable failed on
`spans: count`. IR-N3 shipped the store (#9473) behind a temporary miss, `map read row after a
union store`; this deletes it.

## What landed

- **Legacy's answer, split out.** `unionBoxArgLadders` (the hole box plan reaches the ladder) and
  `unionBoxArgGoMapRead` (the ladder's map rung fires) are now what `emitUnionBoxArg` and
  `emitUnionBoxArgGo` ask; `unionBoxArgReadsMapBox` composes them with `mapTwinUnionMember`.
  `emitCoerced` boxes at `holeBoxTyAt`, the record's union the IR already asks.
- **The IR asks it.** `deliver` at a box destination marks the read (`irUnbankedRead` on the
  function being built) where `unionBoxArgReadsMapBox` holds at the record's union, or at the
  destination's where no box is owed; `mapGetBare` builds that read with `mtRow` false.
- IR-N3's temporary miss and its `irUnionStored` field are gone.

## Coverage

Measured on fixpoint seeds of this branch and of #9473's head `81ce066d`, each building this
branch's source.

| population | #9473 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,665 | 19,665 |
| corpus with no blocker (45,678) | 44,865 | 44,865 |
| `tests/cases` covered / matched (armed shadow) | 67,316 / 67,315 | 67,328 / 67,327 |
| `tests/cases` start bodies covered / matched | 5,496 / 5,495 | 5,501 / 5,500 |

`map read row after a union store` (23 rows, 12 start) is gone; the functions that do not yet
build reach the next blocker (`is arm tag box`, `map read mv`, `method delete`, `box ladder`). The
armed shadow adds no fail, differ or mismatch row (the one fail row,
`generics/hole-map-tail-value.vl`, is on master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,604, differ 0, witnesses same 60;
  `--claimless` identical 14,017, fail under both 3,267, differ 0; `tests/cases` A/B same 8,718,
  differ 0.
- **Fuel:** L2 self-compile 109,069,649,530 against #9473's 108,996,473,743 (+0.07%); per PR
  +0.08% on master `dfc71b02`.
