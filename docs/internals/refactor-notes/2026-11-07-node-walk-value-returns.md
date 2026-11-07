# Node type, instance result, walk type and value returns

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Node type, first reading** (2026-11-06, the same population, against `elabNodeTyAt` at the
instance):

| function | path | agree | both decline | mono only | elaboration only | differ |
|---|---|---|---|---|---|---|
| `monoArgClosedTyIn` | past a closed caller pin | 4,336 | 210 | 0 | 0 | 4 |
| `monoArgClosedTyIn` | the caller's pin | 4,163 | 0 | 38,241 | 0 | 11 |
| `monoCloseRetFnTy` | | 0 | 873 | 28 | 19 | 0 |

- **Switched: past a closed caller pin.** The four differences are one test
  (`pin-exact-key-set-and-its-map.vl`), where the elaboration's type is the `match` arm's non-null
  narrowing. It prints the same either way. `pinnedParamTyAt` and `nodeTyInOf` leave `emit_mono`.
- **Not this family: the caller's pin.** It is `monoArgPinTyIx`, the rep cascade, which belongs to
  the call-param family.
- **Not switched: `monoCloseRetFnTy`.** The elaboration declines a returned list of functions (28
  reads), and it closes 19 calls mono leaves open.

**Instance result, first pass (2026-11-06).**
- `monoRetRecordOf` and its consumers `monoRetConstRecord`, `monoPinCallRecord` and
  `monoPinInPlaceCallRecord` are deleted. The chain never pinned: over the 23,103 programs
  `monoRetRecordOf` returned no record in 112,273 calls, and a build refusing wherever it would
  return one passes the deno suites. A byte sweep of the 23,103 against master's fixpoint seed
  differs on none. The elaboration's result (`elabResultAtParams`) answers 10 of those calls, all
  in `std/idtable-*.vl`. That is a capability question, declined under ruling (a).
- `monoPinnedRetAnnTy`'s 29 answers are a returned list literal of hole functions pinned by its
  caller's calls (`hole-fn-list-returned-reread.vl`). The instance result is open there, so its
  owning fact is the forward climb over the literal's element slot, as for the reach pair, and not
  `elabRetOf`.
- `monoRetRepOf` and `monoReturnedBundlePin` are rep decisions, so they move to the per-call
  delivered rep below.

**Node type, blocked on closed function-holding types** (2026-11-06). Two more helpers were
shadowed against `elabNodeTyAt` at the instance:

| function | agree | both decline | mono only | elaboration only |
|---|---|---|---|---|
| `monoClosedObjLitTy` | 0 | 158 | 8 | 272 |
| `monoRetFnListTy` | 0 | 767 | 23 | 563 |

Mono answers only a type that holds a function (`{m:{[string]:(i32)=>i32}}`, `((i32)=>i32)[]`,
`(i32)=>i32`), which is all these helpers exist for. The elaboration declines every one, and where
it answers (`{q:i32}`, `i32[]`) mono declines by design. `monoCloseRetFnTy` has the same shape.
The rest of the family waits on `elabNodeTyAt` closing a function-holding type at the instance,
the Fn#d lane's function-value identity (D15298). Those mono-only rows are its acceptance
witnesses. Four helpers move to the instance-binding family: `monoPinBin`, `monoPinnedOperandTy`,
`monoPinnedReadTy` and `monoDeadNullTest` read only the instance's own pin column, in
`monoMakeInstanceGo`'s body rewrite.

**Node type, second reading** (2026-11-07, a seeded 2,500-program sample of the reaching programs).
Each A helper was wrapped, with the walk depth recorded.
- **`monoArgClosedTyIn`.** Its `ctx` is a function index at all four callers. Inside an instance
  (`elabKeyAt(ctx) >= 0`) the elaboration answers all 1,387 calls. Outside one, it has no answer at
  7,443 calls, and there the checker's own type equals mono's at 7,361.
- **The 57 "differs".** These are generic calls whose type parameter the destination binds:
  `idn({ r: 4 })` into `J | string` passes `{r: i32}` at `T := J`. That is a different type, not a
  spelling, so the helper's switch reads the callee instance's parameter type (`elabCallInstFrom`).
- **`monoInitHeldTy`.** Probed where `monoBindingAdoptInit` acts on it, there are 36 decisions in
  18 programs. Every one is a container of hole lambdas that the elaboration leaves `(_) => _`.

**Node type, what the returned-literal pins still carry** (2026-11-07, 23,103 programs, master
`58198479` fixpoint). Re-read against `elabNodeTyAt` at the instance, each helper's effect then
removed in a fixpoint candidate and compared by exit code, bytes and failure text:

| function | sites | agree | both decline | mono only | elaboration only | builds lost without it |
|---|---|---|---|---|---|---|
| `monoCloseRetFnTy` | 962 | 0 | 917 | 28 | 17 | 1 |
| `monoPinReturnedObj` | 384 | 0 | 110 | 2 | 272 | 2 |

