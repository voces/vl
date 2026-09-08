# VL evolvability review — a .NET platform architect's red team

Scope: `DECISIONS.md`, `CLAUDE.md` (std-review section), `docs/internals/std-api-review.md`,
`docs/internals/simd-design.md`, `docs/internals/std-design.md`, `docs/internals/buffer-design.md`,
`docs/internals/flat-records-design.md`, `ROADMAP.md`. Not a style review. The question is: what is
being locked in *now* that a team will be stuck with in 2029–2031, and what did a much older
ecosystem already pay to learn the same lesson.

No praise below. Where VL has already built a real hatch (structural dedup's `A14` escape,
VLB's fingerprint-then-version-byte), I say so only to contrast it with the places that got no
hatch at all — the asymmetry is itself a finding.

---

## Finding 1 (CRITICAL) — std has no deprecation mechanism, no version axis, and the absence is *already* distorting the roadmap toward under-building

**The locked-in decision.** `std-design.md` D2, verbatim: *"No version/feature surface. One std
per compiler build; std's version IS the compiler's version."* `CLAUDE.md` states the consequence
plainly: *"there is no deprecation story — a std name is close to permanent."* The entire
mitigation is a human review gate (`std-api-review.md`) run once, before merge.

**The 3–5 year consequence.** A language with no package ecosystem and no deprecation channel has
exactly one lever against a wrong std decision: get it right pre-merge, forever, for every
export, under every future use case nobody has thought of yet. That is not a compatibility
strategy, it is the *absence* of one, staffed by hope. Two kinds of damage compound over 3–5
years:

1. **Mistakes that do happen become permanent liabilities**, each carrying its own bespoke,
   hand-rolled workaround forever, because there's no generic mechanism to retire a name.
2. **Fear of the first kind causes the second, quieter kind**: VL's own design notes show the
   team *already* declining to ship useful APIs specifically because they can't be taken back.
   `DECISIONS.md`'s `std:json` accessor-helper ruling says it outright: *"A helper returns to the
   list the day a consumer that cannot name its shape arrives, and not before — std has no
   deprecation story, so the cheapest helper is the one never shipped."* Same logic killed a
   `CallerLoc`-hosting module: *"A new module is the speculative surface a version-locked std
   cannot take back... a module key is the most permanent thing this repo mints."* This is a
   **standing conservatism tax on the whole API surface**, paid on every ruling, forever — and it
   is a worse failure mode than "occasionally ship the wrong helper", because it is invisible: no
   regression test catches a helper that was never written.

**Is "get it right the first time via review" a real strategy?** No — and the repo's own
history inside a few weeks refutes it empirically, not hypothetically. `DECISIONS.md` is full of
same-day and next-day reversals of its *own* rulings: *"OQ-6 REVERSED... the same day"*; a
`CallerLoc` location banner that says *"THE ANCHOR MOVED THE NEXT DAY — read this entry as of
2026-09-01, not as of today"*; the JSON absent-key sub-rule *"drafted... the opposite"* and
reversed before it shipped; `std-comment-audience` itself needed a mid-flight owner ruling to
correct scope creep in std headers. A review process that revises its own conclusions this
often, this fast, is a *good* review process doing its job — but it is proof by construction that
review does not converge to "right" reliably enough to be the **only** safety net for a
permanent surface. .NET's own history says the same thing from the other side: `IEnumerable<T>`
lacking covariance, `DateTime` conflating "no timezone" with "unspecified", `Nullable<T>` boxing
surprises, `Async void` — none of these were unreviewed; they were reviewed by people at least as
careful as this repo's process, and still wrong in ways nobody caught until millions of call
sites existed. What saved .NET was never smarter review. It was `[Obsolete]`, analyzers
(CA-rules, Roslyn source generators, `.editorconfig` severity), and TFM-gated behavior so a
bad decision could be *marked, migrated away from, and eventually removed* on a timeline
measured in years rather than requiring it to be right on day one.

**Concrete worked case in this repo that already needed an escape hatch and built an ad hoc
one:** the `toString`/`toStr` unification (`DECISIONS.md`, "toString is std's name, not the
compiler's"). This was a *good* decision, but note what it needed once made: **the compiler
itself grew a special-cased diagnostic**, `typecheck.stdFmtMovedNote`, that recognizes the two
retired spellings by name and appends a migration hint. That is a deprecation mechanism — built
once, by hand, inside the type checker, for one rename, because there was no general one to
reach for. The same shape will be needed again the next time a std name turns out wrong, and
each time it will be re-invented from scratch inside compiler internals rather than reused,
because nothing generalized it.

**What .NET's mechanism is actually for** (so the comparison is precise, not just "add
`[Obsolete]`"): it is not a courtesy annotation. It is (a) a **machine-checkable channel** a
build breaks or warns on, (b) that **names the replacement**, (c) that is **queryable by
tooling** (an IDE strikes the name, a code-fixer can bulk-migrate call sites), and (d) that
**decouples "the name still resolves" from "the name is still recommended"**, so a compiler/std
pair can ship a fix immediately and let call sites migrate on their own schedule instead of in
lockstep with the compiler release that broke them.

**Proposed escape hatch, compatible with VL's aesthetic (no runtime feature negotiation, no
package ecosystem, structural typing kept intact):**

- **Generalize `stdFmtMovedNote` into a small, checker-owned redirect table** —
  `retiredExports: { "std:fmt".toStr → "std:fmt".toString }` — consulted at the same
  undeclared-identifier / member-access diagnostic sites that already exist. This is *purely
  diagnostic-time*, costs nothing at runtime or in the emitted module, and turns "hand-patch the
  type checker every time" into "add one row to a table every time." It is exactly the same
  mechanism VL already built once — the ask is to stop rebuilding it per-incident.
- **A lint, `std-export-marked-retiring`, tier `warning`, ratcheted like every other lint in this
  repo** (`comment-budget.py`-style: it can only go to zero, never up), that fires when a std
  export appears in the redirect table above — this is std's `[Obsolete]`, minus any runtime
  cost, minus any package-manager negotiation, expressed the same way this repo already expresses
  every other ratcheted debt (`sentinel-budget`, `ladder-budget`, `comment-budget`). It fits the
  existing aesthetic instead of importing .NET's.
- **This does not require reversing "no version/feature surface."** It is a compile-time-only,
  same-binary redirect — std stays one atom per compiler build, nothing about resolution
  semantics changes. It buys the one thing missing: a *named, reusable, queryable* way to say "this
  spelling is wrong, here is the right one" instead of either (a) silently keeping the wrong name
  forever, or (b) hand-writing a new compiler diagnostic every time, or (c) refusing to ship the
  API at all out of fear of (a) and (b) — which is the tax actually being paid today.

---

## Finding 2 (HIGH) — SIMD bakes the width into the type's *name*, on a target argument that assumes WASM's SIMD story is finished; it explicitly declines to reserve the generic path

**The locked-in decision.** `simd-design.md` §D1/§B6/§F O10 recommends a **closed family of
named types** — `F32x4`, `I32x4`, `U8x16`, … — one per WASM lane shape, explicitly rejecting a
generic `SIMD[T, N]` and explicitly declining to reserve that surface for later: *"Recommend
'fixed family is the surface; A10 is not a dependency of v1'... Swift has shipped exactly this
for a decade without a generic."*

**The argument as stated, and its actual load-bearing premise.** §B6 states the thesis
cleanly: *"VL's target has one width — an agnostic `Vector<T>` tier would always resolve to 128
bits and buys nothing over a fixed `F32x4` except a false promise of portability across widths VL
can never emit."* This is true **only as long as it stays true that WASM has exactly one SIMD
width, forever.** That is not a law of the target; it is the current state of a standard that has
already grown once inside VL's own design doc (§A4: relaxed SIMD, "standardized 2024, part of
Wasm 3.0", added *after* baseline SIMD's 2021 phase-5). WASM's history is a decade of the exact
kind of addition this doc treats as closed: reference types, tail calls, GC, memory64, relaxed
SIMD — each landed years after the "core" spec, each required exactly the kind of two-tier
handling .NET's `Vector<T>`/`Vector128<T>` split exists to manage. There is no *proposal* for
`v256` today, correctly noted (§A5) — but "no proposal today" describing a standard that has
added five major features since 2021 is a five-year bet stated as a certainty.

**What .NET actually shipped, and why the doc's dismissal of it proves too much.** §B6 reads
`Vector<T>` as solving a problem VL doesn't have ("variable *hardware* width"). That is correct
as a description of what `Vector<T>` does, but it undersells *why* .NET paid for two tiers rather
than one: `Vector128<T>`/`Vector256<T>`/`Vector512<T>` (the fixed tier) is what a kernel author
reaches for when they want the exact ISA-shaped operation VL's `F32x4` wants — and .NET shipped
it *alongside*, not instead of, the agnostic tier, because a single tier could serve neither need
well. VL is choosing to ship only the equivalent of .NET's fixed tier — a defensible choice given
a genuinely fixed target — but the doc treats "we only have one tier's problem today" as
justification for **actively refusing to reserve the seam** where a second tier or a second width
family would attach. That is the part .NET's history argues against: the two-tier split wasn't
foresight for its own sake, it was because a **fixed vector type, once shipped and used, becomes
load-bearing across every kernel written against it** — and by the time AVX-512 or SVE showed up
in the hardware landscape, .NET could not have retrofitted width-agnosticism into
`Vector128<T>` without breaking every existing caller. It had to add `Vector<T>` as a *new*,
parallel surface. VL is choosing, today, deliberately, not to build the seam that new surface
would attach to — no reserved namespace, no shared structural op-set contract, nothing.

**The concrete 3–5 year cost, made precise by VL's own constraints.** If WASM ever ships a wider
vector (the doc's own §E says this plainly: *"new named shapes (`F32x8`) are added beside these,
not a rework"*), VL is committed to:

- A **second, entirely parallel type family** (`F32x8`, `I32x8`, …) with **duplicated function
  names** for every op (`addF32x4` *and* `addF32x8`, `reduceAddF32x4` *and* `reduceAddF32x8`, …)
  — because VL has no generics over a width parameter (A10 is explicitly "not a dependency," so
  nothing unifies them even conceptually), and because the width is baked into the *function
  name*, not just the type, per §D2/§D4's naming convention. Every kernel author who wrote
  `f32x4(a,b,c,d)` and `addF32x4` has source code that does not merely need recompiling for the
  new width — it needs **rewriting**, function name by function name, call site by call site,
  because there is no shared symbol the two widths could both satisfy.
- **No migration path a tool could automate mechanically**, because nothing about the F32x4
  family declares itself part of a *pattern* rather than a one-off. Contrast with VL's own
  structural typing, which elsewhere in this codebase is used precisely to let two independently
  declared shapes be interchangeable (`DECISIONS.md`'s struct heap-type dedup, `A14`'s forward-compat
  opt-out). SIMD as designed does not use that lever at all.

**What .NET learned, restated for VL's situation:** shipping only the fixed tier is a legitimate
choice when the target genuinely has one width — but the mistake .NET's `Vector<T>` history
argues against is not "ship one tier," it is "ship one tier and give the type system nothing
that lets a second tier attach without a rewrite." A hardware/standard axis that looks closed
for years can still open, and when it does, the cost lands entirely on whoever wrote code
against the fixed tier in the meantime — which, if this ships, is every VL SIMD consumer that
exists between now and whenever it opens.

**Proposed escape hatch, inside VL's aesthetic (no generics required, no runtime cost):**

- **Freeze the *naming convention*, not just the types, as a contract now, in the module
  header, even though the family is closed.** State explicitly: *"a wider lane family (e.g.
  `F32x8`) is a NEW, unrelated type if WASM ever gets one; it shares no name and no implicit
  conversion with `F32x4`."* This is nearly free — the doc already implies it (§E) — but it should
  be a **written commitment a caller can rely on**, not an implication a future maintainer has to
  infer, precisely because `std-api-review.md` treats an *unstated* deviation as the thing worth
  flagging.
- **Keep every op spelled as an operator (`+ - * /`) wherever §F O4 sanctions it, and treat the
  named-function spelling (`addF32x4`) as the *fallback*, not the primary surface**, specifically
  *because* operators are width-erased at the call site: `a + b` reads identically whether `a`,
  `b` are `F32x4` or (hypothetically) `F32x8`, and a kernel written entirely in operators needs
  only its *declarations* touched to retarget a wider lane, not its logic. The named-function
  spelling the doc offers as "the surface works even if operator overloading is declined" is
  exactly the spelling that will need to be rewritten line-by-line later — that trade-off should
  be named in O4's ruling, not discovered when `F32x8` ships.
- **When (if) a second width family is ever built, generate both families from one template**
  (a script under `scripts/`, in the spirit of `matrix.py`'s position-matrix generator or
  `cellmap.py`'s corpus tooling this repo already trusts for exactly this kind of "don't
  hand-write N near-identical things" problem) rather than hand-writing `F32x8`'s ~60 intrinsics
  by copy-paste from `F32x4`'s. This doesn't prevent the source-level rewrite callers face, but it
  bounds the *std-side* maintenance cost and guarantees the two families stay behaviourally
  parallel instead of drifting the way hand-maintained "parallel" APIs always do.

---

## Finding 3 (HIGH) — `flat`'s "subtracts nothing" invariant already broke once, silently bifurcating the type into two reps with no capability query for code written against it

**The locked-in decision, and its own history.** `flat-records-design.md` §4 states the founding
ruling as absolute: *"`flat` ADDS validation and constants; it SUBTRACTS nothing... nothing is
unsound about a flat type also being a GC struct."* That ruling was **already reversed in part**
by the sub-word field feature (`ROADMAP.md`, P1.2 phase 2): *"One refinement of 'flat subtracts
nothing' the rep forces: a flat with a sub-word field is NOT also a GC struct... so it is
layout-only — read by address and offset, skipped from the struct table in `collectS`,
transitively (a flat nesting a sub-word flat is layout-only too)."*

**Why this is worse than an ordinary capability gap.** This is not "a feature doesn't work yet
on some types" — it is a **type that used to be uniformly one thing (a GC struct with extra
compile-time constants) silently becoming one of two different reps depending on a property
(field width) that is easy for a caller not to notice they're depending on.** A `flat` value with
only `i32`/`i64`/`f32`/`f64`/nested-scalar-`flat` fields is a real, passable, storable GC struct.
The identical-looking declaration with one `u8` field swapped in is a bytes-and-offsets-only
descriptor that **cannot** be held as a value the same way. Nothing about the *syntax* at the
declaration site marks this difference — a reader has to know the field types and know the rule.
The repo's own inventory rows (D300/D301, cited in `DECISIONS.md`'s struct-dedup section) are a
worked instance of exactly this failure shape one layer down: *"a layout-only rung... is
transitive... breaks the same premise"* — a rung that looks like every other rung until something
downstream assumes transitivity it doesn't have, and the failure surfaces as a **compiler trap**,
not a diagnostic, because `emitFail` doesn't halt (a pattern this repo has independently
rediscovered and documented as its own recurring defect family: "AN EMITFAIL PROBE IS SILENT",
"A TABLE READ BOUND-TESTS ITS INDEX", etc., in `CLAUDE.md`).

