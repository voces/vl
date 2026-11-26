# A hole parameter called with a captured hole is claimed (lane CENSUS, 2026-11-26)

**Mechanism.** A lambda's un-annotated function parameter (`fs.push((g) => print(g(k, 3)))`) has
its own type `_`, so the builder refused it (`parameter rep unsup`). Legacy frames it at the closed
closure type its callers bind (`parTyNode`, kind `closure`) and calls it through the plain closure
call, each argument at the call key's slot. Two pieces, no new call kind:

1. `paramFrameTy` takes `parTyNode(p)` for a "closure" parameter whose type is closed at a closure
   rep.
2. A hole-typed argument (a captured un-annotated parameter, no scalar width) is plain at a scalar
   key slot (`callRefArgPlain`), as legacy writes it: as its slot holds it. `closureCallAt` delivers
   it through `irConvert` to the scalar the key's slot names (`keyScalarRep`) — not to the callee's
   frame rep, whose parameter types `parTyNode` leaves as placeholders that no call reads.

**Reading** (census probe on this tree's seed; class programs only, regen-9 population on master
eb859a9c6 — 12 `parameter rep unsup` units in 3 cases and 3 witnesses):

| | before | after |
|---|--:|--:|
| `parameter rep unsup` units | 12 | 0 |
| of those units, claimed | 0 | 12 |

Every case prints its `@log` lines; each witness prints what master's seed prints. The programs'
other units (`open local type`, `store operand coercion`, `field store coercion`) do not move.
