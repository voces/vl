# Next stage, first item: a per-call delivered-rep fact

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

#### Next stage, first item: a per-call delivered-rep fact

**Built for the instance result** (2026-11-06). The reach rows (`elabReachRows`, emit_elab) hold,
per reach the elaboration recorded (a call node and the instance it reaches), the rep each
parameter of that instance is delivered at where it is not the parameter's type: the record of one
closure per signature a bundle parameter is called at, or the wider record `callArgRepTy` names.
`elabCallArgRep` reads them, `ELAB_REP_NO_ROW` where no reach was recorded, which mono refuses
loudly. `elabRetParamOf` names the parameter a function returns whole, and `monoInstanceRet`
returns that parameter's delivered rep in place of `monoReturnedBundlePin` and `monoRetRepOf`.

Shadowed over 23,103 programs and the deno inline programs: every instance agrees, 148 of them
moved off the result's type (135 bundles, 13 wider records), and 0 reach no row once the rows key a
method call's receiver as its first parameter and a `[]=` write's dispatch call carries its operator
node (`drwOpCall`). The byte sweep against master's fixpoint is 23,103 identical.
`tests/vl_elab_arg_rep_test.ts` holds the rule that a rep differs from its type only as one of the
two. The other readers (`monoArgRepRowTy`, `monoPinHoleParam`, `monoPinAnnotatedParam`,
`monoBundlePin`) come next.

`pass2(m, Set())` returning its parameter (D15040's set at a bare type parameter) reaches no row
and is now a loud emit refusal; D1578's witness, which must stay invalid wasm, returns `i32`.

**An argument's built record** (2026-11-06). Beside each slot, `erArgBuilt` holds the record the
argument is built at where the call's bind row keys or pins it at its rep (`callBindRepKeyedAt`,
`callBindRepMixedAt`), measured against the argument's own type. `elabArgBuiltRep` reads it where
`monoArgRepRowTy` derived it, which is deleted. The rep slot alone answers the parameter's
question, not the argument's: at a declared wider parameter (D2060's covariant records) the
parameter's type differs from the argument's own while the argument keeps its record, and the 272
such sites stay declined.

**The parameter pins are aligned.** `monoPinHoleParam` and `monoPinAnnotatedParam` read
`callArgRepTy` over `elabCallParamTy`, the checker's fact `erArgRep` is built from, and agree with
the column at all 40 sites a rep reaches. They stay on it: 157 of their queries are calls with no
reach row (124 the elaboration never reached, the rest reached only from another instance), where
the rep is the type and the column has nothing to answer.

**The bundle pins read the fact** (2026-11-06). `monoBundlePin` takes the record a bundle argument
is delivered at from `elabCallArgRep`, and `monoClosureBundlePin` takes the closure, in place of
minting either from the signatures; `monoCallsHandGenerics` is deleted, its gate now the
elaboration's (`elabCloBundleRep`). One minter, `bundleRecordTyOf`, serves both. The fact was wrong
at one slot first: a lambda calling its own parameter at two or more signatures (`use(lap)` in
`closures/lambda-bundle-through-hole-param-at-several-signatures.vl`) is one closure taking their
bundle, not a bundle record, and it now records the closure whatever the callee's own signature
count. Shadowed over 23,103 programs: 295 bundle sites and 12 closure sites agree, none differs or
is new-only. The byte sweep against master's fixpoint is 23,103 identical.

**The delivered bundles answer "is this a bundle"** (2026-11-06). `elabDeliveredBundleSigs` keys a
bundle record by its own index: one a reach row delivers, as a slot's rep or as the parameter of a
closure rep. `monoBundleTys`, emit_bundle's `bundleTys` and `bundleTyNote` are deleted, and their six
readers (the instance parameter note, `monoCoerceBundleArgs`, `monoIsBundleTy`, `monoBundleHandOnPin`,
`bundleCallArgSigs`, now in wasmEmit, and the bundle-key parameter scan) read it. The index is the
test because records do not intern: `closures/hole-lambda-bundle-positions.vl` writes
`type B = { c0: …, c1: … }` by hand, a bundle's shape that keeps its own fields, and a shape test
called it a bundle where the index does not (`tests/vl_elab_arg_rep_test.ts` holds that control).
Shadowed over 23,103 programs, the five shadowed reads agree everywhere;
`monoBundleHandOnPin`'s is graded by the byte sweep alone.

