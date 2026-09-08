# VL — adversarial architecture review

Scope: `compiler/*.vl` (~160K lines of VL — `typecheck.vl` 36.4K, `emit_classify.vl`
35.3K, `wasmEmit.vl` 23.9K, `emit_mono.vl` 5.3K), `DECISIONS.md` (5,960 lines),
`ROADMAP.md` (3,404 lines), `docs/internals/rep-descriptor-campaign.md`,
`simd-design.md`, `memory-gc-design.md`, `docs/error-handling-design.md`, and direct
`dist/vl` spot checks. Every claim below is either quoted from the tree or was run.

No praise below is free; where I say a decision is defensible I say why, and where I
say it will bankrupt the project I name the bill and who it comes due for.

---

## THE ONE DECISION MOST LIKELY TO CAUSE TECHNICAL BANKRUPTCY

**There is no separate compilation unit, ever, at any grain — the compiler
whole-program-merges every `.vl` file into one arena and monomorphizes generics
globally over it, and that arena is a single shared, in-place-mutated data
structure that every pass (parse → check → monomorphize → emit) reads and writes
directly, with no intermediate immutable IR between them.**

That is one decision wearing three names in the docs (`modules-design.md`'s
"whole-program → one wasm module", the monomorphizer's node-sharing scheme, and the
519-site "rep classifier" sprawl `rep-descriptor-campaign.md` exists to reconcile),
and it is the thing everything else in this review traces back to. Full argument in
Finding 1 and Finding 3; Finding 2 is the same disease at a different seam. It is
the hardest of the five to reverse, because `modules-design.md` explicitly rejects
wasm-linking and separate `.wasm` distribution as complexity "VL does not need" —
a bet that has not yet been tested, because **VL has no external package ecosystem
to generate the workload that would refute it.** The bet is being placed before the
data that would validate or kill it exists.

---

## Finding 1 (severity: critical) — Whole-program compilation + unbounded
monomorphization, with no separate-compilation escape hatch

**The decision.** `docs/internals/modules-design.md` §2.3: every `.vl` file
resolved from the entry module is merged into one AST, type-checked together, and
monomorphized "across the whole program" into **one** wasm module. Wasm linking
(the component model, multiple modules with a cross-module ABI) is rejected by
name: *"real complexity whose payoff (incremental compile, separate distribution
of `.wasm` units) VL does not need."* The mitigation offered for the admitted cost
— *"Whole-program means no incremental compile and recompiling everything on any
change"* — is a **hypothetical**: *"If incremental builds ever matter, a front-end
cache keyed by file hash is additive."* Nothing like it exists. It would only cache
parsing anyway, not checking, monomorphization, or emission — the three phases
that actually dominate self-compile time (see the `self-compile-time.sh` tripwire
and the D1090/D1514 shape-regression history in `CLAUDE.md`).

**Verified.** `identity<T>(x: T): T` called at four call sites (`i32`, `f64`,
struct/string, boolean) compiles to four distinct wasm functions
(`$identity`, `$identity$1`, `$identity$2`, `$identity$3`), each a full copy of the
body:

```
(func $identity (type $3) (param $0 i32) (result i32) (return (local.get $0)))
(func $identity$1 (type $4) (param $0 f64) (result f64) (return (local.get $0)))
(func $identity$2 (type $5) (param $0 (ref $2)) (result (ref $2)) (return (local.get $0)))
(func $identity$3 (type $6) (param $0 i32) (result i32) (return (local.get $0)))
```

That is textbook monomorphization, and it is *fine* at four call sites. It is not
fine as a *load-bearing whole-program strategy with no dictionary-passing fallback
and no way to ship a precompiled library*, because:

**The scaling failure it invites.** Two multiplicative axes, neither bounded:
1. **Program size.** No incremental compile means build time is a function of the
   *entire* transitive closure of imports, on every change, forever — not of what
   changed. This is the exact failure mode that made Swift's Whole Module
   Optimization and C++ template-heavy unity builds notorious at scale, and VL has
   chosen it deliberately, pre-emptively, before it has a corpus of real programs
   large enough to have felt it.