**The 3–5 year consequence.** Every future feature that touches `flat` types has to independently
rediscover this bifurcation, because there is no single place a maintainer (or a future generic
system, once A10 lands) can *ask* "does this flat type have a struct rep?" The pattern this repo
has already lived through with sentinel-index bugs and kind-ladder holes — *a property is true of
most instances of a kind, a new consumer assumes it's true of all of them, and the exception
surfaces as a trap three separate times before someone writes the general rule down* — is set up
to repeat here specifically. Candidate future features that will each hit this wall separately:
a generic collection over `flat` types (once A10 lands, exactly the const-generics path §F O3/O10
defers), `flat`-array interop with the SIMD design this same review is examining (§D5 already
requires 16-byte-aligned *scalar* rows — it is not yet stated whether a sub-word-bearing flat can
ever be read as a vector, and by the "layout-only" rule, probably cannot, silently), a future
serde path over `flat` values, closures capturing a `flat` value, pattern matching. Each will
need to ask the same question this doc already had to answer once, and nothing forces it to be
asked before code ships.

**What .NET learned from the analogous split.** C#'s value type / reference type boundary looks
uniform (`struct` vs `class`) but grew silent behavioral forks under load — a boxed struct
mutated through an interface reference doesn't mutate the original (a defect class so common it
has its own compiler warning today), `readonly struct` had to be added *later*, as an explicit
escape hatch, once "does this struct silently copy when I expected a mutation" bit enough people
that the language needed a way to *ask the compiler to enforce the safe half* rather than leaving
callers to intuit it per call site. The lesson transfers directly: a bifurcated representation
that looks like one type needs a **compiler-visible, queryable marker of which side of the split
a given instance is on**, checked at the boundary, rather than trusting every future feature
author to independently rediscover and correctly handle the exception.

