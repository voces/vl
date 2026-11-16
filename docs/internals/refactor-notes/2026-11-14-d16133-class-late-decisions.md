# D16133's class: a decision made after its consumer — design proposal, 2026-11-14

**Ruled 2026-11-14: (ii), staged; (iii) is D16133's fallback.**

A design note for the coordinator's ruling. It makes no compiler change. It covers D16133,
D16134, D16137 and D16077(b), and proposes one close for all four. Measured against master
`114c78e48`.

## The pass order these rows cross

1. **Check body walk** (`checkProgramPass`). Types the generic program once, node by node.
2. **Check post-pass** (`check_program.vl`, `recKeptConflicts`). `recStoresAgree` decides each
   container's **build**, the storage row its stores agree on (`recBuildTable()`).
3. **Check tag decision** (`fnTagDecide`, from `checkProgramResumed`). Decides which function
   sets are **tagged**, that is lowered as ids. The check also banks its hole rows
   (`?run.0 = Fn#<node>`).
4. **Elaboration rounds** (`elabPrepare`). `elabPrepareRun`, then the late decision
   `fnTagRedecide`, repeated while the decision grows, up to `ELAB_TAG_ROUNDS` = 16. The late
   decision can add a set. It can also drop one the check tagged: the dropped set goes into
   `ftLateRefused` and stays untagged (D15484).
5. **Mono and emit.** These read: `recArgBuiltTyIn` reads builds, and `elabCallSetIn` reads
   per-instance sets.

## 1. The common shape

| row | the late decision (what, where) | the early consumer (what, where) | why the consumer cannot wait |
| --- | --- | --- | --- |
| D16134 | the list's build `J` (`recStoresAgree`, step 2) | the `filter` lambda's parameter type (`memberCallMapFilterTy` → `recordCbExpected`, step 1) | the lambda is typed once, from the template. Nothing instances it: `monoPinLamAtDelivery` instances only a body that calls a generic. Both build tables are empty when it is typed. |
| D16137 | the parameter's tagged set `S` (`fnTagRedecide`, step 4, from mint facts) | the callee's written literal `{ f: half }` and the tag scan over it (`ftScan`, steps 3–4) | `ftScan` reads template types, where the alias `v` is a hole. So the write is not seen as a store into a holder of `S`, and the literal keeps its own one-member set. In the instance, `v.f(4)` then goes through a set no caller binds, and `ftPlan`'s late guard declines `S` (`mintSetPartial`, `check_fn_tag.vl`). |
| D16077(b) | the elaboration closes a hole-bound lambda's type at its returned generic's delivery (`elabLamHoleTysClose`, prototype, step 4) | the check's hole row `?run.0 = Fn#<node>`, and the check's tag decision keying that lambda as a set member (step 3) | the call site lowers the second lambda as a set id (`i32.const <node>`), while `run2`'s instance takes a closure: invalid wasm. |
| D16133 | the same as D16077(b); D16133 is the reconciliation item for it | the same | the same |

In every row, the consumer is computed from the generic program, once, at check. The decision
is a fact that exists only after the whole body is seen (a build) or only per instance (an
elaborated type or set).

The late facts are **storage and identity** facts: which row a record is stored at, whether a
function value is an id or a closure. None is a type a user could spell. The prototype below
shows why that matters.

## 2. Closes

### (i) Order the decision before its consumer

**Sketch.** Make the check see the late fact. For a build, run the check's body walk again once
the post-pass has decided the builds. `recBuildLast` survives `checkRestart`, so a second
`checkProgramPass` reads the first pass's builds. For a tag or an instance fact this is
impossible: those facts need the instances, and the instances need the check.

**Prototype** (branch `i-d16134-repass-proto`, reference only, not for merge). It takes
D16134's WIP (`cbElemAtBuild`, `recCbParamAtBuild`) and changes `recBuiltCallbackRefuse` to defer
its first refusal and ask `checkProgramResumed` for one `checkProgramAgain`.
- **The mechanics work.** On the second pass the callback is typed at `J`.
- **It then fails at the wrong level.** Typing the callback `(y: J) => …` is a delivery of
  `{f: null}` elements into a `J` parameter, and the checker refuses it: "a {f: null} cannot be
  delivered as J here … a wider value stored through the J would sit in the {f: null} it came
  from". That refusal is right. A build is a storage choice, and at the type level it is a
  widening delivery through a shared record.
- **Fuel:** check guest fuel on the witness rises from 2,045,086 to 3,308,036 (+62%), the cost of
  one more full pass. A program that never triggers the gate pays nothing.

| closes | adds a pass | step 2 |
| --- | --- | --- |
| none as built. D16134 only with a check-level notion of "same type, other storage", which is a type-system change. Never D16133, D16137 or D16077(b). | yes, one gated check pass | neutral |

### (ii) Key the consumer's instance by the late fact, in the elaboration

