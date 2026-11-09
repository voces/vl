# A capturing nested hole called at two types is bundled (2026-11-09)

Lane "D15596". Base: master `c68eadb9` (#6958 merged), whose compiler is `b2389003`'s plus
#6958. The fix widens #6958's `elabNestedGeneric`. The candidate is that master plus this PR, built
to a fixpoint (6,581,299 bytes).

## What refused, and what the bundle broke

`mid<F>(a: F)` calls `a("x")` and `a(2)`. It is handed `outer<U>`'s nested hole `same(k)`, which
reads `u`. A value of `same` has to serve two signatures and carry `u`, so it needs one closure
per signature over one environment: the bundle D15595 builds for `same<T>(k: T): T`. Without one,
mono pins `mid(same)`'s argument from the open type and refuses.

Admitting the hole to the bundle (`elabNestedGeneric`) built a module that trapped with
`indirect call type mismatch`. A probe in a scratch compiler showed every layer before the prune
was right:

| layer | `outer@i32` | `outer@bool` |
|---|---|---|
| elab keys of `same` | `(string) => string`, `(i32) => i32` | both |
| mono instances (`monoInstanceFor`) | slot 2, slot 3 `same$1` | slot 4, slot 6 `same$2` |
| built-closure row at the read | both | both |
| after `monoPruneTemplates` | `same$1` stubbed, no parameters | both kept |

`monoNestedFnDead` calls a nested slot dead when its parent's body does not name it. The bundle
keeps the read as the generic `same` (`monoNoRename`) and finds each instance through the row, so
no body names `same$1`. `same$2` escaped only because its slot no longer held its original node.
The fix keeps every slot the row delivers. That needs no new table: the set is local to the prune.

## Graded

| program | base | candidate |
|---|---|---|
| D15596's witness | emit reject | `7 x 7 2 true x true 2` |
| `outer(7)` alone | emit reject | runs |
| `mid(a)` un-annotated | emit reject | runs |
| three signatures, `outer(7)` and `outer("s")` | emit reject | runs |
| two captures (`u` and `w: string`) | emit reject | runs |
| also called directly in `outer` | emit reject | runs |
| through a forwarder `fwd<G>(g: G) { mid(g) }` | emit reject | runs |
| through `outer2<U>(u: U) { outer(u) }` | emit reject | runs |
| the calls in either order, either `outer` first | | runs |

The fixture is `generics/capturing-nested-hole-called-at-two-types.vl`.

## What stands

| program | refusal | reading |
|---|---|---|
| `const same = (k) => { print(u); k }` in `outer` | `the function binding same, a copy of a reassigned binding, is called at more than one argument type` | clause 2; the message names a reassignment the program does not make |
| `mid<F>(a: F, b: F)` handed `same, same`, `a("x")`, `b(2)` | `a generic function handed to two parameters of type F ... F takes one` | clause 2 under the ruling that a hole handed `Fn#d` binds per call |

Both refuse the same on base and candidate.

## Measured

| | base | candidate |
|---|---|---|
| sweep, 23,768 programs (base seed `b2389003`) | | 23,762 same, 0 bytes-only, 6 output movers, all emit reject → runs: #6958's four (D15582, D15595, both fixtures) and D15596's witness and fixture; 0 `runs → not-runs`, 0 new traps |
| rep-fuzz | | exact, 0 failures |
| plumb-shape fuel, main / tail (against its baseline) | | −1.4% / −2.5% |
| self-compile peak RSS (ru_maxrss, mean of 2) | 3,850,882 kB | 3,850,880 kB (0.0%) |
| late demands | 6 | 6 |
| seed (fixpoint) | 6,581,092 | 6,581,299 (+207, +2.9% of the baseline) |

The cost gate reads no RSS on this box (no `/usr/bin/time`), so RSS is read with `getrusage` over
one self-compile per seed. Its base is `b2389003`'s fixpoint, without #6958.