**Proposed escape hatch, consistent with VL's existing "checker-folded constants" pattern (the
same mechanism `T.size` / `T.<field>` already use for generic-friendly compile-time facts):**

- **Add a checker-visible, checker-folded compile-time boolean fact per `flat` type** —
  something in the shape of `T.hasStructRep` (or fold it into an existing predicate the
  monomorphizer can query once A10 lands, mirroring exactly how `T.size` already resolves per
  instantiation) — so that *any* future pass, generic function, or library author has one place to
  ask the question instead of re-deriving "does this flat type contain a sub-word field,
  transitively" by hand. This is not new machinery in kind — it is the same "checker folds a fact
  about `T` that a monomorphized instance can consume" mechanism `flat` already uses for `.size`
  and `.field` — it is new only in that the fact is boolean rather than an offset.
  It converts "every consumer independently rediscovers the exception, sometimes via a trap"
  into "every consumer can ask the compiler and get a loud, immediate answer" — which is exactly
  this repo's own standing rule (`CLAUDE.md`: *"A LADDER OVER A CLOSED KIND SET IS EXHAUSTIVE, OR
  ITS DEFAULT NAMES WHAT IT EXCLUDES"*) applied to a type-level property instead of a kind switch.

---

## Finding 4 (MEDIUM-HIGH) — language, std, compiler and the self-hosting seed are one welded atom with zero independent-evolution axis, and the one time version skew actually happened in the field, the fix was to weld it *tighter*

