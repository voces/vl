# Open owner rulings: recommended answers, 2026-11-25

This note proposes an answer to each open owner question, for the owner to rule on. Nothing here
is decided, and DECISIONS.md is unchanged. Each entry gives the question, a recommendation and the
reason, citing the source that sets out the options. Where a lane already recommended an answer,
this note says whether it agrees.

The test applied throughout is the standing bar: reject only what the design forbids, and keep one
rule per question. Among options that pass it, pick the one a reader of the program, human or
LLM, would predict without knowing the compiler.

## Initialization order: INIT Q1–Q11

Source: `docs/internals/init-order-design-2026-11.md` §5. The owner already ruled the goal: a read
before the initializer is a compile error (DECISIONS, "Initialization order", 2026-09-26). These
questions fix its edges. The lane's recommendation is kept in every case.

**Q1. Is a possibly-uninitialized read an error or a warning?** Recommend **(a) always an error**.
A rule that depends on whether the compiler could prove a read reachable is a precision fact, and
a reader cannot predict it. The goal ruling asks for an error, and the cost is 5 corpus fixtures
that keep a dead call on purpose. (a) also deletes the runtime guard, except under Q4 (b).

**Q2. Does a write inside a called function initialize a no-initializer module `let`?** Recommend
**(a) no**. The checker already refuses a top-level `print(n)` after `fill()`, so (a) makes the
function-hop spelling agree with a rule in force. (b) would make acceptance depend on another
function's body. The fix a user writes, `const n = fill()`, is the idiomatic one. It costs 1
corpus program, which traps today.

**Q3. Must a global that an entry-module export touches be initialized when the start function
ends?** Recommend **(a) yes, a compile error**. It follows from Q2 (a). It also puts the host
protocol in the type (`let state: Config | null = null`), where TypeScript's strict mode puts it.
No corpus program has this shape.

**Q4. What happens when the host calls an export while the top level is still running?**
Recommend **(a)**: every extern call in top-level code counts as a call to every entry-module
export. It is static and sound, it affects no corpus program, and reordering can still rescue the
binding. (b), a one-load check per export, is the fallback if real host bindings find (a) too
coarse. (c) is unsound on Wasmtime.

**Q5. Does the analysis fold literal conditions?** Recommend **(a) no**. Definite assignment
already refuses `let n: i32; if true { n = 1 }; print(n)`. Folding in one analysis and not the
other would give two answers to one question.

**Q6. When is a closure that captures a no-initializer local legal?** Recommend **(b): check at
run points**. Direct calls are checked where they happen, and an escape is checked at the escape.
It is the same rule the module globals follow, it is local to one function body, and it keeps
`definite-assign-nested-fn-capture-ok.vl`, which the corpus pins as sound. Swift's (a) is simpler
but refuses that sound program.

**Q7. Does reordering only rescue, or always use dependency order?** Recommend **(a) rescue
only**. A program that is valid in source order runs in source order, so a reader's order is the
run order except where it would have been an error. D1510 already makes source order the rule
for evaluation.

**Q8. May a moved initializer that can trap or loop move above a statement with effects?**
Recommend **(a) yes**. This is D1510's rule that a trap is not an effect. The source-order program
is rejected under Q1 (a), so there is no prior behaviour to preserve. (b) would refuse any moved
initializer that indexes, divides or uses `as!`.

**Q9. May reordering rescue a write or mutation before the declaration?** Recommend **(a) no**.
This moves D2654's ruling to compile time. Moving the declaration up would make the printed value
contradict what the declaration says where it is written. All 10 affected fixtures trap today.

**Q10. Does the compiler say when it moved an initializer?** Recommend **(a) silent, with the
place shown on hover**. A move only ever turns an error into the program the author evidently
meant (Q7 (a)). A hint on every such declaration would be noise in exactly the programs that work.

**Q11. Does "for locals" ask for block-wide local declarations?** Recommend **(a) no**. The local
half of the ruling is Q6. Block-wide local scope is a scope change with its own questions, such as
shadowing, and deserves its own ruling.

## D16706: does nested width reach a list's element?

**Question.** The 2026-11-16 ruling (b) takes an existing record at its own type "at any depth"
(D3431, extending D4054). Does that include the element of a list field, as in
`const u: { pets: { legs: i32 }[] } = sv` where `sv.pets` holds `{ legs, purr }` records?
Source: `docs/internals/inventory/D16706.md`.

**Recommendation: yes.** Take the record at its own type, list elements included, under the same
contract.

**Reason.** The ruling's argument holds unchanged one container down. Every name for the record
has the record's own type, so no narrow handle can write what the storage cannot hold. A
`u.pets.push({ legs: 3 })` is refused for the same reason D3431 refuses `u.pet = { legs: 3 }`. The
refusal "a container never widens implicitly" exists to stop a container from being re-typed
narrower and then fed narrower elements. Taking the container at its own type does not re-type it,
so the refusal's reason does not apply. Stopping at lists would make "at any depth" mean "at any
record depth", a mechanism boundary the reader cannot see. The ablation shows the list is the only
ingredient. Map values follow the same rule. A `readonly` view keeps its refusal until D4050's view
rep lands, exactly as at the top level.

