# IR coverage: value `if` joins (2026-11-25, lane COV-CLOS)

The if-join classes the coordinator moved to COV-CLOS on 2026-11-25. This PR takes `ref if arm rep`
and `expression if null join`.

## Mechanisms (one commit each)

| mechanism | what the IR did | now |
|---|---|---|
| null-typed arm at a nullable reference join | an arm reading a `null`-typed binding was built at the `null` unit and missed | the bottom ref, retagged at the join (`repNullRefFits`), as a delivery's and a global initializer's are (D1567) |
| record join at its destination's row | a value `if` of record literals at a record with a numeric-union field (D15020) was built at the arms' own record; legacy writes it at the destination's struct row (`ifTypedStructRow`) | the join takes its row's record, and a struct literal arm on that heap is built as it (`objLitTwinTyAtRow`) |
| `null` join | missed as `expression if null join` | `emitAllNullIf`'s shape: the `if` for effect (`ifForEffect`, `nulNoneEffect`), then the destination's null. Legacy writes it below a box tag opened before it, so the below-lead guard counts a void `if` and a `null`-typed call's box (`RNulNoneBox`) leads |

## Census (O1), master 33681f0b → head, every program, `census.sh`'s probe

tests/cases includes this PR's three sweeps on both sides.

| population | distinct claimed | `ref if arm rep` fn + start | `expression if null join` | `box of a valued if` |
|---|---:|---:|---:|---:|
| tests/cases | 44,461 → 44,527 / 45,546 | 62 + 6 → 3 + 5 | 19 + 1 → 0 + 0 | 15 + 7 → 16 + 7 |
| witnesses | 11,423 → 11,427 / 11,599 | 3 + 4 → 0 + 4 | 4 + 0 → 0 + 0 | 1 + 2 → 1 + 2 |
| probes | 644 → 644 / 650 | 0 → 0 | 0 → 0 | 0 → 0 |

No function lost its claim. The `box of a valued if` rise is the null-join sweep's `pNested`, now
refused below the box tag rather than built out of order.

## Left

- `ref if arm rep`: single programs. A map arm (`is-narrower-map-tests-values.vl`, D2701), a closure
  arm, a record arm into a box or a nullable join (D15720, D3389), and an arm that is itself a value
  `if` at a destination's row (the record sweep's `pIf`).
- `box of a valued if` (23 rows): legacy writes the valued `if` as its box's operand after the tag.
  The IR needs a lowering that places a single-use `if` there; until then it is refused.
- `declaration if per arm coercion` (16 rows, the four `pop-get-or-result-rep-*-hoisted.vl`): the
  arms deliver a narrowed scalar into the binding's nullable or box rep, a widening the checker does
  not record on the minted node. Passing the binding's type to `deliver` was tried and changed
  nothing.

## Q58 sweeps

`tests/cases/conditionals/null-binding-arm-ref-join-positions.vl`,
`record-join-at-destination-row-positions.vl`, `null-join-if-for-effect-positions.vl`. Each runs to its
`@log`, is claimless-identical and has no shadow mismatch. Uncovered positions: the record join
nested as another join's arm (`ref if arm rep`, above); the `null` join into a box (`box of a
null-typed value`, four) or under a box tag (`box of a valued if`, one).

## Legacy tails the IR calls

None new.
