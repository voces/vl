# IR: a hole-lambda binding in an instance body (2026-11-21, lane IR-D1)

Coordinator assignment: `open temp type` together with IR-N7's `rep ?` (untyped nodes in an
instance body) and the `declaration coercion` cells d15110/d15112. One root was checked first and
found: a `let` bound to a hole lambda inside an instance.

## The witnesses

`tests/cases/generics/hole-lambda-calls-per-instance.vl`, `function mk(x) { const c = (y) => y;
return c(x) }`, at its instance `mk$1`:
- the `let`'s variable is typed `(_) => _` (held open), while its initializer is built at the
  instance's closed closure, so the declaration missed as `declaration coercion`;
- the read `c` names the TEMPLATE's `let` (node 5), while the instance declares its clone (node
  195). So the read found no variable and, untyped, missed as `rep ?`.

## The change

- A `let` whose open function type legacy's stored binding fact holds as a closure
  (`letBindRepClaims`, `letBindRep().rdKind == "closure"`) takes the closure its initializer
  builds (`cellTakesClosure`).
- A read of a `let` whose own type is open reads the variable already at that wasm local
  (`readDeclVar`, after `declVarAt`'s one variable per local). An untyped binding read is typed
  off that variable (`boundVarOf` in `exprTyOf`).

## Measured vs master e1ccdc33 (fixpoint seeds on both sides)

| population | functions | start bodies |
| --- | --- | --- |
| self-compile | 19,478 → 19,482 | 138 → 138 |
| distilled | 44,471 → 44,475 | 8,056 → 8,056 |
| tests/cases | 62,004 → 62,041 | 4,642 → 4,642 |
| capability probes | 514 → 514 | 156 → 156 |
| filed witnesses | 17,709 → 17,718 | 3,451 → 3,451 |

First misses:
- tests/cases: `declaration coercion` 156 → 115 and `rep ?` 90 → 61.
- distilled: `declaration coercion` 56 → 43.

Still open: such a binding read through a capture inside a lambda. `capRepOf` refuses the
parent's held-open binding type there.