2. **Instantiation count.** Every distinct `(generic, concrete-type-tuple)` pair
   anywhere in the whole program mints a new function body. There is no
   `Vec<T>`-style dictionary tier to fall back to when the instantiation count
   explodes (a generic container of generics, a deeply generic std, a large
   dependency graph). Binary size is explicitly a first-class metric here
   (`scripts/seed-size.vl`, the ±3% ratchet in `CLAUDE.md`) — and the mechanism
   that is supposed to protect it (whole-program monomorphization) is the one with
   no upper bound.

**And this is not hypothetical stress that hasn't arrived — it has already arrived
inside the compiler itself**, which is the largest VL program that exists (~160K
lines) and is whole-program-compiled on every commit. `CLAUDE.md` documents, as
*already-shipped* defenses against *already-observed* blowups: an
`arena-scan-outside-pass` lint with a 132-item ratchet: a scaling-shape test suite
comparing CPU ratios across ten same-work-different-shape program pairs: a
`self-compile-time.sh` tripwire at 4× a committed CPU-second baseline; and a
concrete incident (D1090) where an ungated whole-arena scan made the **next**
bootstrap generation take 321s against a 300s timeout — from a change that looked
fine one level up. That is a team already firefighting whole-program-compile
non-linearity at "tens of files." The ecosystem hasn't shown up yet.

**Root cause.** The type system's most powerful feature (generics) and the
distribution model (one binary, no packages yet) were designed against each other
without a plan for what happens when they meet a real dependency graph. Full
monomorphization is the right choice *for a language that also has separate
compilation* (Rust does this — generic code is duplicated per crate, but crates
compile and cache independently, and `rustc`'s incremental engine exists
specifically because someone paid this bill already). VL took monomorphization's
downside (unbounded code generation) without taking the one thing that makes it
survivable at scale (compilation units smaller than "the whole program").

**The alternative I would have built.** Either (a) a **uniform-representation
fallback tier**: every generic gets a fully monomorphized fast path for value
types that fit in a wasm primitive, and falls back to a boxed/dictionary-passed
`(ref $anyshape)` representation with vtable-style dispatch once instantiation
count crosses a budget — Swift's protocol-witness-table model is the precedent,
and it is exactly the tradeoff the collections-design doc dismisses in one
sentence as "the Java tax" without pricing the alternative it is rejecting against
the alternative it is accepting; or (b) genuine **separate compilation units** with
generics instantiated per-consuming-module (Rust's actual cross-crate scheme,
which the doc calls out and rejects as "extra machinery" without weighing it
against "unbounded whole-program recompilation forever"). Either is real work.
Neither is optional at the scale a "language for the next decade" implies, and the
doc's own justification — *"programs are whole before they run"* — is a
description of today's demo-sized programs, not an argument about programs in
general.

---

## Finding 2 (severity: critical) — The rep model: five independent producers of
one fact, reconciled by a runtime A/B oracle instead of by construction