## D4262 and D4081: narrowing `is B` over a value laid out as a different record

**Question.** When `is B` passes on a value stored at another record layout `A`, should the then
arm narrow to `B` for delivery, and by what mechanism? There are two cases. In D4262 the arms
overlap: `A = { v: i32 | string }`, `B = { v: string }`. In D4081, `B` narrows a field to a
string-literal set. Source: the two rows.

**Recommendation: narrow, through D4054's view rep, never through a copy.** Until the view rep
lands:
- narrow the field reads (`b.k`, `u.v`) at once, as both rows' ablations already show working;
- keep a whole-value delivery refusal that names the view rep as the missing piece.

**Reason.** The owner already ruled the surface. D4054's option B says "`is` may narrow a view
back to its concrete record", so narrowing is the intended language, and today's refusal is a
capability gap, not a contract. A converting copy would deliver a fresh `B`, so a write through
the narrowed name would not reach the original. That is the aliasing split that D4054's
specialise-don't-copy rule rejected. Field-read narrowing needs no new rep, since the bytes
already hold the narrowed value, and it covers the common use (`if r is B { use(r.k) }`).

## D16843's `call1`: does a callee's internal call fix a generic value's type for its caller?

**Question.** `same<T>` is handed into `mid<F>(a: F)`, which passes `a` to
`call1<G>(g: G) { return g(3) }` and then calls `a("x")` itself. Today check refuses `a("x")`:
"expected string, got i32". Is that refusal the language, or a gap?
Source: `docs/internals/inventory/D16843.md`, and DECISIONS' D16843 ruling of 2026-11-17.

**Recommendation: a gap. The value stays polymorphic for the caller.** `call1`'s call at `i32` and
`mid`'s call at `string` are two independent instantiations of `same`.

**Reason.** The revised D16843 ruling already says a generic function value handed back keeps its
polymorphism. `pass(a)(3)` and `wrap(a)()(3)` run next to `a("x")` (#8932). Treating the same
value differently because a callee happened to call it is a rule no reader would predict, and it
names a mechanism (where mono pins the parameter), not a property of the program. TypeScript
infers `G` from the argument's own generic signature and does not narrow it for the caller.
Mechanically, the set stays tagged and each call dispatches to the member's instance at its own
types, the same mechanism #8932 extended to hand-backs. The cost is an instance per distinct use,
which is mono's ordinary cost. If the owner prefers to keep the refusal, its message should name
the contract ("a generic function value called inside a callee is used at that type"), so that
D16843's grading list records it as owed rather than as a gap.

## Struct keys for `Map` and `Set`: K1–K7

Source: `docs/internals/a15-2-struct-keys-design.md`, which numbers them Q1–Q7. K1–K3 were ruled on
2026-09-01 (`docs/identity-design.md` §0 decision 5) and are up for reconfirmation. K4–K7 are open.
The note's recommendation is kept in every case.

**K1. Which keys are eligible?** Recommend **(a) every type `==` accepts**, which reconfirms the
ruling. One relation: a key is found exactly when it is `==` to a stored key. A staged rollout is
a build-order choice, and today's refusal (D16688's cascade included) is clause 2.

**K2. What does "the same key" mean for floats?** Recommend **(a) it means `==`**, which reconfirms
the ruling. `-0.0` finds `0.0`, and a NaN key is inserted and never found, as in Go. JavaScript's
Map makes NaN equal to itself, but doing that only for keys would create a second equality,
against D46's single `==`.

**K3. What happens when a key is mutated after insertion?** Recommend **(a) the entry is lost**,
which reconfirms the ruling. It is Go's and Java's behaviour, there is no hidden copy, and
`m.keys()` yields the objects inserted. The `Map` header states the cost. (b), a snapshot copy,
is the only coherent alternative, at an allocation per insert.

**K4. A key value wider than `K`.** Recommend **(a) one storage, one layout**. It is D4054's
contract applied to one more storage, so it needs no new sentence. (b) and (c) would silently
merge distinct values into one key.

**K5. Can keys be compared or hashed by the user?** Recommend **(a) no**. A user hash or comparator
reintroduces the custom `==` that D46 refused. Identity keys belong in `IdentityMap`, and a coarser
key is built as a value.

**K6. Iteration order for struct keys.** Recommend **(a) insertion order**, as for every other key
type. Otherwise output would depend on a hash no program can see.

**K7. Union and nullable keys.** Recommend **(a) follow `==`**. Values in different arms are
different keys, `null` is one entry, and same-shape aliases share keys. Refusing types that `==`
already accepts would be a clause-2 refusal by choice.