**The locked-in decision.** `std-design.md` D2: *"No version/feature surface. One std per
compiler build; std's version IS the compiler's version."* This is not a passive default; it is
an explicit, load-bearing design choice, then reinforced by D1573/D1574 (`DECISIONS.md`): std now
ships **baked inside the compiler binary itself**, precisely *because* an on-disk std and a
binary's embedded seed drifted 37 commits apart in the field and caused two separate,
silent-failure incidents at the very first external consumer. The self-hosting bootstrap compounds
this: the compiler compiles itself, and the seed used to compile the *next* compiler is the
*previous* compiler's own output (`CLAUDE.md`'s "AN INSTRUMENTED COMPILER POISONS THE SEED"
section is a direct, documented consequence — a stray byte in one build silently propagates
forward through every subsequent seed until someone notices unrelated tests regressing).

**The 3–5 year consequence.** There is currently no axis along which a consumer can hold two of
{language semantics, std behavior, compiler codegen, seed generation} fixed while the third moves.
Concretely:

- **No LTS/stable-channel story is possible as designed.** Every consumer is always on head, by
  construction — there is no equivalent of choosing a target framework moniker and getting bugfix
  updates without behavior changes, because "std's version IS the compiler's version" collapses
  the two axes .NET (and every ecosystem with a package manager) keeps separate on purpose.
