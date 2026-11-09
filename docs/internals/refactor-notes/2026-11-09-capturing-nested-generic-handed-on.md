# Step 4: a capturing nested generic handed to a type parameter is built per encloser (2026-11-09)

Lane "D15105, D15331 and D14843's neighbours". Base: master `3c1d56f6`, built to a fixpoint
(6,571,112 bytes). The candidate is that master plus this PR, also a fixpoint.

## What refused, and where

`mid<F>(a: F) { print(a("x")) }` handed `outer<U>`'s nested `same<T>`, which reads `u` (D15105).
`a("x")` in `mid`'s instance is a direct call of `same` through the `Fn#same` binding, made from
an instance whose chain does not hold `outer`. `elabParentFor` gave `same` no parent there (−2),
so `same` got no key and mono's argument pin refused at `mid(same)`. Dropping the capture, or
making `outer` non-generic, gives `same` a root parent, which is why both ran.

| producer | change |
|---|---|
| `elabOneAt` | a call whose declaration has no parent on the instance's chain is recorded (`elabHandedNote`) instead of being enqueued at −2 |
| `elabHandedAt`, `elabReachNote` | each recorded call is built under every encloser instance whose call hands the instance the value, both those seen already and later ones, since `mid`'s instance is walked before `outer`'s reaches it. The handed argument's value holds the new key |
| `elabOutTyVia`, `elabValCallInst` | instances of one declaration that bind its own names alike and differ only in their encloser read as one type, so `F`'s closed type with two `outer` instances is not ambiguous (`elabReachedAgreedOf`, `elabOwnBindsAlike`) |

The first candidate built the member in `elabSetCallRows`, which this call never reaches. A trace of
`elabEnqueue` showed that the direct call through the singleton is `elabOneAt`'s body-call loop.

## Graded

| program | base | candidate |
|---|---|---|
| D15105's witness | emit reject | `7 x` |
| `mid` un-annotated (`mid(a)`) | emit reject | runs |
| `same` a hole function (`same(k)`) | emit reject | runs |
| `outer(7)` and `outer("s")` | emit reject | `7 x s x` |
| `mid(same, same)`, `a("x")` and `b(1)`, two `outer` instances | emit reject | `7 x 7 1 s x s 1` |
| N1: `mid` recursing in swapped positions, two instances | emit reject | `x x` |

All six are in `generics/capturing-nested-generic-handed-to-type-parameter.vl`.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,751 programs | | 23,750 same, 0 bytes-only, 1 output mover (D15105's witness, emit reject → runs), 0 `runs → not-runs`, 0 new traps; the fixture only in the candidate |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail (against its baseline) | | −1.6% / −2.7% |
| self-compile peak RSS (VmHWM) | 3,846,552 kB | 3,876,420 kB (+0.8%) |
| seed (fixpoint) | 6,571,112 | 6,575,249 (+4,137) |

## What stands

A recorded call is built only under an instance one call away from the instance making it, so a
hand-on through a forwarder (`fwd<G>(g: G) { mid(g) }`, `outer` calling `fwd(same)`) still refuses
with the same message. The
agreement read answers a type; which sibling a direct call runs is still the call's own key.