- **`monoCloseRetFnTy` keeps one caller, the stored call.** Its other four callers (a record field's
  call, an open call with and without a generic callee, a list literal of calls) are reached and
  pin nothing a build reads, so they are deleted. A sweep of the narrowed fixpoint against master's
  moves no program.
- **Three programs are what the two helpers carry:** `closures/hole-fn-list-returned-reread.vl`
  sections 4 and 5 (`m["k"] = deliver()`), `named/d15203_run_uncalled_record.vl` and
  `named/d15207_rec_ret.vl` (`return { fs: [inc0] }`, `inc0` never called). Without the pin each
  fails `ref valtype with no interned shape`.
- **The elaboration leaves all three open**, because a hole function in a returned literal that no
  call fixes has no instance. That is D15494's design question, an uncalled hole function's default
  instance, and is parked with it; it is not lane work.
- **`monoPinReturnedObj`'s 272 elaboration-only sites** are d3125 lambdas returning `{ q: 0 }`,
  already closed, where mono has nothing to retype.

**Node type, the pin tuple's readers** (2026-11-07, 23,103 programs, master `58198479`
fixpoint). `monoPinnedOperandTy` is a lookup by name into the instance's pin tuple (`pinnedTyIx`)
inside `monoMakeInstanceGo`'s body rewrite, and `monoPinBin` folds over its answer. Neither decides
a type, so both are class (c). Shadowed against `elabNodeTy` at the instance's own key, with a copy
read at its source (every site was the template's own node):

| cell | sites | programs |
|---|---|---|
| agree | 5,878 | 2,346 |
| agree on signature only | 78 | 43 |
| mono only | 108 | 35 |
| differ | 0 | 0 |

The 186 that do not agree, by pin and elaboration type:
- **The same type with holes (about 63).** For example, `((_) => _)[]` on both sides, which the
  shadow's closed filter dropped.
- **Pin `i32[]`, elaboration `((_) => _)[]` (35).** These are the hole-function list tests: the rep
  spelling of a function list against its identity type.
- **Pin nullable, elaboration narrowed (about 33).** For example, `string[] | null` against
  `string[]`. The elaboration answers the read's flow-narrowed type and the pin the argument's rep
  per arm. That is lane F's measurement that the pin is the argument's arm (a `Set<i32>` pin for a
  `Set<i32> | null` parameter), and #6585 already makes `monoPinHoleParam` ask the elaboration
  first. So comparing the tuple with the substituted parameter type disagrees by design, and it is
  not to be re-shadowed.
- **The elaboration has no answer (26).** The d492 and d511 number-union type-parameter cells, and
  generic value slots (D12212, D15032 to D15035).
- **The elaboration is wider or open (about 20).** These are D3178 (`never` against `null`), an
  overload's `V` against a record, and `(T) => T` against `(i32) => i32`.

**Node type, the reach trio** (2026-11-07, 19,338 programs, master `3e9ce417`). 831 decisions,
each against the walk type (`elabNodeTy` at the walk top), `elabNodeTyAt` and `elabSlotTyAt`. No
pair differs where both answer.

| helper | decisions (programs) | agree | mono only | elab only | neither |
|---|---|---|---|---|---|
| `monoPinnedReadTy`, `monoPinBin`'s `??` fold | 424 (324) | 47 | 0 | 370 | 7 |
| `monoPinnedAnnTyAt`, a `.map`/`.filter` receiver | 25 (8) | 23 | 2 | 0 | 0 |
| `monoPinnedAnnTyAt`, a stored call (`monoCloseRetFnTy`) | 2 (1) | 0 | 2 | 0 | 0 |
| `monoClosedObjLitTy`, a returned literal | 362 (144) | 0 | 2 | 272 | 88 |
| `monoClosedObjLitTy`, a `let` write | 18 (6) | 0 | 6 | 0 | 12 |

- **`monoPinnedReadTy` is switched and deleted.** `monoPinBin`'s fold asks a gate,
  `monoPinnedReadGate`: an element-and-field read chain ending at a pinned parameter, each element
  read over a list (D9915). The type comes from the walk type. **Mono's decline is a soundness gate,
  not a missing fact.** Taking the elaboration's answer where the gate declines folds `??` in 18
  more decisions. Six of those programs build other bytes with the same output, and
  `generics/type-param-write-cell-reads-at-pin.vl` traps the compiler (`tyAt` from `binNumWidth`):
  the folded read leaves a node with no type.
- **`monoPinnedAnnTyAt`.** A `.map`/`.filter` receiver takes the walk type first. Mono's walk answers
  only where the walk type is open: `closures/fn-list-mapped-to-functions.vl` and
  `closures/hole-fn-list-returned-reread.vl`, whose stored-call pair is the other caller.
- **`monoClosedObjLitTy` is not switched.** Its 8 answers are records holding functions, which the
  elaboration declines (node type, blocked above). They are `named/d15203_run_uncalled_record` and
  `named/d15207_rec_ret`, parked with D15494, and six writes in
  `closures/hole-fn-map-record-let-rewritten.vl` (D15534's fixture). Filling the 272 elab-only
  literals moves no byte.

**Walk type, what the helpers still derived** (2026-11-07, 19,338 programs, master `1b3572f1`).
Six of the family's eleven helpers were already gone. The other five, against the walk type
(`elabWalkNarrowedTy`, else `elabWalkTy`), 4,395 decisions:

| helper | decisions (programs) | reading |
|---|---|---|
| `monoLamPinRetAnn` | 1,260 (637) | every annotation it writes is the elaboration's (`monoLamElabRet`) |
| `monoHoleNodeTy` | 17 (9) | the elaboration first; its fallback, the recorded type, is open in all 17 |
| `monoLamCallTy` | 782 (164) | the elaboration first; its fallback, the recorded type, is open in all 782 |
| `monoNumOperandPinTy` | 1,577 (211) | the walk type agrees 1,484; both open 65; elab only 6; differ 22 |
| `monoPinArmSubst` | 759 (243) | the walk type agrees 546; elab only 203; differ 10 |

Every difference is a numeric literal operand. Mono typed the literal at its own `i32`, and the walk
type gives the width its context widens it to (`i64`, `f64`, `f32`). Taking the walk type alone
moves no byte over the 431 programs reaching the last two, so the widened width is the honest
answer: mono's `i32` was re-widened downstream. `monoNumOperandPinTy` and the two `??` rebuilds
(`monoPinCoalJoin`, `monoPinCoalListDefault`) now read the walk type (`monoClosedWalkTy`).
`monoPinArmSubst` and `monoDropUnboundMembers` are deleted, and a hole instance's `??` with a list
default whose left side has no closed walk type refuses loudly where the hole-binding substitution
was; no program reaches it. The first three helpers already read the elaboration and stay.

**Value returns, against `elabValueReturnsFrom`** (2026-11-07, 19,338 programs, master
`a0562c8b`). `monoFlowRetVals` was already gone, and `monoFlowConstCallArgs` is the flow rewrite's
own transformation around the leaf decision (class (c), cad lane).

| decision | decisions (programs) | reading |
|---|---|---|
| `monoFlowCallLeaf`: call `c` always returns generic `g` | 386 (101) | 53 answered, all 53 confirmed; 333 declined |
| `monoFlowAnnLits`: the literals an annotated binding's call initializer may return | 75 (28) | 16 confirmed; 59 are literal nodes, which the fact does not follow |
| `monoDeliverCallRets`' gate: the function returns a hole lambda | 802 (593) | 796 both no; 6 (3 programs) mono yes, fact no, the fact asked only of a returned literal node (corrected below) |

- **`monoFlowCallLeaf`: the fact confirms, it does not enumerate.** Asked of mono's answer it
  agrees every time, but it names no candidate `g`, so it cannot answer the 333 declines. The leaf
  stays the planner's decision, and its two consumers, the repoint and the rets share of
  `mfrInertValues`, are cad's.
- **`monoFlowAnnLits` is deleted.** Banking nothing moves no byte over the 29 programs it banked
  for, so its consumer (each banked literal coerced at the binding's annotation, under
  `monoInstanceExactRet`) is gone too, along with that flag.
- **`monoDeliverCallRets` stays, and its gate is walk state, not a missing fact.** Forced off, the
  gate lets `closures/error-hole-lambda-returned-into-bindings-of-two-types.vl` (D6522) build and
  print a wrong answer, and makes `closures/hole-lambda-returned-into-binding-of-another-type.vl`
  trap. Those two are its acceptance cells.

  The six rows above asked `elabValueReturnsFrom` only of a return operand that is itself a lambda
  literal. All six return a binding (`return h`). Re-asked of every hole lambda literal and every
  `let` holding one (master `a5ce5b99`, 23,103 programs), the counts are per gate call:

  | mono's gate | the fact | gate calls |
  |---|---|---|
  | yes | yes | 5 |
  | no | yes | 11 |
  | no | no | 879 |
  | yes | no | 0 |

  So the fact sees every return mono's gate sees. The 11 where only the fact says yes are each a
  second or later delivery. Mono's gate asks two things at once:
  - **(a) Does the function hand back a hole lambda?** That is static, and the fact answers it.
  - **(b) Has that lambda's delivery been instanced yet?** That is mono's own bookkeeping. It is
    keyed by the returned READ: `monoLamValueFe` first asks `identClosureFeOfRead`, and the first
    delivery re-points that read to the instance it builds. So the gate turns false after the first
    delivery, while the lambda's own slot (`fnStmtsPosOf`) stays a template.

  The recursion through calls is how (b) reaches each function's own returned read, so reading (a)
  from the fact would only re-derive the walk. The gate is class (c). Reading it from the fact alone
  refused two programs that run, and that measured D15536: the second-delivery check compared two
  function types by index, which the time-varying gate had hidden. It now compares with `tySame`.
- **`monoIfBoundRetAtPin`** reads `monoSlotPinNameTys`, the elaboration's deliveries, with no
  fallback: class (a).
