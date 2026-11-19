# Set-keyed instances of a generic over a map of a tagged set (D17014)

Lane F2, 2026-11-19. A design note before building; nothing here is landed.

## The question

`function pick<V>(m: {[string]: V}, k: string): V | null` called with a map whose values are a
tagged set `S` (decided by STORE's `ftTyParamMapTakes`). Which instance does mono walk, and at what
rep do its read and its result live?

## What each layer does today (master `3398cf5f5` plus the D14433 decision half)

| layer | binds `V` to | evidence |
| --- | --- | --- |
| elaboration plan | the set `S` (`Fn#6`) | `elabEnqueue` key `pick\|V=Fn#6#13;` |
| mono pin (branch `f2/d14433`) | the id rep `i32`, via the stored map `{[string]: i32}` | demand `pick\|V=i32;`, minted after `elabRun`: a late demand |
| emit, rep-keyed instance | read `i32 \| null` box, result `i32 \| null` box | runs `pick`; `callAt`'s `f(2)` calls an `i32` and is refused |
| emit, set-keyed instance (scratch) | read lowered at the rep, signature `F \| null` box | `return m.get(k)` invalid; `const r = m.get(k); return r` runs |

Lists already take the set route: `put<T>(xs: T[], x: T)` (D10010) is planned at `T=Fn#16`, mono's
`T=i32` demand is swapped back to that key in `elabDemandFrom` through `elabCallArgSetTy`, and the
set-keyed body lowers. Maps lack the swap (STORE is generalising `elabCallArgSetTy` to any holder of
a tagged set, map value included, on `store-b3-held-key`) and lack a consistent lowering at the set.

## The plan

1. **Key (STORE).** `elabCallArgSetTy` keys a map argument whose value holds `S` at the set, so mono's
   demand finds the planned key: late demands stay at the baseline.
2. **One rep for `S | null` (F2).** A tagged set's `F | null` is the sentinel niche the map read
   already produces (an `i32` id, `-1` for absent), in a local, a signature and a call result alike.
   Today a local takes the niche while a declared `V | null` result at `V = S` takes the union box,
   so `return m.get(k)` disagrees with its own signature. The result kind of a function whose
   declared or substituted return is `S | null` becomes the niche kind; the caller's `??` then takes
   the existing `K | null` niche arm for a returning call, and `if h != null` the niche test.
   `nulTagIdRepTy`'s box keying (emit_classify.vl, wasmEmit.vl) is deleted with it.
3. **Mono walks the set-keyed instance (F2).** The map arm in `monoPinAnnotatedParam` pins at the set,
   as the bare-`T` arm does (`tyToStr(setTy)`), not at the stored map of ids, so the instance's
   parameter, its `m.get(k)` read (the `monoPinMemberCall` get rewrite, which records `F | null` and
   asks for its box today) and its result are all typed at `S`. The `get`-versus-index distinction
   holds: the rewritten read keeps `get`'s absent answer, never the trapping `m[k]` helper.

## Grading

The D17014 witness (`callAt`, `4 3.5`), D14433's spellings (`3 3.5`, one signature `3`), D17011's
(`1.5`, `if h != null` `1.5`), the bound-return spelling, the list twin D10010 unchanged, late
demands at the baseline, and the @run A/B byte-identical outside these programs.
