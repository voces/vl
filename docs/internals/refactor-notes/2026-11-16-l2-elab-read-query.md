# L2: the read query moves into the elaboration, and check asks it, 2026-11-16

Step 3 of [the read-resolution note](2026-11-16-l2-read-resolution.md), which the coordinator
approved. The query moves; mono's walkers do not. Mono asks the same function it asked before,
so the move is identical by construction.

## The change

- **`compiler/mfr_shadow.vl` becomes `compiler/elab_reads.vl`.** It is elaboration-owned. The
  query is exported as `elabReadFns(read, call)`: the functions a read holds. `elabReadNames` is
  mono's rewrite test. The chain walk and the literal value-flow pass move with them, unchanged.
- **A new, small `mfr_shadow.vl` keeps only the shadow.** Armed with `$VL_REP_SHADOW`:
  - `elabPrepare`'s last step saves check's answer for every call whose callee is not a declared
    function's name (`mfrCheckSnap`);
  - each mono ask is compared with it, as `repAB/mfr <outcome> -> call/same` or
    `changed:<check's functions>><mono's>`;
  - the iface dump (`$VL_IFACES`) prints the saved answers' counts, `reads one N many N none N`.
- **The host arms the rep shadow under the CLI pump too.** So `vl check --codegen` saves check's
  answer even when emit then refuses. Before this, only a build armed it.

## Measured

Against master's fixpoint seed: see the PR body for the identity proof (fingerprint and
witnesses) and the gates.

**Agreement over the corpus** (the 694 files that ask, rerun with this tree's seed):

| | asks |
| --- | --- |
| call, check's saved answer the same as mono's | 1,777 |
| call, changed | 2 |
| value read (not saved at check) | 69 |

The 2 changed asks are `named/d15221_ufcsb_{half,dbl}.vl`.
- **Check answers `{inc0, half}` and mono answers `{half}`.** The read is element 1 of a list a
  UFCS call returns (`3.mk()[1].f`).
- **Mono is exact.** Check's answer is a sound superset, because its literal-index rung does not
  follow the UFCS call to the list it returns.
- **With a holder added, the spelling is refused today for another reason** (the returned lists'
  rows differ), so no `runs` is at stake now. Still, check's answer is imprecise for a read
  through a call's result. Until it matches mono, a check-time refusal must not fire on that
  shape.

**The 9 "none" outcomes:**
- **6 were the shadow's.** A desugared optional call's callee is minted after check, and
  `elabReadNames` answers it through the `?.` read it stands for (`optCallCalleeOf`). The shadow
  now does the same, and all 6 agree, the same at check.
- **3 are the query's own gaps, the same on both sides.** In each, the call holds one known
  function, which the query does not reach:
  - a map read out of a returned map (`named/d16121_returned_index_read_ann.vl`);
  - `functions/uncalled-inference-hole-param-pruned.vl`;
  - a nullable function slot written through a record field
    (`generics/generic-function-into-nullable-function-slot.vl`).
- So "none" means the query does not know. A refusal rule must treat it as unanswered, never as
  several functions.

**D16881, now observed** (`VL_REP_SHADOW=1 VL_IFACES=1 vl check --codegen`, on refused builds):

| program | holder | check's answer for `o.l[0]` | today |
| --- | --- | --- | --- |
| D16878's same order | yes | one function | runs |
| D16881 (two orders) | yes | many | emit refusal |

`tests/vl_read_query_test.ts` pins both rows. It also pins agreement (every call `same`) on three
corpus programs whose asks cover the slot-flow, const-list, literal-index and loop-variable rungs.

## What STORE's refusal may rely on

- **Refuse on "many" only.** That is check's answer for the callee read when the set's tag
  decision is forced.
- **Do not refuse on "none".** It is the query's gap.
- **Do not fire where the read goes through a call's result** (the D15221 shape) until check
  matches mono there.
