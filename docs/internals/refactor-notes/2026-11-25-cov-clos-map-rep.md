# IR rep derivation: a map held at its mv slot's value type (2026-11-25, lane COV-CLOS)

This is item A of the remaining `map get rep` rows, under the coordinator's ruling for option (1):
one derivation point, so the binding's rep says what legacy stores, with the RMapGet verifier rule
unchanged.

## Population

Measured before building, with a counting compiler at `mapRecvKeyOf`, which every map operation's
receiver goes through. It counts unique bindings whose declared map value type is open (a hole)
while the receiver's mv slot (`mapRecvShapeOf` → `mvValTyIxAt`, the slot legacy reads) stores a
closed type:

| population | bindings |
|---|---:|
| tests/cases | 107 |
| witnesses | 39 |
| probes | 2 |
| scripts/ | 0 |
| self (compiler/entry.vl) | 0 |

By kind: 142 module globals, 3 locals and 3 expression receivers. No set has a closed slot: all 18
open-valued sets have an open slot.

## Mechanism

`mapSlotHeldTy(ty, recvIx)` returns the map of the slot's value type (`mapTyWithVal`, a one-line
`emit_shape_rows.vl` wrapper over `mkMapTy`) when the value type is open and the slot's is closed.
It reads the slot off the same expression legacy does. A global reads it at its read
(`mapGlobalOf`), and a local at its initializer (`irBDeclVar`), which is where legacy's local slot
(`localStructIdx`) comes from. Every IR node then sees the map through the binding's rep.

The 3 expression receivers (`mk().get("a")`) keep their rep. Their rep is the callee's return rep,
so changing it would change a function signature's rep, a ripple beyond maps.

## Census: base (master) → head, over 11,467 programs (tests/cases, probes, scripts/)

| | base | head |
|---|---:|---:|
| distinct functions claimed | 105,835 | 105,841 |
| start bodies claimed | 7,825 | 7,825 |
| fallbacks | 1 | 1 |

No function lost its claim. Classes that moved:

| class | base | head |
|---|---:|---:|
| `map read mv value rep` | 5 | 0 |
| `map get rep` | 6 | 3 |
| `open local type` | 7 | 4 |
| `declaration coercion` | 4 | 9 |

The rows that moved to `declaration coercion` are a read of a nullable bundle into a local, which
`holderRecordTy` holds at the bare record and so drops the `| null`. That is the nullable-holder
step, approved in principle as its own PR. The 3 `map get rep` rows left are C (2, its own PR) and B
(1, a named miss).

## Proof

* `scripts/rep-fuzz-check.sh`: "exact ✅ (0 baselined failures — 0 unsound, 0 reject)".
* `ir-identity.sh --cases`: cases 8,304 identical and witnesses 87 the same, 0 differ in either.
* I8 sweep `--check`: "0 causes, none new: ok". Edges: "24, none new: ok". `scripts/gate.sh --fast`:
  green.

## Q58 sweep

`tests/cases/maps/map-of-bundles-held-at-slot-positions.vl` covers a module `const` and a `let`:
`.has`, index, `get`, a write and a lambda's capture, each calling the bundle it reads. Every
position prints its value. `.has`, the write and the captures are claimed on base and on head. The
reads move from `map get rep` to `declaration coercion` (the nullable-holder step).

Two positions are left out because legacy refuses them already on master, with or without this
change. They are filed:
- a `for` over the map's values is D17582;
- a `??` over a read is D17583.
