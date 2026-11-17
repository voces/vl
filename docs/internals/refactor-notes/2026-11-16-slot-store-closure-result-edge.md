# Place classes: a call-result edge from a closure a reached instance makes (lane SLOT, 2026-11-16)

A step on [D16843](../inventory/D16843.md), in the slot store's place classes ([D16768](../inventory/D16768.md)).

## What changed

- **`eplCallResultFlow`** draws a call through a function value from each member's result place at
  every frame key `eplResultKeysOf` names. Those keys are the frame instance among the calling
  instance's ancestors, as before, or else each instance of the member's frame that the calling
  instance nests or reaches (`elabReaches`). Before, a closure made in an instance the caller only
  reached, such as `wrap`'s instance, which is minted at the root and not under `mid`'s, drew nothing.

## Termination

- Each edge is drawn once per (frame key, member, call), recorded in the pass's `done` set.
- `eplBuild` mints no instance, so the frame keys, the members (decls under the write index) and the
  call records are fixed during the pass. The triples are therefore finite, and the fixpoint loop
  stops when a round draws none.
- `elabReaches` walks `ekReach` under a visited set.
- The pass has no depth cap of its own. The pre-existing round cap of 8 is not what bounds it.
- Control: the witness hung an earlier attempt. It now compiles in about 8 s under `timeout 120`, and
  its fixture runs in `tests/cases`.

## Readings

Fixpoint seeds on both sides: master `6cd505a50` and this branch.

| check | reading |
|---|---|
| `tests/cases` built, error text compared | 1 differs: the D16843 fixture, back to master's message from before #8731 |
| distilled corpus, per cell | `regress.vl --json` byte-identical to master's; 0 `runs -> not-runs`, 0 `-> silent` |
| `tests/vl_scaling_shape_test.ts` | 92 passed |
| L2 self-compile fuel | 94.042e9 (+0.2% on baseline 93.885e9) |
| gate | green apart from the changelog section heading, since fixed |
| `vl fmt` follow-up | seed byte-identical |

## What it does not do

The witness still does not run. Mono refuses it ("parameter `a` of `mid` is called at two function
types that no parameter per type separates"): its per-type parameter split does not see an
instantiation that a returned closure carries. The row stays open on that, in L2's mono-into-check area.
