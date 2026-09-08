# Eight-lens adversarial design review — synthesis (2026-09)

Eight adversarial reviews were run against VL's design — each written from a named
persona (Rust/memory-safety, Swift/ergonomics, C#/evolvability, Lua/minimalism,
game-programmer/determinism, compiler-architect, numerics/ML, functional/type-theory) and
pointed at the parts of the tree most likely to reward hostility: the two-tier memory model
(WasmGC + `std:buffer`'s linear-memory escape), the not-yet-built SIMD proposal, the numeric
model, and the type system's soundness contract. This page is the cross-panel synthesis, not
a ninth review — it ranks what multiple lenses hit independently (convergence is the signal
a single review can't produce), separates real defects from tradeoffs VL already chose on
purpose, records what the review already drove same-day, and files what's left. The eight
full critiques are kept verbatim under
[`docs/internals/design-review-2026-09/`](design-review-2026-09/) and are cited by finding
below; nothing here restates their evidence in full.

## Convergence ranking

Ranked by how many lenses independently reached the same finding from different evidence —
not by severity alone, since a finding four reviewers reach independently by different routes
is better-attested than one reviewer's severity-1 call.

### 1. The checker's "accept" and the emitter's "can build" are different predicates, and the gap is large and self-measured

Hit by **Rust** (the `holePinTys` `-2` sentinel collapse, named a "standing soundness risk
factor" even though today's one consumer refuses loudly), **Lua** (finding 6: the soundness
guide's own headline claim contradicted two sections later, in the same document), **compiler**
(finding 4, its highest-severity architectural finding: "the checker and emitter are two
independently-total ladders over the same arena"), and **functional** (findings 1 and 2, both
CRITICAL, with a fresh live reproduction). This is the single most-corroborated finding in the
review, from the widest variety of angles (a compiler-internals view, a language-design-purity
view, and two independent live reproductions).

**Status: partially FIXED, and the residue is already the single most heavily instrumented
open item in this repo.** The sharpest instance — an un-annotated function's totality check
skipping the non-exhaustive-`is`-chain rule that the annotated arm already enforced — was a
*fresh* bug the functional lens found and reproduced live (check-clean, then `unreachable` at
runtime). It is now closed: **D1950 / #3000** (`fix(check): run the non-exhaustive is-chain
totality check for an INFERRED return, not only an annotated one`), landed the same day, with
the fix running the identical rule in both the annotated and inferred arms. The much larger
population this finding is really about — CLAUDE.md's own tracked ~226–390 (95% envelope up
to 390, per two independent witness samples) reachable clause-2 "type-valid but not yet
supported by codegen" emit sites — is not something this PR closes or should try to: it is
already the subject of a standing measurement program (`scripts/emit-refusal-sites.py`,
`scripts/capability-probes/`, `live-sites.json`) that this review has nothing to add to
mechanically. What *is* still open and filed below (row 37) is narrower and purely
editorial: the guide document stating the contract has one live factual error in its own
worked example.

### 2. VL's raw-memory tier (`Buf`, `flat`) has no visible "this line can corrupt state" marker

Hit by **Rust** (severity-1 finding: `Buf` is forgeable from two integers with no cast, no
`unsafe` keyword, and reads like an ordinary function call) and **functional** (finding 6:
`flat`'s dual identity — simultaneously a GC struct and a raw byte-layout descriptor — means
"a reader cannot tell, without knowing the `flat`/`Buffer`/`__*__` vocabulary by heart, which
lines of a program are inside VL's proven-safe universe and which are raw pointer arithmetic
that merely happens to be spelled the same way"). Both lenses independently reach for the same
comparison: Rust's `unsafe` keyword is a syntactically visible, lint-tracked island; VL's
raw-memory calls are indistinguishable from safe ones at the call site.

**Status: open, and one piece of it is a small, concrete, verified-live fix** — filed below
(row 35). The broader "mark the whole tier" idea (a lexical `unsafe` block, or C#'s parallel
finding that a `flat` type's struct-rep-or-not split needs a checker-visible capability query)
is real but is a bigger design conversation than this PR's mandate; it is noted here rather
than filed, and the narrower, immediately-actionable slice of it — `Buf` itself never got the
newtype hardening its own sibling view types did — is filed.

### 3. Structural unions need machinery a nominal sum type wouldn't: a global tag registry, three runtime encodings, and a flow-narrowing subsystem standing in for `Option<T>`

Hit by **Lua** (findings 3–4: flow narrowing is "a shadow type system riding on top of the
primary one," and the three-encoding union classifier is "a correctness-critical subsystem the
user cannot see and must trust blindly," already responsible for one shipped unsoundness bug —
the structural-twin heap-type collision) and **functional** (findings 3–4, same two
subsystems, argued from the opposite direction: "a nominal ADT never has this problem... the
tag IS the constructor name chosen at declaration time"). Two lenses with opposite starting
aesthetics (minimalism vs. type-theoretic purity) independently priced the same two subsystems
as expensive, and independently proposed the same alternative (nominal closed sum types).

**Status: a chosen tradeoff, not a defect** — see below. VL is foundationally structural
(struct heap-type dedup, `A14`'s forward-compat design, and most of `std` lean on it), and both
critiques concede a nominal retrofit is a different language, not a patch. Recorded here as the
review's clearest instance of "two independent hostile readings converge on the same complaint
about a foundational choice," which is exactly the kind of signal this synthesis exists to
surface, without recommending VL reverse course.

### 4. SIMD's closed, width-suffixed naming family has no shared hook once a second width or shape family shows up

Hit by **C#** (finding 2: WASM's SIMD story has already grown once inside VL's own design doc —
relaxed SIMD landed after baseline SIMD's 2021 phase-5 — so treating "one width forever" as
settled is a bet, not a fact; a future `F32x8` needs entirely duplicated, hand-written names)
and, from a different angle, **Swift** (finding 9: with no generics and no namespaces, every
op needs one uniquely-spelled function per lane-shape, which is the identical naming-explosion
cost C# is pricing against a future width rather than against today's ergonomics).

**Status: the naming-explosion half is already being fixed by work in flight, though not
because of this review** — `docs/internals/type-bound-ufcs-design.md` (**#3001**, landed
2026-09-07, before this review's findings were synthesized) proposes exactly the receiver-type
dispatch that collapses "one name per shape" into "one name, dispatched by the value's own
type," and names SIMD as its own motivating consumer. It does not touch C#'s narrower
width-lock-in argument (what happens if WASM ever ships a `v256`) — that remains an open
question worth a line in `simd-design.md`'s own §E when SIMD is next touched, not a roadmap
row on its own (SIMD is all still pre-code, gated on ten owner rulings; a naming-migration
policy for a hypothetical future width is not on the critical path of any of them).

### 5. Two memory models in one language (WasmGC, plus a self-managed linear-memory tier)

Hit by **Lua** (finding 1, ranked its #1 finding: "a second, fully-general memory model with
its own allocator, its own aliasing hazards... its own bounds-check policy"), **game**
(finding 4: "arbitrary entity lifetime **or** zero-GC-pause allocation — pick one, VL does not
offer both together" — the same tension from a workload angle), **Rust** (the whole of its
review is spent inside the consequences of this tier existing), and **numerics** (finding 5:
`Buffer`'s views are the only contiguous storage VL has, and they're 1-D-only with no
strided/2-D helper). Four lenses, from safety, workload, minimalism and performance angles,
all land inside the same architectural seam.

**Status: a chosen, documented tradeoff, not a defect** — see below (`DECISIONS.md`, "No
second, self-managed object model — linear memory stays ONE scoped tier," names the cost
explicitly and gives the one case that would justify more: non-GC engine targets). Recorded
here because four independent hostile readings landing on the same seam is worth knowing even
when the owner has already ruled on it; it is not filed as an actionable row.

### 6. Determinism has two real open edges: a cross-doc contradiction on NaN, and an undocumented silent-wrap vs. loud-trap inconsistency

Hit by **game** (finding 5: `serde-critique-crosslang.md` and `webcraft-requirements.md` gave
opposite guidance on NaN-payload canonicalization) and **numerics** (finding 6, independently
citing the identical contradiction, plus a second: `2147483647 + 1` wraps silently and
undocumented while `2.5 as! i32` traps loudly, "the single sharpest inconsistency in the whole
numeric story").

**Status: RULED, same day.** `docs/internals/numeric-determinism-rulings.md` (**#3002**,
landed 2026-09-07) closes both: standard-op NaN bit-pattern determinism is reframed as a
measured cross-engine engineering commitment rather than a spec guarantee (reconciling
`simd-design.md` §A4 against `serde-design.md` OQ-3, both doc-edited with a pointer to the
reconciled rule), and integer `+`/`-`/`*` wraparound is now documented in `docs/guide/operators.md`
alongside the previously-undocumented `i32.MIN / -1` trap. Nothing left to file.

## Real problems vs. chosen tradeoffs

The eight lenses do not distinguish "VL got this wrong" from "VL chose this and the choice has
a real, named cost" — an adversarial review's job is to find the cost either way. This
synthesis draws the line explicitly, because filing a philosophical disagreement as a bug
wastes a roadmap row and re-litigates a ruling nobody asked to reopen.

**Chosen tradeoffs — VL made a considered call, the cost is real, and reversing it is a
different language, not a fix:**

- **Two memory models** (convergence #5 above). `DECISIONS.md` names the cost and the one
  condition that would justify more (non-GC engine targets). Not filed.
- **Structural typing over nominal ADTs**, and everything downstream of it — three union
  runtime encodings, a global structural tag registry, flow-sensitive narrowing standing in
  for pattern-matched `Option<T>` (convergence #3 above). VL's structural type system is
  foundational; both lenses that raised this concede a nominal retrofit is a different
  language. Not filed.
- **Null + narrowing over `Option<T>`+`match`** (functional finding 4). Same shape as the
  above, argued from mutability rather than representation: a flow-sensitive analysis
  standing in for a value that would need no invalidation story. VL's whole surface (`?.`,
  `??`, `is`) is built on this. Not filed.
- **No purity/effect/ownership discipline; five different aliasing behaviors share one type**
  (functional finding 5). A real, named cost of choosing reference semantics with mutation —
  a legitimate, common choice (Java/JS/Python/Go all make it), and retrofitting either
  immutable-by-default or an ownership discipline is "asking for a different language's memory
  model, not a patch," in the critique's own words. Not filed. (`readonly T[]`, landed
  2026-09-06, is VL's one cheap step in this direction and is already shipped.)
- **std has no deprecation mechanism** (C# finding 1, critical). CLAUDE.md already states this
  plainly as a known, standing cost, mitigated by `std-api-review.md`'s pre-merge gate rather
  than a retraction channel. C#'s proposed mitigation (a checker-owned `retiredExports`
  redirect table plus a ratcheted `std-export-marked-retiring` lint, modeled on the
  `stdFmtMovedNote` special case VL already hand-built once for `toString`/`toStr`) is a
  genuinely cheap, aesthetic-compatible idea worth a future owner ruling, but it is a
  standing-policy question, not a defect with a fix to file — left here as a pointer rather
  than a row.
- **WASM SIMD assumed permanent at 128 bits, no reserved generic seam** (convergence #4's C#
  half). A defensible bet given the target, explicitly named as a bet by the critique itself.
  Worth one sentence in `simd-design.md` §E when SIMD is next touched; not a row on its own.
- **Whole-program compilation and unbounded monomorphization**, and **the rep-descriptor
  campaign's five-producer reconciliation** — both real, both hard, both flagged as strategic
  items below rather than tradeoffs stated-and-closed, because unlike the items above, nobody
  has actually ruled on these; they're unexamined bets, not examined ones.

**Real, actionable findings — filed as ROADMAP rows below:**

- `Buf` is a forgeable, aliasable structural record with no newtype brand (row 35).
- `memory.grow`'s silent host-view detachment was already ruled on once (O5, "no epoch
  export") — filed as a request to *reconsider* that ruling with the sharper argument this
  review adds, not as an unexamined gap (row 36).
- `docs/guide/soundness.md`'s absolute contract wording, and one now-stale worked example in
  it (row 37).
- No "did you mean" for an undeclared identifier or an import-not-exported name (row 38).

## Status of the loudest findings — what this review already drove

Four items the eight critiques raised were independently fixed, ruled, or designed the same
day the reviews were read, before this synthesis was written. Recorded here so the doc shows
what was acted on, not filed and left:

| finding | lens(es) | status | landed as |
| --- | --- | --- | --- |
| inferred-return totality: a non-exhaustive `is`-chain skips the checker's own soundness rule when the return type isn't annotated | functional (fresh live repro, CRITICAL) | **FIXED** | `docs/internals/inventory/D1950.md`, #3000 |
| NaN bit-pattern doc contradiction (`simd-design.md` vs. `serde-design.md`/`webcraft-requirements.md`) | game, numerics | **RULED** | `docs/internals/numeric-determinism-rulings.md`, #3002 |
| integer `+`/`-`/`*` overflow silently wraps and was undocumented | numerics | **RULED** | `docs/internals/numeric-determinism-rulings.md`, #3002; `docs/guide/operators.md` |
| float→int cast policy (trap vs. saturate vs. wrap) was a three-way open fork | game, numerics | **RULED** (trio stays; saturation is a std helper, not a fifth `as`) | `docs/internals/numeric-determinism-rulings.md`, #3002 |
| `std:math` absence — `exp`/`sin`/`cos`/`pow`/`atan2` etc. all `undeclared identifier`, blocking softmax/sigmoid/any ML activation | numerics (CRITICAL) | **DESIGNED** | `docs/internals/std-math-design.md`, #3002 |
| UFCS flat-namespace tax — `std:buffer`'s 44 exports and SIMD's proposed ~60 each need per-name imports; operators can't be declared per-receiver-type at all | Swift (findings 2, 9) | **DESIGNED**, scheduled (ROADMAP row 33) | `docs/internals/type-bound-ufcs-design.md`, #3001 |

The UFCS row is the one worth a caveat: #3001 is a *design*, not yet built, and its own §G is
what would generalize `"+"`/`"add"` dispatch to a per-receiver-type operator declaration (the
"receiver-keyed operator fix" the review's authors anticipated) — that generalization is
proposed but still needs the owner ruling §K lists, and the discoverability half (a "did you
mean" for a UFCS member that isn't imported, §J) is explicitly scoped as a follow-up in the
same document. Neither is built yet; both are correctly described as designed, not shipped.

## Filed: still-open actionable findings

Each row below was verified live against this checkout before filing (`dist/vl`, commit
`71b1575af`) — none restates something today's work already closed.

### Row 35 — `Buf` is a forgeable, aliasable structural record

**Lens: Rust (severity 1).** `std/buffer.vl:13` declares `export type Buf = { base: i32, length:
i32 }` as an ordinary structural record. Verified live:

```vl
import { Buf, storeI32, loadI32 } from "std:buffer"
const forged: Buf = { base: 0, length: 65536 }
storeI32(forged, 100, 0xDEADBEEF as i32)
print(loadI32(forged, 100))
```

`vl check` accepts this with zero errors (one redundant-annotation hint); `vl run` executes
both the write and the read (`-559038737`), reading and writing memory the program never
allocated. `docs/internals/buffer-design.md` §L2b already diagnosed the mechanism and the fix
when the *view* types (`F32View`/`I32View`) hit the identical hazard: making the type a `new`
newtype closed it there, byte-identically, and 12 bytes smaller per view, per the doc's own
measurement table. §L2b's own words: "the same argument still says `Buf` itself... is not a
newtype. That is pre-existing and unchanged... the fix is now a one-word edit." `Buf` is the
one type in the tier that never got the fix its own sibling types proved out.

### Row 36 — reconsider O5: `memory.grow` detaches every host view with no detection signal

**Lens: Rust (severity 2).** `buffer-design.md` §B5/O5 already considered and ruled against an
epoch export ("RULED (i), lazy growth, and NO epoch export... none of [Emscripten/wasm-bindgen/Go]
exports a counter, so (iii) would be VL inventing a convention no host expects"). This is not
an unexamined gap — it is a real ruling with cited precedent, and the case for reconsidering it
is narrower than "nobody thought of this": the critique's sharper point is that a Rust host
gets this hazard caught at compile time for free (`Memory::data` borrows the `Store`), while
every VL-target host is JS, where the *existing* convention (check `byteLength === 0` after any
call that might allocate) is easy to get right once and silently regress six months later when
an unrelated code path starts allocating. The fix costs one monotonic `i32` global and one
export, and it would not remove the existing `byteLength === 0` contract — a JS host could keep
using either signal. Filed as a request to revisit O5 with this framing, not to overturn it
unilaterally.

### Row 37 — `docs/guide/soundness.md`'s absolute wording, and one stale worked example

**Lenses: Lua, compiler, functional (convergence #1), Rust.** The guide's headline — "Every
well-typed VL program is type-safe at runtime" — is stated with no hedge, and its own "Known
unsound corners" section names container element variance as the live example, in words that
are now factually wrong. Verified live:

```vl
type Animal = { name: string }
type Cat = { name: string, meow: boolean }
function feedAll(as: Animal[]) { as.push({ name: "generic" }) }
const cats: Cat[] = [{ name: "Felix", meow: true }]
feedAll(cats)
```

`docs/guide/soundness.md` currently says this is "silently accepted and emits invalid wasm."
It is not: `vl check` refuses it loudly (`an object value of shape Cat flowing into Animal...
type-valid (structural width subtyping) but not yet supported by codegen`) — a clause-2
capability refusal, not a clause-1 silent miscompile, and already tracked as ROADMAP's ranked
item 20 (A9). The doc's specific claim is stale (better than it says, not worse), but the
surrounding wording problem the four lenses independently raised is real and separate from
this one example: the headline's absoluteness gives a reader no way to learn, from the guide
itself, that a `vl check`-clean program can still be refused at build time for a reason that
has nothing to do with runtime type safety (CLAUDE.md's own clause-2 population, ~226–390
reachable emit-refusal sites by two independent witness samples). Fix: correct the stale
example, and add one paragraph distinguishing the clause-1 guarantee the doc actually proves
from the clause-2 population it doesn't mention at all, with a pointer to where that population
is tracked. Docs only.

### Row 38 — no "did you mean" for an undeclared identifier or an import-not-exported name

**Lens: Swift (findings 1, 3).** VL already ships two "did you mean" mechanisms — `tyDidYouMean`
for unknown type names (D1590) and `methodDidYouMean` for a missed method call on a
string/array/map receiver (D1599) — both landed in response to real external-consumer reports.
Verified live that the same mechanism does not exist at two of the sites the critique names:

```
$ vl check t3.vl   # import { Buffer, storeU8 } from "std:buffer"   (storeU8 doesn't exist; store8 does)
[ERROR]: "storeU8" is not exported by "std:buffer"                  # no suggestion

$ vl check t4.vl   # import { Buffer, loadI33 } from "std:buffer"   (typo for loadI32)
[ERROR]: "loadI33" is not exported by "std:buffer"                  # no suggestion

$ vl check t5.vl   # function f(x: i32): i32 {...}; print(fF(3))    (typo for f)
[ERROR]: undeclared identifier 'fF'                                 # no suggestion
```

Both are single-character edits from a real name in scope. The import-not-exported message is
built at exactly one site (`compiler/driver.vl:3574`) with no suggestion machinery at all; the
undeclared-identifier message (`compiler/typecheck.vl:26842`) likewise has none. This is
distinct from, and narrower than, the UFCS-member "did you mean" gap `type-bound-ufcs-design.md`
§J already designs as a follow-up to #3001 (that one is for a member access on a value whose
type is known, e.g. `b.loadi32(0)`; this row is for a bare name or an import specifier, which
have no receiver type to search). Not tracked anywhere in ROADMAP.md today. D1590/D1599 are the
direct precedent for the fix shape: an edit-distance search (`tyEditDist`) over the plausible
candidate set (module exports for the import case, in-scope bindings for the identifier case),
suffixed onto the existing message.

## Strategic items — for a future design session, not a ticket

Two findings are architectural, hard to act on cheaply, and important enough that filing them
as an ordinary roadmap row would understate them and inviting a quick fix would likely make
them worse. Both come from the compiler-architect lens; both are stated fairly, including the
case for the choice VL already made.

**1. Whole-program compilation plus unbounded monomorphization, as a scaling bet with no
ecosystem yet to test it.** VL merges every `.vl` file into one arena, type-checks it together,
and monomorphizes generics globally with no separate-compilation escape hatch —
`modules-design.md` rejects wasm-linking by name as complexity "VL does not need." The
compiler-architect lens's case: this is the right choice *for a language that also has separate
compilation* (Rust ships full monomorphization, but crates compile and cache independently);
VL took monomorphization's downside (unbounded code generation, unbounded rebuild scope) without
the one thing that makes it survivable at scale. This is not hypothetical stress that hasn't
arrived — the compiler is itself the largest VL program (~160K lines), whole-program-compiled
on every commit, and CLAUDE.md's own record of already-shipped defenses (`arena-scan-outside-pass`,
the scaling-shape test suite, the `self-compile-time.sh` tripwire, D1090's 32s→321s incident) is
a team already firefighting whole-program non-linearity at "tens of files," before any package
ecosystem exists to generate the workload that would really test the bet. Fair to VL: nobody
has actually needed separate compilation yet, and building it speculatively has its own real
cost. This is exactly why it belongs in a deliberate design conversation once real multi-package
programs exist to measure against, not in a sprint.

**2. The rep-descriptor campaign as a symptom, not (only) a cleanup.** "What representation does
this value have?" is answered independently at 519 call sites by five different producers,
reconciled today by a runtime agreement oracle rather than by construction
(`docs/internals/rep-descriptor-campaign.md`). The compiler-architect lens's root-cause claim:
this is downstream of WasmGC's heap types being *nominal* while VL's type system is
*structural* — "the emitter's hardest machinery exists to make wasm's nominal heap types carry
VL's structural types" (`memory-gc-design.md` §1.1) — and the campaign, however well-run (it is:
2,068 lines, an explicit non-goal of trusting byte-identity for domain-removing changes,
real measured contradiction counts), is reconciling 519 independent answers to one question
rather than replacing them with one materialized answer per node in a real lowering IR. The
campaign is the right near-term move (it is already owner-approved and in flight, and a
foundational IR change is not something to interrupt it for) — it is flagged here because the
review's own numbers (eight `tests/cases` modules flipping `rc=0 → rc=1` from a change that
"reads like a strict improvement," a single ladder-trim taking the oracle's contradiction count
from 2,963 to 204,539) are the kind of signal that the *representation model itself*, not just
its 519 call sites, deserves a deliberate look once the campaign's reconciliation work settles.

## Per-lens summaries

**Rust / memory-safety** (full review: [`rust-memory-safety.md`](design-review-2026-09/rust-memory-safety.md)).
Sharpest findings: `Buf` is forgeable from two bare integers with no cast and no `unsafe`
marker (row 35), and `bufferRelease`'s LIFO reclamation creates a true, silent, unprevented
dangling reference — a `Buf` held across a release reads a since-reused region's bytes with
"no trap," pinned as expected behavior by the repo's own fixture. Both are real costs of a
tier the project is otherwise unusually honest about in its own design docs.

**Swift / ergonomics** (full review: [`swift-ergonomics.md`](design-review-2026-09/swift-ergonomics.md)).
Sharpest findings: UFCS forces enumerating every method name into an import list, which is
already the worst possible fit for `std:buffer` (44 exports) and would be worse for SIMD's
proposed ~60 (now being addressed by #3001, not yet shipped); and VL's diagnostics have no
general "did you mean," which compounds the first finding and is filed narrower above (row 38).

**C# / evolvability** (full review: [`csharp-evolvability.md`](design-review-2026-09/csharp-evolvability.md)).
Sharpest findings: std's total absence of a deprecation mechanism is already turning into a
standing conservatism tax (two named cases in `DECISIONS.md` of a useful API declined *because*
it can't be taken back) rather than merely a risk; and `flat`'s "subtracts nothing" founding
invariant already broke once for sub-word fields, with no checker-visible way for a future
consumer to ask which side of the split a given `flat` type is on.

**Lua / minimalism** (full review: [`lua-minimalism.md`](design-review-2026-09/lua-minimalism.md)).
Sharpest findings: two memory models where a minimalist ships one (convergence #5), and the
soundness contract's own document contradicts its headline claim two sections later
(convergence #1) — both argued from "what does this let you delete elsewhere," the harshest
and most literal reading of the assignment's brief.

**Game programmer / determinism** (full review: [`game-determinism.md`](design-review-2026-09/game-determinism.md)).
Sharpest findings: zero SIMD today means a scalar VL loop is realistically ~16x behind a
16-wide AVX-512 kernel, not "4x behind" as the motivating estimate frames it; and VL's memory
story forces a choice no shipping engine should have to make — arbitrary entity lifetime on an
unmeasured-pause GC heap, or LIFO-only reclamation with silent corruption on misuse, with no
generational/pooled allocator offered as a third option.

**Compiler architect** (full review: [`compiler-architecture.md`](design-review-2026-09/compiler-architecture.md)).
Sharpest findings: the two strategic items above (whole-program monomorphization with no
separate-compilation escape hatch; the rep model's 519-site reconciliation standing in for a
materialized per-node representation) — both argued from what a serious compiler's IR pipeline
usually looks like (rustc's THIR→MIR, Swift's SIL, GHC's Core), and both correctly conceded to
be hard, not obviously wrong, choices.

**Numerics / ML** (full review: [`numerics-ml.md`](design-review-2026-09/numerics-ml.md)).
Sharpest findings: `std:math` is completely absent — `exp`/`sin`/`pow`/`atan2` are all
`undeclared identifier`, which disqualifies softmax, sigmoid, or any activation past ReLU
outright, not merely "harder than it should be" (now DESIGNED, #3002); and the exact-or-fail
cast trio has no `clamp`, so ordinary int8 quantization — the single most common numeric-kernel
operation — hand-rolls a guard or traps the whole process on the first out-of-range activation.

**Functional / type-theory** (full review: [`functional-type-theory.md`](design-review-2026-09/functional-type-theory.md)).
Sharpest findings: a fresh, live-reproduced soundness bug in the totality checker's
inferred-return path (now FIXED, D1950/#3000) — found by testing the one case the guide's own
examples never show; and the checker/emitter gap restated in the sharpest type-theoretic terms
this review offers: "the type checker's accept-set" and "the code generator's total-function
domain" are not proven to coincide, which is precisely the failure mode a sound type system
exists to rule out, softened only by the fact that VL's failure mode is a loud abort rather
than silently wrong data.
