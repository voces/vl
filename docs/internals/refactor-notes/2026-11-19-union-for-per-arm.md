# A union `for` at a pin walks per arm (2026-11-19)

Step 4 of the arm-site dispatcher plan (`2026-11-19-arm-site-dispatcher.md`): the `for` over a
union box that a pin left unrewritten.

## Shape
- **List arms** (`emitListUnionForLoop` / `emitListUnionForArm`, wasmEmit.vl). One tag test picks
  the arm, then that arm's list is walked in its own loop. Each element enters the element union
  at a statically known row (`armElemRowOf`, `armRowBoxOpen`/`armRowBoxClose`). The
  per-iteration length and element tag chains (`emitListUnionForLen`, the `Elem` chain) are
  deleted.
- **Map arms** (`emitMapUnionFor` / `emitMapUnionForArm`). One tag test, then the native map walk
  re-lowers under the receiver override. `emitForInBind` boxes the pair's value into the value
  union at the arm's row (`forInPairBox`).
  - The checker types the loop at a pin: the key, and the value union `luElemTy` now also reads
    off map arms.
  - The collect pass declares the first arm's walk with the pair at the value union
    (`declareForInLocals`, `lmForValKind`).
- **Known arm** (`knownArmEnter` / `knownArmOf`). Inside arm `i`'s walk of a binding, a nested
  union walk of the same binding takes arm `i` alone, with no tag chain. The fact is the
  emitter's own.
  - It holds only when nothing writes the binding: `elabLetAssigned`, which is `cwDeclAssigned`,
    closures included.
  - Same-receiver nesting is therefore linear in its depth. Distinct receivers stay a product.
- The arms exclude each other, so each arm's body reuses the first arm's let slots (`cur0`).

## Not in this step
`.keys()` / `.values()` over a union of maps stay declined at the pin. Their call reaches the
instance at the template's list type, not the pin's, so an arm dispatch would deliver at the wrong
type.

## Measured (master fixpoint `227d0d066` vs this branch's fixpoint)
- @run corpus: 6,768 cases, 14,619,360 → 14,619,677 bytes (+317). One case changes:
  `unions/list-union-for-through-hole.vl`, 3,665 → 3,982.
- A synthetic `walk(a)` with D nested walks of the same receiver, N list arms (bytes, master →
  this):

| arms | depth 1 | depth 2 | depth 3 |
| --- | --- | --- | --- |
| 2 | 567 → 584 | 739 → 730 | 911 → 876 |
| 3 | 703 → 752 | 938 → 964 | 1,173 → 1,176 |
| 4 | 805 → 886 | 1,106 → 1,167 | 1,407 → 1,448 |

- Distinct receivers, 2 arms each, depth 2: 718 → 894. A binding the body rebinds: 730 → 910.
  A binding a called closure rebinds: 980 → 1,202. These last two dispatch per arm at every level,
  by design.
