# Step 2: the name ladder against the elaboration, and root arguments at the call key

Base: master `2b271d27` (with #6910), built to a fixpoint (6,571,466 bytes). Population: the 23,741
programs of `scripts/sweep.vl -- list`, each built once with `$VL_REP_SHADOW` by a scratch seed that
was never committed. Counts are answers at a site, not programs.

## Shadow 1: `monoArgPinName` and `monoArgTyName` against the elaboration's token

At each answer, the token is the pin of `elabNodeTyOrChecked(ix, fnIx)`, spelled by
`monoRecordRowPin` for a record and `monoPinOfClosedTy` otherwise.

| class | `monoArgPinName` | `monoArgTyName` |
|---|---|---|
| same token | 16,671 | 16,681 |
| differ | 180 | 223 |
| elaboration has none | 95 | 115 |
| elaboration open | 13 | 13 |

Both ladders already read the elaboration's type. `monoArgClosedPinTy` takes it from
`monoArgPinTyAt` (#6898). The `differ` rows are the same type spelled as another row. In most of
them a declared record is spelled by its fields (`Circle[] ~ {r:null}[]`, `J ~ Col`,
`{x:i32} ~ #anon0`). The rest are an alias spelled by its members (`i32|null ~ N|null`) or a
union's member order. Those spellings come from the row arms (`monoArgRowArmTy`, the record row a
literal is built at) and the declared-row and alias rungs. They decide reps, so they belong to
step 7. D6544's witness agrees at all 16 of its answers. The `1` in `a(2.5, 1)` keys `f64`, and
the row was already closed.

## The arm: an open root argument reads its parameter at the call-key instance

`elabNodeTyOrChecked` answered −1 for an argument outside every instance whose checked type is open:
a generic or hole function value handed on, or an empty or open list. The new last arm,
`elabRootArgParamTy`, finds the call through `cwIxUp`. It takes the call's instance from the root
(`elabCallInstFrom(call, -1)`) and answers that parameter's closed type there, but only where its
shape matches the argument's (function, list or map). It declines a record, because a record's
parameter may be wider than the record handed to it. A first candidate that accepted records keyed
`show(o: G)` at `G` for `{f: k, g: 7}` and minted a second `show` (2 bytes-only movers).

| no-answer (probe at `monoArgPinTyAt`, which the composite sites now share) | answers |
|---|---|
| root, closed by the new arm (`((T) => T)[] ~ ((i32) => i32)[]`, `T[] ~ i32[]`) | 434 |
| root, a record holding a generic function (`{f: (T) => T, g: i32}`) | 54 |
| root, a list of hole functions (`((_) => _)[]`, `{fs: ((_) => _)[]}[]`) | 27 |
| root, a function the key leaves open (`(U) => U`, `(_) => _`, `((T) => T)[]`) | 4 |
| inside an instance (15 minted nodes with no type, the rest keys −2/−3) | 49 |

What stands, and why:
- The records are open by design: their generic field is called at several types through the
  record, so no single instance types the record.
- The hole-function lists are closed by a later call through the place (`a2[0](3)`), not by the
  callee. Their answer is the place's delivery (`elabSlotDeliveries`), not the key's.
- The minted nodes are #6897's class (b).

## Switched and deleted

The three `monoPinTyParamComposite` sites read `monoArgPinTyAt` in place of `monoArgPinTyIx`, so
the old pin had no caller left and is deleted. The two pins differ only in order (the old one
banked a function value's own open type ahead of the row arms, and every site closes it through
`monoPinSubTyOf`), and the sweep moves no module.

## Graded

Sweep, base against candidate: 23,741 of 23,741 the same, 0 bytes-only movers, 0 output movers.
Fixpoint: a second refresh is byte-identical. Seed 6,571,466 → 6,571,811 bytes (+345; +2.7% of the
+3% bar). Pin-helper budget 920 → 919.
