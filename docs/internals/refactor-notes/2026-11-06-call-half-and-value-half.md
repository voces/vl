# The call half and the value half

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

#### The call half and the value half (2026-11-06)

**A function delivered as a value has all its instances in the value half; a function only ever
called by name has all its instances in the call half** (coordinator ruling, 2026-11-06). The
predicate is `elabDeclIsValue`: some read of the name is not a call's callee. Under it no function
has instances keyed two ways. Splitting one function's instances across the halves (the written
binding a value is copied through, which one instance has to serve) was the one source of output
movers that keying by rep could not close.

- **The call half** keys an instance made for a call by the elaboration's call-time key
  (`elabWalkKeyOf`) plus the rep and tagged set each parameter is pinned at, the enclosing call
  frame and the callback specialization (`instKeyCanon`). The body is still elaborated at mono's
  demanded key, which is rep-consistent. Measured over `tests/cases` with fixpoint seeds: 8,450 of
  11,271 call-made instances, 76 programs' bytes move and 0 programs' outputs.
- **The value half** keys an instance of a function delivered as a value, call and value alike,
  by the elaboration's key for it (`instKeyValueTime`: the call's key, else the value's, else the
  typed slot's), plus the same rep, frame and specialization components. Its typed-slot rule is
  `elabMemberKeyAt(decl, T)` with `T` the type the checker recorded for the slot, never mono's pins.
  Measured over `tests/cases` with fixpoint seeds: 0 programs' bytes move. An instance the
  elaboration has no key for keeps mono's spelling.

The typed fallback (`monoTypedKeys`), which reuses an instance by its pinned types, serves a
request only where the request's elaboration key and the instance's spell the same instance: one
rep can carry two types whose bodies differ, by an `is` test (a `Set` and its map twin, D10540) or
by a type parameter read as a value (`R.size` in the `flat-generic-rows-*` fixtures). That guard
replaced `monoElabSplitKey`, which asked the elaboration for the call's wanted instance a second
way (`elabCallInstWant`); both are deleted. Gating the guard on `elabTestsTyVar` alone misses the
`R.size` reads and miscompiles three programs, so it applies to every body.

**A lambda's instance is keyed by the instance it is nested in** (2026-11-06): the walk top
(`elabWalkTop`), the declaration, and the rep and tagged set of each pin. Measured against the
elaboration's own index of nested instances (`elabKidsAt`) over the 1,423 lambda instances in
`tests/cases`, that key names exactly the elaboration's instance for all 1,377 made inside an
instance walk; the 46 made outside one have no elaboration key and keep mono's. It moves no
module's bytes.

The typed fallback (`monoTypedInstKey`) slices mono's spelled key at the offsets
`monoMakeInstanceKeyOf` recorded, so it is derived from that spelling and never from the
canonical key that replaces it. Sliced from the canonical key it read garbage: the 76 byte
movers of the call half were that, and it reused a wrong lambda instance when the lambda key
first switched (`generics/hole-call-generic-lambda-arg.vl` trapped).

**Where the two keys still disagree** (2026-11-06, fixpoint of master `597704eca`). 165 instances
have a call-time key (`instKeyCallTime`) that spells differently from the key mono demanded
(`elabDemand`):

| class | n | difference | partition |
|---|---|---|---|
| set vs signature | 140 | a hole parameter handed a tagged set is keyed by the set (`Fn#7`) on one side and by its closed signature on the other | one-to-one per declaration |
| one set, two signatures | 3 | a generic in a set instanced at two types (`generic-fn-value-returned-through-identity-hole.vl`) | the set alone merges two instances; the pinned reps keep them apart |
| nested member at another parent | 14 | the typed-slot lookup returned a nested instance under the first enclosing instance | fixed: `elabMemberKeyAtTys` prefers `elabKidsAt(decl, walkTop)` |
| bundle member | 4 | a lambda handed as a closure bundle has one instance per signature; the value key names another member | the key needs the member's signature (`elabCallBundleSigs`) |
| type vs rep | 4 | one side names the type (`T=(1\|2)`, `{r:null}`), the other the rep | expected; the rep component carries it |

The 4 bundle members are keyed since #6461: the value key (`instKeyValueTime`) asks
`elabValueKeyAt` for the member taking the pinned types. The other classes are spellings the
canonical key already absorbs.