**A bundle record is one per signature set** (2026-11-07). Every record mono minted for one
signature list already shared one struct row (over 23,103 programs: 98 first, 6 same index, 203 a
later index on the same row, 0 on another row), so `bundleRecordTyOf` (emit_elab) mints one record
per signature list for the build and every site takes it: the reach rows, the closure bundle, the
lambda arm and mono's field, list and map holders. emit_bundle's `bundleRecs`, `bundleRecordNote`
and `bundleRecordOfSigs` are deleted; the readers ask `elabBundleRecordOf`. 25 reads that found no
record before, where the elaboration holds a bundle mono never built, now find one; the byte sweep
against master's fixpoint is 23,103 identical, so none of them reaches emitted code.

**D15494 is no bundle.** Its two-signature maps hold uniform closure structs and each call site
reaches its own closure signature; the map's `(i32) => i32` spelling is the unbound default, which
slots no call reads take too. It belongs to the unbound-default family.

**D15494's population at the adopted-binding read.** Thirty of the 130 `monoBindingAdoptInit`
decisions the elaboration leaves open hold a named generic in a map or list slot, so the slot's value
is a polymorphic identity with no one signature. They are this question, not a missing delivery, and
they close with its answer. Bindings per file (`tests/cases/`):
- maps (26):
  - `closures/generic-fn-in-unannotated-map.vl`: `r`
  - `closures/generic-record-written-into-map-through-param-read-through-optional.vl`: `a`
  - `closures/hole-fn-generic-in-map-called-at-two-types.vl`: `m`, `b`, `n`, `z`, `o`, `q`
  - `closures/hole-fn-generic-map-handed-two-maps.vl`: `m`, `m2`, `b`, `c`, `e`, `f`
  - `closures/hole-fn-generic-map-stored-through-parameter.vl`: `a`, `c`, `d`
  - `closures/map-read-field-store-repointed-let-listed-at-two-types.vl`: `m`
  - `generics/fn-value-generic-container-read-listed-or-stored.vl`: `m`, `mg`, `ma`, `mp`, `mq`
  - `generics/fn-value-generic-copied-returned-or-aliased-handed.vl`: `m`
  - `generics/fn-value-generic-handed-from-call-map-or-repointed-let.vl`: `m`, `ml`
- lists (4):
  - `closures/nested-generic-written-into-capture-cell-at-two-instances.vl`: `k`
  - `closures/written-let-seeded-from-parameter-written-with-generic.vl`: `k`
  - `functions/exported-generic-reached-through-lambda-field-or-list-called.vl`: `ks`
  - `generics/nested-capture-array-element.vl`: `fs`

A captured cell nothing reads is the same question. In
`closures/hole-lambda-cell-takes-instance-type.vl`'s `peerPinned`, `let d2 = e` is re-written by a
lambda to `c` and never read or called. Closing `d2` needs an instance for `e`, a hole function no
call reaches. That is the default-instance question for an uncalled hole function, so the holder
closure leaves the cell open and builds no default. D3851 records that such a lambda, written only
into bindings nothing reads, is not lowered at all.

DECISIONS.md, "An instance's type and its rep are separate facts", gives the elaboration the
instance's type and gives mono the parameter's rep. `callBindAdoptReps` already records that rep for
a record built wider, which is why 34 of the 74 pairs close under `callArgRepTy`. Each remaining kind
was checked against the emitted wasm before anything was built:

- a value delivered non-null to a nullable function parameter (16 pairs) is not a gap. Mono spells
  the instance's parameter at the non-null type, but every instance lowers it to the same nullable
  closure reference, so the binding's `| null` type already is the rep;
- a closure bundle handed to a parameter (14 pairs) is a real rep, a struct of closures. The
  elaboration already holds its signatures (`elabCallBundleSigs`); mono adds the gate that the
  callee only calls the parameter (`monoBodyReadsOtherThanCalled`), without which the signatures
  claim a bundle mono does not build (5 calls). The gate moves into the elaboration beside them;
- a record whose row mono keys narrower or wider than the binding, or cannot spell because it holds
  generic functions (8 pairs), and literal-union spellings the render softens (2 pairs), are still to
  be checked against the wasm the same way.

The fact: for each argument `i` of each call, the rep it is delivered at, read through `callArgRepTy`
and the bundle record of `elabCallBundleSigs`. Mono's instance choice in `monoWalkIdentCall` and
`monoPinHoleParam` then reads the elaboration's type and this rep, and stops deriving either. The
instance choice switches in one change with the derivation's deletion, graded by
`scripts/inst-shadow/run.sh`. It needs no `REAL` tag, and every `no:` bucket left must be a named
fallback. A cell where the elaboration answers and mono declines or leaves its pin open (the 1,969
calls above) must keep declining, or be shown output-neutral by the sweep: a `monoHoleGenFnPin` switch
whose site shadow read 230 of 230 agree still lost two runs to such cells.
