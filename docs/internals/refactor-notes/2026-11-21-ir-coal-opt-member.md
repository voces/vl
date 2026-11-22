# IR coverage: `p?.f ?? d` over a nullable record's scalar field (2026-11-21, lane IR-N1)

`p?.x ?? d`, where `p` is a nullable record and `x` a scalar field, is legacy's
`emitCoalesceOptMember` → `emitCoalesceOptNulRecord`: the receiver, its null test, the default on
null, and the field read on the other arm. The IR left it `coalesce box next`.

## What landed

- **The optional member's arm.** `coalOptArmOf` states which of `emitCoalesceOptMember`'s arms
  fires (mapField, nulRecord, nulVariant, deep, badCall, listGet, next); legacy dispatches on it.
- **The leaf's plan.** `coalOptLeafPlanOf` states the scalar leaf's heap, field and kind;
  `emitCoalesceOptNulRecord` writes it through `coalOptLeafOpen` (the null test and the arm `if`)
  and `coalOptLeafRead` (the field read and `end`), and the IR builder, lowering and verifier ask
  the same plan. A staged receiver (`optRecvStagedAt`) stays a miss.
- **The rung past the boxed arms.** `coalNextArmOf` states the rung legacy's `next` dispatch and
  `emitCoalesceCallNiche` take (nulRefs, callBool, callStr, field, opt); the IR's field and
  optional routes ask it.
- `CoalOptArm`, `CoalNextArm` and `olLeaf` are registered in `lint.vl`.

## Coverage

Measured on fixpoint seeds of this branch and of master `8092d230`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,643 | 19,643 |
| corpus with no blocker (45,678) | 44,792 | 44,792 |
| `tests/cases` covered / matched (armed shadow) | 66,978 / 66,977 | 66,993 / 66,992 |

On `tests/cases` `coalesce box next` falls from 60 rows to 2; the functions it blocked that do not
yet build now name the arm they miss on (`coalesce optional next` 34, `optional record field` 10,
`optional place` 6, `expression optional member` 37 → 39). The armed shadow adds no fail, differ
or mismatch row (the one fail row, `generics/hole-map-tail-value.vl`, is on master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,602, differ 0, witnesses same 60;
  `--claimless` identical 14,017, fail under both 3,267, differ 0; `tests/cases` A/B same 8,716,
  differ 0.
- **Fuel:** L2 self-compile per PR +0.08% on master `8092d230`.