**Sketch.** The elaboration runs after the post-pass, and its rounds already re-run it whenever
the late tag decision changes. Each consumer becomes an elaboration demand, or an elaboration
fact the late decision reads. The check keeps typing the template as today. Mono gains no
decision.

- **D16134.** When a lambda (or a named hole function) is the callback of `map`, `filter` or
  `forEach` on a list whose build differs from its element type, the elaboration demands the
  callback's instance with the parameter at the build `J` (`elabEnqueueAtParams` already instances
  a lambda at given parameter types). The call lowers to that instance. The check's refusal
  (`recBuiltCallbackRefuse`) narrows to callbacks the elaboration cannot instance: a closure
  value, or an annotated parameter of another type.
  - Lands in: `emit_elab.vl` (the demand, where a callback argument is visited) and
    `check_fit_rules.vl` (the refusal narrowed).
  - This takes over the job mono's `recArgBuiltTyIn` does for a hole call's argument, giving one
    producer instead of a mono reader for one case and a refusal for the other.
- **D16137.** The elaboration notes a **store fact**: instance `k` writes record literal `L` into a
  binding whose instance type holds set `S` (`elabNodeTy(lhs, k)`), noted as
  `mintStoreNote(L, S)` beside `mintFwdFieldSetNote`. The late decision treats `L`'s function
  fields as leaves of `S`, as `ftScan`'s store arm does for a check-typed holder (`ftDstTakes`).
  The alias walk (`elabConstParamAlias`) then reads through a `let` whose every write carries such
  a fact. With the calls through `v` bound, `mintSetPartial` no longer fires.
  - `L` is a template node, and its tag stamp (`repStampHeldRead`) is per node. Instances that
    disagree on `S` are refused loudly until stamps are per instance.
  - Lands in: `emit_elab.vl`, `check_mint.vl` and `check_fn_tag.vl`'s late loop.
- **D16133 / D16077(b).** The elaboration notes a **closed hole-lambda fact** wherever it closes a
  hole-bound lambda's type at an instance. It sits beside `mintCloDeliveryNote`, which already
  records a delivery to a closed function type. The late decision then refutes the tag of any set
  whose member is such a lambda at that call site. The existing drop path (`ftLateRefused`,
  `grew == 2`) runs another round, and the call site builds the closure the instance takes. D16077
  records two more pieces, kept here: defer banking the hole row until its delivery is walked,
  and key the closure global by the closed type.
  - Lands in: `emit_elab.vl` (`elabLamHoleTysClose` and the note) and `check_fn_tag.vl` (a refute
    arm in the late loop).

| closes | adds a pass | step 2 |
| --- | --- | --- |
| all four | no: D16134 adds instances; D16137 and D16133 ride the existing elaboration rounds (a dropped set costs at most one more round, inside the bound of 16) | yes: the elaboration owns each new instance, mono reads only, and one mono reader (`recArgBuiltTyIn`) can retire |

**Fuel: not measured.** It is not cheap to prototype within the time box. The expected cost is
one extra elaboration round for a program whose tag decision is refuted, and nothing for one
that is not. `scripts/plumb-shape-cost.vl` and `self-compile-time.sh` are the gates for it.

### (iii) The check abstains where the elaboration decides

**Sketch.** One producer per fact (§0 of `architecture-target-2026-10.md`). The check's tag
decision does not decide a set with a member whose identity the elaboration may change, such as
a hole-bound lambda with a hole result. The late decision is that set's only producer. Nothing
is tagged and then refuted, so no drop round runs.
- Cost: the check's own readers of the decision see "undecided" for such a set and must defer
  too. Those readers are `fnTagEtaAgain`, `recordClosedHoles` and `callBindAdoptReps`.
- Lands in: `check_fn_tag.vl` (an abstain rule) and those three readers.

| closes | adds a pass | step 2 |
| --- | --- | --- |
| D16133 and D16077(b), at the source. D16137's literal gets its one late decision. Not D16134, which is a build, not a tag. | no | yes, and it removes a second producer |

## 3. Recommendation

**Close (ii), staged, with (iii) as the form D16133 takes if its refute round churns.**

1. **D16134 first.** It is the smallest and independent of the tag machinery. It proves the
   pattern: the elaboration keys a callback's instance by a late storage fact, and the check's
   refusal narrows to what the elaboration cannot instance.
2. **D16137 next.** Store facts ride the existing rounds. The new risk is per-node stamps, and
   instances that disagree are refused loudly.
3. **D16133 / D16077(b) last.** It needs a refute arm (ii) or an abstain rule (iii) plus the hole
   row deferral D16077 records. I would build (ii)'s refute arm first, because the drop path is
   already proven (D15484). I would move to (iii) only if refuting adds rounds the scaling guards
   (`tests/vl_scaling_shape_test.ts`) see.

**Reject (i) as the general close.** Builds are the wrong level for the type checker (the
prototype's refusal shows it), and instance facts cannot be ordered before the check that makes
the instances. The gated re-pass costs +62% on a triggering program. It stays on record as a
fallback, not a plan.
