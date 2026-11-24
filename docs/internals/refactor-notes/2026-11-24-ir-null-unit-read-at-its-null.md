# IR: a null-unit place read runs where its null is read (2026-11-24, lane S1, D17420)

A field typed `null` holds only `null`. Legacy reads one (`emitNulNoneRead`) as a single
operand: the read for its effect, `drop`, then the destination's null. The IR built it as two
pieces (`nulUnitPlaceRead`): a statement-level drop node, written where the read was built, and an
`RNullOf` value temp, written where it was read.

## The defect

The two pieces agree with legacy only when the null is read right where it was built. The guarded
nullable compare (`RNulNicheEq`) reads its operands inside the guard (`nulNicheEqHead`), so:

| spelling | before |
| --- | --- |
| `u.tags == s`, `{ id: 2, tags: null } == t` | claimed with other bytes (`0x02` block where legacy has `0x20` local.get) |
| `s == u.tags`, `t == { id: 2, tags: null }` | `non-stack temp: out of order` (the right side is built twice, so two drops are pending) |

Every spelling printed the right answer. The record spellings arrive here because a record compared
with a literal of another shape compares field by field, and the literal's `tags` is its own
`null`-typed field.

## The mechanism

- `RNullOf` gains `nuRead: Opnd[]`: empty for every null that stands for no read, and the read for a
  null-unit place read.
- `nulUnitPlaceRead` builds no drop node. The lowering writes `nuRead`, `drop`, then the null, all
  where the value is read.
- The verifier holds `nuRead` to `nulUnitPlaceReadAt` (shared with legacy, noted as a fact). A read
  off such a node, or such a node without its read, fails rule 2. Self-tests: `null-of-plain`,
  `null-of-place-with-read` (both hold); `null-of-read-off-place`,
  `null-of-place-without-read` (both refused).

## Measured

- `matrix/null-unit-read-guarded-compare.matrix.vl`: 74 graded cells run on both seeds. Under
  `VL_IR_SHADOW=6`, all 72 cells that mismatched on master are clean. Two cells stay:
  `record_nullable_blocked` is blocked by `record compare place operand`, a class that was already
  open.
- Effectful receivers (`mk().tags` beside `g()`, as an argument, a list element, both orders of
  `==`, and `??`) print the same call trace on master, the candidate and the claimless build.
  `mk().tags == g()` goes from a byte mismatch to matched.
- Not fixed here:
  - `mk().tags ?? g()` is a byte mismatch on master and candidate alike. Its `??` builds the
    null-unit read through `nulNoneEffect`, a separate drop node.
  - `g() == mk().tags` stays `nullable eq right operand`.
