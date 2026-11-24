# IR: nullable record equality (2026-11-24, lane IR-D1)

The probes batch's mechanism B. Every `S | null == S | null` missed as `nullable record eq`
(`nulNicheEqWhy`'s `nulstruct` arm), not only the probe's `o?.f == q`.

## Mechanism

Legacy's `emitNulStructEq` picks the eq row by three rungs, stages both roots as the plain
compare does (`structEqStage`), then in one `block i32` answers `0` where the roots disagree on
nullness, `1` where the left is null, and otherwise compares the fields (`emitStructEqRec`);
`!=`'s `i32.eqz` follows the block (`emitNulNicheEqBin`). The row (`nulStructEqRowOf`) and the
block (`nulStructEqGuardTail`) are moved out unchanged and shared; `structEqLeave` restores the
stash slots as `emitNulStructEq` did. `RStructEq` carries `seNul`: the builder routes the
`nulstruct` arm to the plain compare's builder with the row, and the lowering stages as before,
then writes the guard tail and the `i32.eqz`.

Named misses, all FREE:
- `nullable record eq bare side`: a bare record beside a nullable one, whose legacy function
  declares locals the IR does not (a byte mismatch before the narrowing);
- `nullable record eq element place`: a `(S | null)[]` element, which legacy re-reads in place;
- `nullable record eq row`: no rung names a row, where legacy refuses too;
- the probe's `o?.f` operand stays `record compare place operand`, the place re-read the plain
  compare refuses as well.

## Verifier

`RStructEq`'s `seNul` needs one nullable operand. Keyed self-tests:
- `nullable-records-compared-nullable`: holds, 0;
- `plain-records-compared-nullable`: refused, 2.

## Readings

Each census arm ran in a tree at its own commit: the base in a tree at `1a86056e`, the head in
this branch's tree (`bb53e789`), both on fixpoint seeds.

| Population | Base `nullable record eq` | Head: claimed | Head: still missed |
|---|---|---|---|
| cases | 17 | 9 | 8: 5 bare side, 1 element place, 2 record compare place operand |
| distilled | 3 | 3 | 0 |
| probes | 1 | 0 | 1: record compare place operand |
| witnesses | 4 | 1 | 3: 1 bare side, 1 element place, 1 record compare place operand |

Of the 25 base misses, 13 are claimed; the 12 left carry the three named misses. The new cases add
11 `element place` rows (10 sweep functions and the `nulrec-eq-elem.vl` pin), 10 `record compare
place operand` rows (the optional-chain sweep functions) and 1 `bare side` row (the
`nulrec-eq-bare3.vl` pin). 0 claimed functions are
lost in any population.

The `nullable record eq row` rung (`-1`) has no reaching program. Candidates tried (map get,
pop, optional pair, if-expression, closure call) all check and run `true` under legacy, and an
`as S` over `S | i32 | null` is refused at check. So check accepts no program here that emit
refuses, and there is no clause-2 gap.

- Identity: names `identical 9433, differ 0`, self-compile identical; cases `identical 7848,
  differ 0`; claimless `identical 14462, differ 0`; legacy A/B `7912 same`, empty.
- The Q58 sweep (`tests/cases/operators/nulrec-eq-*.vl`, 43 files) is claimless-identical:
  `identical 43, differ 0`. On `nulrec-eq-sweep-return-local.vl`, claimed and legacy bytes are
  `cmp`-identical and `wasm-dis` identical.
- The effect counter (`nulrec-eq-eff.vl`) prints `12 1211 121134 12113431` on the base seed,
  the head seed and the claimless compiler.
- Fuel: per PR +0.04%; the pair (head seed building the base tree) is L2 125976939845 against
  base 125976938975.

## Legacy tails the IR calls

`nulStructEqRowOf`, `nulStructEqGuardTail`, `structEqLeave` (wasmEmit.vl), new and moved.