- **A compiler bugfix cannot ship without also taking whatever std changed in the same build**,
  and vice versa — there is no way to say "I want the codegen fix from build N+1 but the std
  behavior from build N" the way a real dependency graph would let two libraries update on
  different schedules.
- **The seed itself is history-dependent state with no reset mechanism other than a from-source
  rebuild** — `CLAUDE.md`'s instrumented-seed section documents that a mistake baked into a build
  artifact keeps reappearing in every descendant until someone traces it back and manually
  restores a pristine binary. That is a much sharper version of "no deprecation story" applied to
  the compiler's own output, not just to a name in std.
- **This is not a hypothetical risk — it already caused two production incidents (D1573,
  D1574) inside a single day, at the first external consumer, before any real ecosystem
  existed.** And the response to seeing version skew cause real damage was to make version skew
  *structurally impossible to express* (bake std into the binary) rather than to make version
  skew *safe to reason about* (a version pair the tooling can compare and warn about). Those are
  different fixes with different long-run properties: the first works exactly as long as nobody
  ever needs the two axes to move independently; the second keeps working even when they do.

**What .NET learned, precisely.** The .NET Framework era *was* this welded model — one CLR per
machine, the GAC, "assembly version IS the runtime you get" in practice — and it became
untenable specifically because real-world consumers needed the axes to move independently:
app A needs runtime bugfix X without behavior change Y that shipped in the same servicing
release; app B wants to move to a new language version without a new BCL; a host wants to run
two apps built against different runtime versions side by side. The fix was not "review harder
before each Framework release" — it was **structural**: target framework monikers, side-by-side
runtime installation, and eventually the fully decoupled SDK/runtime version matrix .NET Core
shipped specifically to stop coupling those axes. VL is earlier in its life than .NET Framework
was when this bit .NET, which is exactly the argument for building the seam *before* an ecosystem
exists to depend on its absence, not after.

