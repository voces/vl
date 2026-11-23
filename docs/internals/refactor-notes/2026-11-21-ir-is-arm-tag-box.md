# IR coverage: an `is` arm tag test over a box value (2026-11-21, lane IR-N1)

`emitIsTestArmTag` tests a union box's tag against the pattern's arm. The IR built only its
`identBox` arm (a local's box slot read raw); every other receiver that is a box value, such as a
call result, an element or a parameter whose slot is not the box, is legacy's `box` arm and was the
miss `is arm tag box`.

## What landed

- **The `box` arm's tag.** Legacy writes the receiver's own value, then `boxTagIsTail` with the
  arm's tag. The IR's arm tag path already builds the receiver, holds its rep to a box (or a boxed
  nullable), and lowers `RTest` through the same tail; `boxTestTagOf` now answers the tag for `box`
  as it does for `identBox`, without the local slot.
- **`memStruct` stays a miss.** A record's box field (`memStruct`) is legacy's object read and a
  raw `struct.get` of the field, while the IR's field read lands at the field's narrowed rep: a
  trial claimed it and the verifier refused five functions (`a field's rep is not its
  destination's`). It is the coordinator's next class, built on the field's storage read.

## Coverage

Measured on fixpoint seeds of this branch and of #9418's head `7cd3422e`, each building this
branch's source.

| population | #9418 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,531 | 19,531 |
| self-compile claimed (mode 3) | 19,506 | 19,506 |
| corpus with no blocker (45,678) | 44,501 | 44,502 |
| `tests/cases` covered / matched (armed shadow) | 64,823 / 64,822 | 64,860 / 64,859 |

On `tests/cases` `is arm tag box` falls from 360 rows (204 at `@start`) to 12; the other functions
it uncovered reach a later blocker. The armed shadow adds no fail, differ or mismatch row.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,590, differ 0, witnesses same 60;
  `--claimless` identical 14,014, fail under both 3,267, differ 0; `tests/cases` A/B same 8,704,
  differ 0.
- **Fuel:** L2 self-compile per PR +0.02% on master `a9193b97`'s L2.
