# The elaboration foresees the instances a late tag would need — design, 2026-11

The tag decision runs twice: in the check, and again after the elaboration (`fnTagRedecide`,
the late pass), which sees each instance's calls through a set (`elabMintFacts`). A late tag
is cheap only when every instance it needs was minted before `elabRun` returned. Late demands
must stay 0, so today two decisions that would need an unforeseen instance are made in the
check instead, conservatively. This design names those instances, says how the elaboration
mints them in time, and scopes a first slice.

## Which instances, and why the elaboration lacks them

### (A) A widened list holding a capturing lambda (#5898's veto)

`fnTagEtaAgain` vetoes a list's widening when the widened set is untagged and holds a lambda
that captures (`fnSetHasCapturingLambda`). The comment says why: such a list holds closures,
which need each member instanced at the list's signature.

Measured 2026-11-02 at master `281dd031` with the veto deleted:

- 0 of 5,456 `@run` files change rc or output, with the split plan on or off.
- 4 late demands in 2 files, every one a member of the list:
  `closures/hole-lambda-on-hole-fn-list-capturing-hole-param.vl` (`apply2`, `call2`, `run2`) and
  `closures/hole-fn-into-pushed-lambda-bound-by-every-call.vl` (`apply2`).

So the veto's whole job is late demands, and it costs nothing visible today. The demand mono makes
in `monoOpenCallAtElems`, for `const fs = [apply2]; fs.push((g) => g("z", k)); for f in fs { f(snd) }`,
is keyed `-1^14|?apply2.0=(string, i32) => i32`. That is the member with its hole parameter bound to
the closure signature it is called through: `apply2`'s own call `g("x", 2)` gives the parameters, and
the argument `snd` gives the result there.

Nothing in the elaboration mints that key. The call `f(snd)` goes through an untagged set, so no
arm instance is demanded (`elabArmEarly` serves a tagged set's arms). A demand at the call's argument
types mints nothing either: `snd`'s own type is an open hole function, so `elabCanon` declines it
(tried, 2026-11-02).

### (B) A rep instance that refuses a late tag (D15053)

`take(a) { let b = id; b = a; b("s"); b(7) }` with `take(id)`. While `{id}` is untagged,
`elabRowAtSetRep` builds `take` at the set's rep, so `a` is a closure there. Its body reads `a`
other than through calls, which marks the set partial (`mintSetPartialNote`). The late pass then
cannot tag `{id}`: `mintSetPartial` refuses. #5950 decides this case in the check instead,
for a function every reference to which is a direct call. A late tag would need `take` keyed at
the tagged set (the key `elabSetArgBind` gives a tagged one), built beside the rep instance, with
the partial facts kept per instance so that the rep instance's closure reads do not veto the tag.

## How the elaboration foresees them

**One class of instance, the candidate.** An instance minted for a decision the late pass may
take is marked as such, like the representation keys (`elabReprKeys`) and the D4551 guesses
(`elabGuessKeys`). It is built before `elabRun` returns, its diagnostics are not the program's,
and mono builds it only if a demand reaches it. The rule stays: late demands 0.

**(A)'s producer, the list signature.** For each call through an element read of a list (an index,
or a `for` variable over it) whose set is untagged and holds a capturing lambda, and for each named
member `m` of that set:

- For each parameter of `m` handed a function value at the call, the pin is the closed function
  type `(p1, …) => r`. The `p`s are the argument types `m`'s body calls that parameter with. The
  elaboration already records them per instance (`elabBundleSigNote`). `r` is the handed
  function's result at those argument types: its instance's result (`elabResultOf`), or the join
  of its set members' results.
- Other parameters take the call's argument types.
- `m` is enqueued at that binding, as a candidate, and settled.

There is no new reader. Mono's `monoOpenCallAtElems` demand then hits the key, and the veto in
`fnTagEtaAgain` is deleted.

**(B)'s producer, the tagged twin.** Where `elabRowAtSetRep` builds a callee at an untagged set's
rep, it also enqueues the twin keyed at the tagged set, as a candidate. Mint facts (`mintSetPartial`
and the parameter-set notes) are recorded per instance key, and the late pass reads the twin's
facts for a set it is deciding. If the late pass tags the set, the call's row is the twin and the
rep instance is unreached. If it does not, the twin is unreached. #5950's check-time rule stays
until this lands, and the twin then serves the functions it excludes (a function stored in a list,
or handed on as a value other than to a parameter only ever called, which D15017 follows).

**Status: its witness is decided in the check, and the twin is not built.** The stored spelling
(`take(id); const fs = [take]; fs[0](id)`) reads like D15017: a `const` list literal of named
functions, read only as the base of calls through an element, hands each such call's arguments to
its members' parameters (`ftReachHandSets`), and an argument of such a call is a hand to an
un-annotated parameter (`ftListCallHoleArg`), allowed only where no call reaching a member hands
that parameter a set outside the one decided (D15019's hazard). The twin stays the design for a
list the check cannot see through: one written, pushed onto, or read as a value.

## First slice: (A)

**Status: built.** `elabListMemberSigs` (emit_elab.vl) mints the members as candidates
(`elabCandKeys`, `elabDemandCandidate`), and the veto is deleted with the slot tables only it
read. It reads a call's argument types and a member's own calls of its parameter at their checked
types, not an instance's: a call in a generic or hole body whose types stay open there mints
nothing. Late demands are 0 over the whole late-demands population with the veto gone, so no
measured call needs the instanced reading yet.

A second producer uses the same class (D15062): a root call handing a list binding of an untagged
set, whose rep row takes the list at the stub, is enqueued once more with the list at the
signature the calls through its elements give (`elabListSigRow`, `elabListCallSig`), and a
function of that set handed beside it at that signature too. It runs once every instance is in,
since the members' results are read from their instances.

**Build.**

1. `elabListMemberSigs`, run at the end of `elabRun` before `elabRunDone`. It applies (A)'s
   producer to calls at the root and inside instances, using the instance's own types for a call
   in an instanced body.
2. Delete the capturing-lambda veto in `fnTagEtaAgain`, and with it `fnSetHasCapturingLambda` if
   nothing else reads it.

**Acceptance.**

- Late demands are 0 with the veto deleted. The 2 files above are the measured population.
- Those 2 files keep their output, with the split plan on and off.
- All `@run` files keep rc and output with the plan on and off, and the byte-diff of
  `tests/**/*.vl` moves only files whose output is unchanged.
- `regress.vl` loses 0 runs, on and off.
- A fixture holding two shapes: a capturing lambda pushed onto a list of hole functions called
  with a hole function at a signature the member's body fixes, and its index-write twin.

**Out of scope.** (B) is slice 2, after #5950 lands, since it changes how mint facts are keyed. A
capturing lambda called at two signatures through one list element is closure-at-delivery's
open question 1 (γ's gaps (b), (c)) and stays there.
