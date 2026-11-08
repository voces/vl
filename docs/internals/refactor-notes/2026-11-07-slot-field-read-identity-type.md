# A returned record's function fields take their slot's identity type (2026-11-07)

Lane step 2, PR 2, of "a function-holding slot's rep comes from its identity set". It follows
[2026-11-07-slot-set-literal-join](2026-11-07-slot-set-literal-join.md) and reads the fact of
[2026-11-07-slot-identity-set-shadow](2026-11-07-slot-identity-set-shadow.md).

## What changed

`idSlotHeldTy(x, t, key)` (`elab_fn_id.vl`) walks closed type `t` beside value `x`. At each
function leaf it mints `elabFnSetTyMint(leaf, idSlotSetOf(key + steps))`. A field whose value reads
a `let` binding continues at that binding's key (`B<decl>`), so `{ m: hm }` reads `hm`'s map-value
slot. A leaf whose slot is open keeps its type.

`monoPinReturnedObj` records the returned record literal at
`idSlotHeldTy(lx, elabHeldValTy(lx, ctx), "L<lx>")` and not at the bare held type. The held type
said `(i32) => i32`, which reps as a closure. The build site had built `{f: dbl}` as an id of the
tagged set `{dbl}`. Now both sides read the same set, so the two reps agree.

**Guard (a) of #6711 is deleted.** It is the decline that left a record whose field reads a
function or an open binding at its open type (`monoObjLitFieldsTake(…, false)`). What remains of
that function is the walk for a record that has no held type at all, renamed `monoObjLitFieldsPin`.
It returns nothing and takes no flag.

## Acceptance set

With guard (a) dropped and the bare held type, master builds invalid wasm in `mk` for 8 programs.
Each of them runs on the candidate and prints its filed output:

| program | master, guard (a) off | candidate |
|---|---|---|
| D9181, D9302 | invalid module | `4` |
| `d15221_opt{,b}_dbl` | invalid module | `6` |
| `d15221_opt{,b}_half` | invalid module | `1.5` |
| `hole-fn-map-record-returned` | invalid module | `4 4` |
| `hole-fn-inline-list-record-stored` | invalid module | `4` ×8 |

## Measured

The base is master `d1a2c321` built to a fixpoint (6,490,499 bytes). The candidate is the final tree
before the master merge, also a fixpoint (6,492,173 bytes, +1,674, +0.026%).
`scripts/sweep.vl -- diff` reads 23,613 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`
and 0 new traps. The step does not change the output of any program. It removes the guard those
8 programs needed.

After merging master `0b44c48f`, the candidate is a fixpoint at 6,496,234 bytes, and
`scripts/gate.sh` passes 23 of 23 rows.

## Parked

- **Guard (b), its generic half.** In a generic instance, `monoRetFnListTy` leaves a list that holds
  literals to mono's own path. Taking the held type there, with or without the slot sets, makes
  D15296 and `d15293_called` invalid wasm (a clause 2 → clause 1 move). It does make
  `d15293_called_two` run. The record's `fs` field resolves to the outer list's row. Recording the
  element record per instance (`monoRecordInstOpen`) and walking its lists also loses
  `d15207_generic_ret`. Both failures come from the template's shared nodes, which is the
  recording-key question of class (c).
- **Guard (b), its identity-only test.** Dropping it is class (c)
  (`lambda-list-join-type-param-pin.vl` becomes invalid in `__lambda_3`). It stays.
- **#6716's no-token decline** (`frsColsOfTy`, "recorded result has no token"). The class (d)
  witnesses run on master and on the candidate. This step does not reach the decline, because the
  decline reads a function result type `(_) => _`, not a record field.