**The decision.** "What representation does this value have?" is answered
independently at **519 call sites** across **~2,949 top-level functions**
(`rep-classifier-census.py`'s own count, quoted verbatim from the doc), by **five
different producers** that read the arena, a name, a spelling, a table, or the
calling frame — with **thirty-three to forty-six-way overlaps** between pairs of
producers computing the *same* fact from *different* inputs. The document that
exists to fix this (`docs/internals/rep-descriptor-campaign.md`, 2,068 lines,
owner-approved 2026-09-06) does not propose a type-level fix. It proposes an
**agreement oracle**: every converted call site computes *both* the old ladder's
answer and the new descriptor's answer, at runtime, over the corpus, and the
conversion is only accepted once it reports "0 CONTRADICT."

**This is the tell.** A codebase does not need a live runtime oracle armed by an
environment variable, running "beside `unionRegistryABSweep()` in `emitProgram`,"
just to ask whether two functions agree about a type's shape — *unless the type
doesn't actually carry that fact anywhere, and every consumer is re-deriving it
from ambient context.* The doc says as much directly: WasmGC heap types are
**nominal**; VL's type system is **structural**; "the emitter's hardest machinery
exists to make wasm's nominal heap types carry VL's structural types"
(`memory-gc-design.md` §1.1). That single sentence is the root cause of both this
finding and Finding 3. Canon (`canonEmitTypeNames`, `repCanonKey`, `repCanonId`)
is the compiler's private, ad hoc answer to "what wasm nominal type does this
structural VL type collapse to" — and because it was built as a rewrite pass over
the *same* mutable AST/arena that every later pass also reads, rather than as a
value produced once and carried on every node, forty-plus call sites each grew
their own partial reimplementation of "ask canon a question," and they disagree
at the margins (D611's twin-heap-type bug — two structurally-identical types
minting two heap types — is exactly this).

**The scaling failure it invites.** Every new emitter feature is a new place that
can silently disagree with the other 518. The campaign's own measurement proves
this isn't paranoia: converting just the field-code ladder found **eight
`tests/cases` modules going `rc=0 → rc=1`** from a change that "reads like a
strict improvement" (widening the descriptor's domain to cover more than the
ladder did). And the campaign is explicit that **byte-identity does not validate
a domain-removing conversion** — deleting nine "dead" rungs of `vtKindOfType`'s
ladder was byte-identical on the *existing* corpus and simultaneously took the
oracle's CONTRADICT count from 2,963 to **204,539**, because the corpus simply
contains no program shaped to exercise those rungs. That is: **the safety net
here is "no test currently disproves this," which is not the same claim as
"this is correct,"** and the doc says so in its own words ("Byte identity proves
nothing breaks today and says nothing about the domain").

**Root cause.** No canonical, materialized, per-node representation. `repOfTy`
exists and is `_`-less exhaustive over the type arena — that part is sound. What
doesn't exist is a guarantee that **every consumer reads it instead of
re-deriving the same fact its own way**, because the compiler has no lowering
pass that stamps a rep onto every node once and freezes it; instead, 519 sites ask
the question fresh, in whatever local context (name, table, frame) happens to be
convenient at that call site, because the AST/arena is a shared mutable structure
being consulted contextually rather than a value being read off a completed IR.

**The alternative.** A real lowering pass: after type-checking and
monomorphization, walk the program once and materialize a `RepDesc` (or
equivalent) **on every node**, as an immutable field of a new, smaller IR handed
to the emitter — not a descriptor that competes with 518 other producers for the
right answer, the *only* producer, because the other 518 no longer exist to
disagree with it. This is what "lowering to a typed IR" means in every serious
compiler (rustc's THIR→MIR, Swift's SIL, GHC's Core) and it is precisely the step
VL never took: the compiler goes AST-with-type-annotations straight to bytes, with
"rep" as an emergent, re-derived property rather than a first-class value.

---

## Finding 3 (severity: high) — Monomorphization by "clone the spine, share the
leaves," proven to lose information across two instantiations (D1816)

**The decision**, in the compiler's own comment: *"Clone a monomorphized
instance's body, substituting every `LetDecl` type-param annotation through the
binding. Only the statement spine is rebuilt; every leaf expression, a nested
lambda included, is shared, so no new function node is created."*
(`compiler/emit_mono.vl`, `monoCloneBody`). This is a genuine middle path between
full duplication (Rust/C++, where every instantiation gets its own independent
tree, at the cost of more arena memory and compile time) and dictionary passing
(no duplication, at the cost of uniform boxed representation) — and it inherits
the worst of both: it duplicates enough to need per-instance bookkeeping, but not
enough to give every instance an independently-addressable identity for facts
that vary per instantiation.

**Verified, live and open.** D1816
(`docs/internals/inventory/D1816.md`), reproduced directly against `dist/vl`:

```
function o(n) {
  function k(x: i32) { return n }
  const fs = [k]
  return fs[0](1)
}
print(o(2))
print(o(2.5))
```
```
$ ./dist/vl check d1816.vl   → rc 0, "Found 0 errors, 1 warning."
$ ./dist/vl run   d1816.vl   → Error: emit error
                                emitProgram: callee is not a function name
```

**Mechanism, traced to the exact table.** `o` is called at two types (`i32`,
`f64`), producing two instances `o$0`/`o$1` whose closure `k` should specialize to
`(i32)=>i32` and `(i32)=>f64` respectively. But `const fs = [k]` is a **leaf
expression** — an array literal — and per `monoCloneBody`'s own contract it is
never re-cloned; it is **one arena node interned once**, during a flat collect
pass, *before any function is emitted* (`curFn=-1`). The hole-pinning mechanism
that is supposed to recover per-instantiation facts, `holePinTys`
(`compiler/typecheck.vl`), does maintain a *set* of distinct pins per
`(owner, name)` key (`notePinnedHole` pushes onto `holePinSet[key]` when a new
pin disagrees with the existing one) — but every reader collapses that set back
to a single scalar before use: `holePinCollapsedOf` returns `-1` (unpinned), the
sole pin (agreement), or **`-2`** ("two disagreed") with **the specific pins
discarded**. The set survives inside `holePinTys`; nothing downstream can recover
*which* pin applied to *which* use. The inventory row's own mechanism section
states this as the terminal blocker: *"the pin SET survives nowhere ... a collect
scan could not mint one row per pin even if it wanted to — it cannot learn what
the pins were."*

**What this proves about the design, not just about this one row.** The fix the
row names — a durable pin *set* reaching the mint point, plus a frame-scoped
per-instance mint moment for every leaf expression that currently has none — is
explicitly scoped by the row's author as **"a monomorphization redesign, not a
local edit,"** and the row is **ruled closed as an accepted residue**, not
scheduled, because it is "disproportionate to one array-element spelling." That
is the correct call for *this* row (it fails loud, at check-clean-then-emit-fail,
which is a clause-2 violation but not silent miscompilation). But the same
"shared leaf, collapsed pin" shape is not unique to array literals — it is the
shape of *every* leaf expression under *every* twice-differently-pinned generic
context, and the fix being declined here is declined for the same reason each
time it comes up: it is expensive precisely because the sharing-of-leaves
decision was made globally, once, as a memory optimization, with no accounting
for how many future defects would be priced against it individually rather than
against the design decision that causes all of them.

**The alternative.** Full per-instance body cloning (accept the memory/arena
cost — modern compilers routinely duplicate MIR per monomorphization and it is
not the bottleneck rustc fights) *or* a first-class notion of "expression
identity at a pin" — i.e., key every rep-bearing side table on
`(node, instantiation)` rather than on `node` alone, from the start, rather than
retrofitting a frame parameter onto call sites one filed defect at a time (which
is literally what items 2, 7, and 8 of the rep-descriptor campaign's conversion
order are doing, three years — sorry, months — into the compiler's life).

---

## Finding 4 (severity: medium-high) — The checker and emitter are two
independently-total ladders over the same arena, and "clause 2" is the receipt

**The decision.** VL's own standing bar (`CLAUDE.md`) is two clauses: (1)
soundness — if `check` accepts it, it must build and run correctly; (2) no
capability refusals — the compiler may only reject what the *design* forbids,
never "not yet supported by codegen." Verified directly: `vl check`
accepted the D1816 program above with **zero errors**, and `vl run` failed at
emission. That gap is not rare or cosmetic. The project's own measurement
(`scripts/emit-refusal-sites.py`, `scripts/capability-probes/`) finds **533**
distinct emit-side refusal call sites, of which a witnessed sample estimates
**≈226–302 are actually reachable by a `vl check`-clean program** — i.e.
somewhere close to half of all emit-time refusals are live clause-2 violations,
not defensive dead code, and this number was **wrong three separate times**
before landing on a witness-backed method (a wording-based grep found 16 of 533;
a hand-count of "matching phrasings" found first 12, then 26, then 23).

**The scaling failure it invites.** The checker (`typecheck.vl`, 36K lines) and
the emitter (`emit_classify.vl` + `wasmEmit.vl`, ~59K lines combined) are two
separately-accreted pattern-match ladders over the same AST, each independently
deciding "is this legal" — the checker by type rules, the emitter implicitly, by
which shapes it has bothered to lower. Nothing enforces that the emitter's
*implicit* domain (what it can build) is a superset of the checker's *explicit*
domain (what it accepts). As the language grows features, this gap doesn't
shrink on its own — it grows precisely where a feature interacts with another
(generics × closures × arrays, in D1816's case) because that's exactly the
combinatorial surface neither ladder was written against the other to cover. The
project's own inventory shows this pattern industrially: 25 rows converting
"check-clean invalid wasm" into a loud refusal in five days, of which a
2026-09-03 audit found only 28 of 32 conversions were genuinely a design rule the
checker owed — the rest were monomorphization pins losing a soundness fact the
*direct* spelling already refused correctly, i.e., the same "shared node loses
per-instance information" disease from Finding 3, showing up as a checker/emitter
disagreement instead of an emitter-internal one.

**Root cause.** Same as Finding 2: no single source of truth for "is this
program legal," re-derived independently by two 30-60K-line ladders instead of
one decision procedure both consult. It's the rep-model disease at the
checker/emitter boundary instead of within the emitter.

**The alternative.** Either a formally exhaustive checker whose accept-decision
is provably a subset of the emitter's build-decision (a totality proof over the
same closed AST-node-kind set the `kind-ladder-incomplete` lint already partially
enforces — extend that lint's philosophy from "is every AST kind handled" to "is
every checker-accepted *shape* handled by the emitter"), or, more realistically
given the scale already accreted: a generated cross-reference between the
checker's accept predicates and the emitter's `emitFail` call sites, checked in
CI, that fails when a new checker acceptance path has no corresponding emitter
coverage. The project has the instruments to build this (`capability-probes/`,
`kind-ladder` census) — it has not pointed them at each other.

---

## Finding 5 (severity: medium) — No const-generics: correctly deferred for
SIMD, but an open wound everywhere else

**Correction to the brief's framing.** `docs/internals/simd-design.md` makes a
genuinely strong, non-hand-wavy case that a **closed family of fixed named
vector types** (`F32x4`, `I8x16`, …) is not a workaround forced by missing
const-generics — it is the *right* answer given the target: WASM's `v128` has
exactly one width, forever (no `v256`, no scalable-vector proposal), so a generic
`Vector<T, N>` would monomorphize to the same six shapes a closed enum already
names, buying genericity over an axis (`N`) that has exactly one legal value on
this target. The doc is explicit that this is why it recommends *against* a
generic surface even once const-generics exist (§O10: "the fixed types are the
surface; A10 is not a dependency of v1"). This is the one place in the review
where the adversarial premise doesn't hold, and it's worth saying so.

**Where the gap is real.** `A10` ("const generics ... value type parameters") has
**"no grammar or semantics recorded"** (`ROADMAP.md`, verbatim) and blocks named
families that *do* need it and have no fixed-width escape: `Decimal<Backing,
Scale>` (an arbitrary-precision decimal family explicitly named as blocked on
A10), any `Buffer<N>` fixed-size type, and generic `map`/`filter` over `Map`/`Set`
(a *type*-generic gap, listed under the same roadmap item, suggesting the whole
parametric-types story is one under-resourced backlog item rather than a
sequenced plan). This is a **known, named, deliberately deferred** gap rather
than a silently accruing one — which is why it ranks below Findings 1-4 — but
"deliberately deferred with no grammar sketched" for what the project's own docs
call an "enabler" of a whole type family (`Decimal`) is a bet that the feature
stays cheap to add later. Every other finding in this review is evidence that
retrofitting a foundational type-system axis onto VL's shared-arena, whole-program
monomorphizer is not cheap by the time it's asked for (see Finding 3): the
existing generics machinery already required a "spine redesign" conversation for
ordinary *type* parameters interacting with closures. Value parameters, which
need to participate in monomorphization keys, `$fnsig` tokens, AND the rep
descriptor's slot layer, are not obviously easier.

**The alternative.** Sketch the grammar and the monomorphization-key shape for a
value type parameter *now*, even unimplemented, specifically so `Decimal`'s
design isn't drafted twice — once against a guessed A10 shape, once against
whatever A10 actually ships as. Cheap insurance against Finding 1-3's tax being
paid a second time on a feature that's already on the roadmap.

---

## Finding 6 (severity: medium) — Self-hosting bootstrap: not a house of cards,
but the load-bearing wall is tribal knowledge, not a guarantee

**What's real.** The compiler is a ~160K-line VL program that compiles itself,
and `CLAUDE.md` documents, as *lived incidents rather than theoretical risks*:
a poisoned seed (an instrumented compiler compiles the next compiler with itself
as seed, silently propagating stray bytes into every subsequent build, presenting
as three unrelated CLOSED inventory rows regressing at once); non-terminating
self-builds (`timeout` kills the shell, not the orphaned `vl build`, which
reparents to init and holds a core at ~90% until someone notices load); and a
cost regression that is invisible at the bootstrap level where it's introduced
and only manifests one generation later (D1090: 32s→321s, past a 300s timeout,
from a change neither of two suspected commits caused). Each of these took actual
debugging sessions to characterize, and none of them would be caught by "does the
candidate compile" — the standard smoke test for a self-hosting toolchain.

**Why this isn't "critical."** Unlike Findings 1-4, the team has converged on
*general, mechanical* guards for this specific class rather than one-off patches:
`arena-scan-outside-pass` (a lint against the shape that causes it), a
scaling-shape test suite with a **deliberate negative control** (a tenth pair
engineered to fail, so a rotted detector can't pass silently), and a CPU-second
tripwire on the L2 build. That's a maturing immune system, not a house of cards —
compare this to Findings 1-3, where the mitigating instrument (the rep oracle,
the monomorphization pin set) is still discovering new failure shapes rather than
converging on the pattern.

**What's still owed.** Every one of these guards was built *after* the failure
mode was hit in production, and the "how do I know I'm not the next incident"
knowledge lives entirely in `CLAUDE.md`'s prose, not in the build system. A
project at this description's scale (25-26 merge gates, `scripts/gate.sh` fanning
out to <90s) has clearly invested in fast feedback — but fast feedback on *known*
failure shapes is not the same as structural protection against the *next* one.
The single biggest miss: there is no cross-check against an *independently
built* compiler (e.g., an older frozen release, or a from-scratch reference
interpreter) verifying the self-compiled seed's behavior on a held-out program
set that isn't the same corpus the seed itself was validated against — the
fixpoint check proves the compiler agrees with *itself*, twice, which detects
non-convergence but not a stable-but-wrong fixpoint reached by seed corruption
that happened before the fixpoint check was added to the pipeline.

**The alternative.** Nothing needs to be thrown away here — the direction is
right. What's missing is the automation of the discipline: a scheduled (not just
reactive) rebuild-from-git-archive-in-clean-tmp comparison against the live
worktree seed, run periodically rather than only when someone remembers the
`cmp`-not-`ls -l` rule from a past incident.

---

## Finding 7 (severity: low-medium) — The error model is coherent; the `as` trio
overloads one syntax for two unrelated control-flow shapes

**What's good, stated plainly.** `docs/error-handling-design.md`'s
errors-as-values model (`T | null` for absence, `T | E` for reasoned failure,
traps for bugs, no catchable exceptions) is a clean, well-precedented design
(Rust/Zig/Go's actual convergence point, correctly cited as such) and it is
**verified working**: a two-arm `T | IoError` propagation chain compiled and ran
correctly on first try against `dist/vl` (`readIt` → `as string` propagation →
`is IoError` narrowing at the boundary, printing the right branch both ways).
Reserving `exnref` for a possible future async era rather than building
exceptions now, and rejecting `async`/`await` in favor of direct-style I/O with
host-side stack switching, are both defensible, load-bearing decisions with
real alternatives named and weighed (`concurrency-design.md`) rather than
avoided.

**The wart.** The `as` trio overloads a single operator (`as`/`as?`/`as!`) across
two semantically unrelated jobs: a numeric narrowing cast (`3.9 as i32`, a
value-preserving, control-flow-transparent transformation) and a union-arm
propagate-or-early-return (`fs.read(p) as string`, which can silently transfer
control to the *caller* of the enclosing function on the untaken arm). Both are
justified individually and the doc's Swift/Rust/Zig comparison is fair for
*each half separately* — Swift's `try`/`try?`/`try!` are a *prefix* keyword
visually distinct from any cast; Rust's `?` is a dedicated postfix sigil,
visible in a diff or a skim without knowing the operand's declared type. VL's
choice makes `x as T`'s control-flow behavior (does this line possibly return
from the function?) depend entirely on the **static type of `x`**, which is not
visible at the call site without cross-referencing its declaration. This is a
readability regression relative to every language the design doc cites as
precedent, on the exact axis (visibility of non-local control flow) those
languages were being cited *for*.

**The alternative.** Keep the model, change the spelling: a distinct sigil for
the propagating form (postfix `?`, à la Rust, is sitting right there and is not
claimed by anything else in the grammar survey I found) leaves `as` doing one
job (value conversion) and gives non-local control flow the visual weight it
already gets in every language whose convergence this design is citing as
justification.

---

## Summary table

| # | Decision | Failure mode invited | Root cause | Reversible? |
|---|---|---|---|---|
| 1 | Whole-program compile, no separate units, unbounded monomorphization | Build time & binary size both scale with total transitive program size, unbounded, once a real dependency graph exists | Generics' cost (code duplication) taken without generics' usual mitigation (separate compilation) | Hard — `modules-design.md` rejects the escape hatch by name |
| 2 | Rep computed at 519 independent sites, reconciled by runtime A/B oracle | Every new emitter feature can silently disagree with 518 others; byte-identity does not prove domain-removing changes safe | WasmGC nominal heap types vs. VL structural types, with no materialized per-node rep in a real lowering IR | Medium — campaign is already underway, but it's reconciliation, not the fix |
| 3 | Monomorphize by cloning the statement spine, sharing leaf expressions | A twice-differently-pinned leaf (closure in an array) cannot carry two reps; the fix is called "a monomorphization redesign" and was declined | No per-(node, instantiation) identity; a global scalar pin collapses to `-2` and discards which pin | Medium-hard — needs either full cloning or a threaded frame at every leaf, not a local patch |
| 4 | Checker and emitter are two independent total-ish ladders over one arena | ~half of 533 emit refusal sites are reachable by check-clean programs (clause-2 violations) | Same "no single source of truth" disease as #2, at the check/build boundary | Medium — instruments exist, aren't cross-checked yet |
| 5 | No const-generics | `Decimal<Backing,Scale>`, `Buffer<N>` blocked indefinitely; SIMD itself is NOT actually hurt by this (correction to brief) | Deliberately deferred type-system axis with no grammar sketch | Easy to de-risk now (sketch it), hard once `Decimal` is built against a guess |
| 6 | Self-host bootstrap with reactive, incident-driven hardening | Poisoned seeds, non-terminating builds, one-generation-delayed regressions | Immune system built one bite at a time; converging, not yet structural | Improving on its own trajectory |
| 7 | `as`/`as?`/`as!` overloads cast and union-propagate | Non-local control flow invisible without knowing operand's static type | One operator serving two unrelated control-flow shapes | Easy — spelling change, model is sound |

Everything in this file was either quoted verbatim from the tree or run directly
against `dist/vl` on 2026-09-07; file paths and line-level evidence are inline
above rather than re-derived here.
