# `assignable` reads a negative type as "accept": the census, 2026-11-14

Lane J. This note adds no code. It counts every caller that hands `assignable` or `assignableExpr` a negative type, the step the coordinator asked for before a fix.

## The sentinel

`assignable(src, dst)` begins with `if src < 0 || dst < 0 { return true }`. Two negatives reach it:
- `-1`, an unrecorded node type or an open type component;
- `-2`, a function return still being inferred.

Either one is accepted silently. D16300 was this: a list element with no record "fit" `boolean`.

## How it was counted

- A scratch compiler, never refreshed into `build/`, rewrote all 378 call sites of `assignable(` and `assignableExpr(` in 26 files into a twin. The twin records `file:line` and the negative value, then calls the original. The records go through the `$VL_LATE_DEMANDS` channel.
- Every one of the 8,026 `tests/cases` programs ran under it, and so did the 318 reordered programs of D16301.
- A second scratch compiler answered `false` for a negative type instead of `true`. On it, **211 corpus cases fail**, so the accept is load-bearing.

## Sites a corpus program reaches with a negative type

| site | function | shape | (case, side) pairs | values |
| --- | --- | --- | --- | --- |
| `check_assignable.vl:1765` | `assignableExprIn` | B (a missing record at the entry) | 247 | dst-1 228, src-1 19 |
| `check_access.vl:660` | `checkIndexMap` | B (a missing record at the entry) | 178 | dst-1 178 |
| `check_assignable.vl:2137` | `bmArgPred` | B (a missing record at the entry) | 71 | dst-1 71 |
| `check_relate_core.vl:3960` | `fnSlotAssignable` | C (a pending return) | 70 | dst-2 65, src-2 70 |
| `check_relate_core.vl:4234` | `assignableGo` | A (a component of a type) | 41 | dst-1 12, src-1 38 |
| `check_relate_core.vl:4221` | `assignableGo` | A (a component of a type) | 39 | dst-1 12, src-1 35 |
| `check_relate_core.vl:4146` | `assignableGo` | A (a component of a type) | 20 | dst-1 20 |
| `check_assignable.vl:2042` | `assignableArrLitElems` | B (a missing record at the entry) | 19 | src-1 19 |
| `check_relate_core.vl:4153` | `assignableGo` | A (a component of a type) | 17 | src-1 17 |
| `check_relate_core.vl:4142` | `assignableGo` | A (a component of a type) | 8 | dst-1 4, src-1 5 |
| `check_relate_core.vl:4231` | `assignableGo` | A (a component of a type) | 8 | dst-1 2, src-1 7 |
| `check_relate_core.vl:4232` | `assignableGo` | A (a component of a type) | 8 | dst-1 7, src-1 2 |
| `check_operators.vl:713` | `checkAssignStore` | B (a missing record at the entry) | 6 | dst-1 6 |
| `check_relate_core.vl:1247` | `braceNameNote` | B (a missing record at the entry) | 1 | src-1 1 |
| `check_calls.vl:615` | `witnessOf` | B (a missing record at the entry) | 1 | src-1 1 |
| `check_member_call.vl:1331` | `memberCallMapFilterTy` | C (a pending return) | 1 | src-2 1 |

16 of the 378 sites are reached. The rest never see a negative type on the corpus.

## By shape

- **A. A component of a type (`assignableGo`'s own descents):** an element, a map key or value, a nullable inner type, a union member. A `-1` here is the arena's open component, for example the element of an unpinned `[]`. "Fits anything" is the type rule for an open slot, so this should keep its answer under a name of its own, not under the entry's guard.
- **B. A missing record at the entry:** `assignableExprIn`'s `assignable(srcTy, dstTy)`, `checkIndexMap`'s map key, `bmArgPred`'s `want`, `checkAssignStore`'s target, and `assignableArrLitElems` (D16300, closed by #8064). The caller passed a node type it never recorded, so the caller is the one that knows what to do: use the container's type, defer, or refuse.
- **C. A pending return (`-2`):** `fnSlotAssignable` (68 programs) and `memberCallMapFilterTy`. The comparison runs before the callee's return exists, the same shape as D16300. The answer should come from demand-inferring the return (`preInferOne`), not from accepting.

## D16301

Of the 318 reordered programs, 53 reach a negative type on the run path. That is a lower bound, because a program refused at check never prints the channel. Shape C is the order-dependent one. The original programs reach shape C in 68 cases, and none of those cases is a D16301 mover. So the sentinel explains part of the order dependence at most; it is not the whole of it.

## Proposal

1. Shape A gets an explicit `tyOpen` test in `assignableGo`'s descents. Behaviour does not change.
2. Shapes B and C each fix their own callers, one PR per shape, graded on the corpus oracle and the decl-order A/B.
3. `assignable` itself then refuses a negative type through an emit-time counter, read through the late-demands channel, that a gate can check, because the compiler has no debug build. A new site that hands it a negative becomes visible instead of silently passing.
