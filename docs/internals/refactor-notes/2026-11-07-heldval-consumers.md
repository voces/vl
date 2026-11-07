# The function-holding consumers read `elabHeldValTy` (2026-11-07)

Consumer half of `2026-11-07-fn-holding-facts.md`. Three `emit_mono` functions now take the closed
type of a value holding functions from `elabHeldValTy`; `monoClosedObjLitTy` is deleted.

| mono function | reads the reader | where mono still decides |
|---|---|---|
| `monoCloseRetFnTy` | always | nowhere |
| `monoPinReturnedObj` | when every open field is a literal or a closed binding read (`monoObjLitFieldsTake`) | a field reading a function or an open binding: the record keeps its open type, as before |
| `monoRetFnListTy` | when the answer is not just the identity type | the reader declines (D4515, `container-of-generic-flow-reads.vl` L39/L40), answers by identity only, or the list holds literals in a generic instance |

The reader's record type is recorded with `monoRecordObjLitAt`, the recorder `let` writes already
use. A list's type goes down its literal (`monoRecordHeldList`) and its functions are delivered at
it (`monoDeliverLitAt` with no slot).

## Why each guard

The first draft took every answer. Over the sweep population it lost 19 programs that ran, and
made 22 new compiler traps. Every one was a `new-only` decision, where mono had recorded nothing
and the emitter had chosen the rep some other way:

- **A record field reading a function or an open binding** (`d15221_opt_*`, D9181, D9302,
  `hole-fn-map-record-returned.vl`). The read keeps the rep the emitter picked for that field
  (a direct function index; the `Map()` binding's own rep), and a closed record type disagrees
  with it.
- **A list holding records in a generic instance** (D15296, `d15293_called.vl`). The records share
  the template's nodes, so the recorded types disagree.
- **A list the reader closes only by its identity** (`lambda-list-join-type-param-pin.vl`: the
  `closed` class). Delivering it again breaks a working lambda.

## Measured

Fixpoint seed, `refresh-compiler.sh` twice, byte-identical. 6,436,722 → 6,439,369 bytes (+2,647).

Sweep, base `#6695` against the candidate: 23,606 same, 4 bytes-only, 0 output movers, 0
`runs → not-runs`, 0 new traps. The 4 bytes-only movers (`d15203_run_uncalled_list`,
`d15203_run_uncalled_list_of_lists`, `d15207_fn_list_ret`, `list-of-generic-returned-measured.vl`)
are returned lists of functions that nothing calls. Each function is now instanced at the list's
elaboration type, where before the uncalled stub served it. The printed output is unchanged.

No witness changes outcome. D15274 and D15296 (open) still refuse. The intermediate draft ran
`d15293_called_two.vl`, but the generic-instance guard parks it with its one-call twin.

`pin-helper budget`: 945 → 946. `monoClosedObjLitTy` is deleted. `monoRecordHeldList`,
`monoObjLitFieldsTake` and the reader's call replace it, and `monoRecordHeldList` is the net
helper.