**Proposed escape hatch, cheap and consistent with "one std per compiler build" staying true
today:**

- **Even while std and compiler stay a single shipped atom, expose the fact as *three separate,
  independently-reportable numbers*: language-spec version, std content version, compiler/codegen
  version — via `vl --version`, and stamp all three into the embedded binary (alongside the
  existing seed).** Today all three always move together, so this costs nothing behaviorally —
  it is pure bookkeeping, the same "measure now, decide never" insurance this repo already
  practices elsewhere (the VLB wire format's fingerprint-plus-version-byte, kept explicitly
  *because* Java's `serialVersionUID` taught that a version stamped by hand goes stale — see
  `DECISIONS.md` OQ-10). The day these axes genuinely need to move independently — a compiler
  patch that must not perturb std-generated seed bytes, or a std fix that must ship without a
  compiler bump for fixpoint-stability reasons `CLAUDE.md`'s own seed-size section already treats
  as a first-class concern — the reporting plumbing to *express* that already exists, instead of
  needing to be designed under deadline pressure the way the wire format's versioning was
  designed reactively, after two incidents, rather than up front.
- **This is deliberately NOT a proposal to add a runtime feature-negotiation surface, multiple
  installed std versions, or anything else that would touch `std:*` resolution semantics.** It is
  strictly diagnostic: a number a tool or a bug report can quote, so a future version-skew
  incident is *comparable* rather than, as with D1573, discovered by a silent 37-commit drift that
  nothing warned about until it broke in the field.

---

## Finding 5 (MEDIUM) — "require base SIMD, design-but-don't-build the fallback" bets every SIMD-using program on wasm SIMD's universal availability and identical semantics forever, with no portable escape a first mover can use today

**The locked-in decision.** `simd-design.md` §A5/§D7 requires baseline (non-relaxed) WASM SIMD
unconditionally in v1 — *"VL can therefore require it... does not owe a portable scalar fallback
in v1"* — and explicitly designs a scalar-loop fallback (§D7) while explicitly **declining to
build it**: *"The fallback is designed but not built."* Relaxed SIMD is correctly gated behind an
opt-in flag for its non-determinism (§A4/§D7/§F O6) — that half of the design is sound and is the
one part of this doc that mirrors .NET's own FMA-determinism caution well.

**The 3–5 year consequence.** Two separate portability axes are being closed at once, one
explicitly and one by omission:

1. **The explicit one:** `DECISIONS.md`'s own memory-model section names the scenario this
   forecloses — *"The one argument that WOULD justify a real second backend is running on
   non-GC engines (WAMR/wazero/wasm2c) — a distribution call, not a perf one."* Those are exactly
   the engines least likely to have shipped WASM SIMD, since embedded/IoT WASM runtimes lag
   browser engines on feature adoption by design (smaller footprint, slower upgrade cadence).
   "V1 requires SIMD" quietly forecloses VL ever targeting that class of engine for a SIMD-using
   program, and every program written against `std:simd` between now and whenever that matters
   is written with no portable escape, because the fallback that would provide one is designed
   on paper only.
