# The elaboration readers' contracts

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Contract: outside every instance, `elabNodeTyAt` answers -1 for a non-call.** That -1 means the
elaboration has no type of its own for the node, and every caller composes its own narrowing with
it. A fallback to the checker's closed type (#6556, closed) broke four `runs` cells:
- D3786;
- `functions/tail-assign-nullable-i64-if`;
- `expressions/assign-value-keeps-evaluation-order`;
- `literals/hex-width-through-assignment-value`.

The cause is in `readAtomAgreed`, which compares `asgReReadPinAt`'s narrowed `i64` with the answer
and refuses on a mismatch. The fallback answered with the cell's declared `i64 | null`.

**Hole-lambda holders, one fact.** `elabSlotTys`, written by `elabSlotFacts` and
`elabSlotInstFacts`, is the closed type of a holder whose function leaves stay open. Fn#d's
adopt-init switch and lane F's `.map` callback parameter both read it. It is a type only; the rep
comes from the tag layer. Three steps:
- (a) `elabNodeTy` answers it for the binding and for an un-narrowed read of the binding;
- (b) `elabSlotClose` gains the sources it declines today, at 42 of the 47 acted adopt decisions
  over the union population;
- (c) a hole parameter is closed per instance from its callers' arguments, and declines where two
  callers at one key pass different types.

**Identity and signature are two facts.** `elabTyClosed` accepts a function type that a known set
closes by identity (Fn#d), while its signature still holds its members' own holes, e.g.
`((_) => _)[]`. `elabNodeTy` answers that identity-closed type, and rep readers dispatch on its
set. `elabSlotTyAt` answers the closed signature (`((i32) => i32)[]`). Answering the signature from
`elabNodeTy` in place of the identity drops the set. #6566 (closed) tried it and broke 16 oracle
fixtures plus D7381, D9600 and D9660. A reader that needs the signature asks `elabSlotTyAt`. A
shadow that sees identity on one side and a signature on the other has found two facts, not a
disagreement.

**A bare function binding closes only when called directly and holding only hole functions.**
`checkCallNode` notes a call through a bare binding (`fnSlotCallNote` at path `[]`).
`elabSlotCloseWhole` then closes a function binding, or a nullable holder, from its whole-binding
writes (`cwBindingWrittenValues`), under two rules:
- **Called directly.** A function binding that no call reads directly is handed on or uncalled, and
  stays open. Closing it at one instance is wrong, and the adopt-init switch refuses it. Regression
  cells:
  - `closures/hole-fn-if-to-hole-param.vl`'s `const x`, never called;
  - D10384 and D14400, a re-pointed `let` of generic `id` handed through `runAll` at two types.
- **Only hole functions.** Arguments stand in for parameters only for a hole function, one with no
  type parameter and no annotated parameter. A declared or generic signature is the named-generic
  fact. Regression cell: D9850. There `v` holds `g(f: ((x: T) => T) | null, x: T)`, and the slot-call
  tuple built `((i32) => i32, i32) => i32`, dropping the declared `| null`.

**A binding's whole-write type has one reader: `elabBindingWholeTy(d, t, k)`.** It runs before the
two closers. It folds `elabWrittenValueTy(d, x, k)` over every non-null value written to the
binding. The answers must agree and share a constructor with the binding's own type, and a nullable
binding wraps the answer. `elabWrittenValueTy` is where each value-level source goes. The first is a
read (`slotOfRead`) of a different holder with a closed `elabSlotTyAtKey` fact at the same instance,
the common case being `const f = m.get("k")` out of a closed map. A read of an open holder
declines, which leaves generic functions stored in maps to D15494. A delivered bundle (reach) is the
next source, so the elaboration gets no second composer for the same binding.

**A binding's function set has one reader too: `elabBindingFnSet(d)`.** It is the set-valued twin of
`elabBindingWholeTy`. The checker's `elabFnSetTy` is filled only from reads, and a `let`'s storage
type is its initialiser read's type, so no write ever joins a binding's set (D4307). The fold
takes every value written to the binding and unions their sets, and an `if` value contributes its
arms' joined set. It answers `[]` ("any") as soon as one value carries no set: a closed lambda, a
parameter, a call result. **A value's own identity narrows its set.** Structurally equal values
share a type index and therefore a set, so every `(_) => void` hole lambda in a program shares one.
The fold therefore narrows a name or a function literal to the one function it is (an instance's
clone read as its source). Three written values are read through to what they stand for:
- a loop's or labelled block's value carrier (`$lv`), minted after the write index, is written
  the loop's exits (`lvExitLoops`);
- the checker's adapter lambda (D4892) is the function it adapts;
- a name of a declared generic is that function, even where its read was minted without a set.

An instance-clone binding is read at its source binding (#6633). The consumer is the written-let
gate (`monoWrittenGenLetFrame`).

**The second source, built from bundles: `elabWrittenBuiltTy`** (2026-11-07). It covers four
kinds of value:
- a call, through `elabCallBundleRet`, which answers with the bundle record the call's returned
  parameter (`elabRetParamOf`) is delivered as (`elabCallArgRep`, `elabDeliveredBundleSigs`), or,
  where the callee hands back no parameter, with the values it returns, built the same way at the
  call's own instance;
- a record of its fields' answers, each other field at its closed checked type;
- a list of its elements' agreed answer;
- a field or list element of such a value, or an un-annotated `let` written once.

The reach rows holding the bundles are written by `elabReachRows`, after `elabRun`'s `elabSlotFacts`.
So `elabSlotBundleFacts` re-runs the same reader there, for program-level holders still without a
fact, and never overwrites one. That timing is why the binding reader runs twice. The bundle source
cannot answer in `elabSlotFacts`, so folding the two runs into one loses all 15.

Over master `fd7ef721`'s 21 `monoBindingAdoptInit` decisions holding a bundle record, all at program
level in seven programs (the five `closures/bundle-record-*.vl` tests, D15323 and D15324),
`elabNodeTy` agrees at 15, differs at none, and leaves to mono six reads of an un-annotated `Map()`
whose value comes from its writes, which wait for lane F's map-value facts. The fifteenth is
`{ f: gen("s", 3), n: 3 }`, where the generic hands back a `let` rather than a parameter.

A holder inside an instance written from a bundle still declines, because the late pass is
program-level only, so 15 of 21 does not mean that bundles close at every instance.

A captured cell (`let d = c` re-written by a lambda) gets no fact this way yet. Its written lambdas
are nested and capture, so `elabHeldAtArgs` declines, and `elabHeldFnTy` returns that decline
instead of trying the instance enumeration.