2. **The one by omission:** the doc validates its "SIMD is baseline" claim against *today's*
   browser/Deno/Node/wasmtime landscape (§A5) — a snapshot, not a guarantee. `CLAUDE.md`'s own
   standing methodology elsewhere in this repo is explicit that a *design document's* claims go
   stale one-directionally and must be re-verified against current reality before being relied
   on ("Claims about the tree" / "run the witness before scheduling"). This section of
   `simd-design.md` makes exactly the kind of environmental claim ("ships unflagged in every
   engine veldt targets") that this repo's own doctrine elsewhere insists be re-checked, not
   cited from memory — yet the recommendation to skip a fallback rests on it being permanently
   true rather than presently true.

**What .NET learned.** .NET's hardware-intrinsics story is explicit, per-ISA, and *always* paired
with a runtime capability check (`Sse2.IsSupported`, `Avx2.IsSupported`) precisely because "this
CPU generation has instruction set X" turned out to be exactly the kind of fact that looks
permanent from inside a five-year hardware cycle and stops being true the moment the code
ships somewhere else (a different customer's server SKU, a VM without AVX passthrough, an ARM
port nobody planned for when the intrinsic-only code was written). The `Vector<T>` tier exists
*specifically* to give callers who don't want to hand-write the capability check a portable
alternative that still gets *some* speedup everywhere. VL's target is far more homogeneous than
"every x86 CPU sold since 2008", which is real grounds for a lighter touch — but "far more
homogeneous" is not "provably permanent," and the gap between those two is exactly where .NET's
multi-decade intrinsics story keeps finding new cases (AVX-512 downclocking making the "just use
the widest ISA" default wrong on some SKUs; ARM64 having no direct analog to several
`Sse`-family intrinsics at all).

**Proposed escape hatch, scoped to cost little now:**

- **Build the designed-but-not-built scalar fallback as a real, tested `-mno-simd` build mode
  before `std:simd` ships its first real consumer**, even though no host needs it today. The doc
  already did the hard design work (§D7): a 4-/16-lane scratch-spill loop per op. The value isn't
  performance — it's that it makes "SIMD baseline" a **verified, continuously-tested claim**
  (compare the SIMD path against the scalar oracle on every CI run, the same "validated against
  a control" discipline `CLAUDE.md` insists on elsewhere — *"AN EMITFAIL PROBE IS SILENT... never
  trust a probe until a control you KNOW should trigger it does"*) rather than a one-time
  environmental snapshot frozen into a design doc. It also means the day a non-SIMD target
  actually matters, VL has a *tested* answer instead of a *sketched* one nobody has run in
  years.
- **Treat "does this engine have SIMD" the same way `--enable-simd` is already treated at the
  host level (§D6) — as a capability flag the toolchain threads through, not an assumption baked
  into every `std:simd` call site** — so that the day the fallback needs to become real, it is a
  build-mode switch, not a rewrite of every program that imported `std:simd` assuming it could
  never be absent.

---

## Overall verdict

VL's process gets real credit for *naming* tradeoffs explicitly and dating its own rulings — that
is more self-aware than most projects at this stage, and the wire-format versioning work (Finding
4's contrast case) shows the team already knows how to build a proper compatibility seam when it
decides to. The problem is that this care is applied unevenly: it went into the wire format
(VLB's fingerprint-plus-version-byte, explicitly citing Java's and MessagePack's regrets) and
into the compiler's own internal representation choices (the struct-dedup `A14` forward-compat
escape), but it was **explicitly declined** for the two places most likely to need it in 3–5
years — the std surface itself, and the SIMD type family being designed right now, before a
single line ships. "No deprecation story" is stated as a fact of nature in `CLAUDE.md`; it is
actually a choice, made once, that is now silently vetoing entire categories of otherwise-good
API design (the JSON accessor, the `CallerLoc` module) rather than being treated as a gap to
close. None of the five findings above requires abandoning VL's aesthetic — no runtime
negotiation, no package manager, no generics VL doesn't have yet. Each is a small, compile-time-only,
diagnostic-or-bookkeeping seam, in the same spirit as mechanisms this repo already trusts
(ratcheted lints, checker-folded compile-time constants, a fingerprint-first wire header). The
risk being taken is not that VL chose fixed-width SIMD or a tightly coupled std — both are
defensible for a young, single-implementation, no-ecosystem language. The risk is that it chose
them **without leaving itself a seam to reverse course**, on the assumption that sufficiently
careful review substitutes for one — and the project's own commit history, days old, is already
the best evidence that assumption doesn't hold.
