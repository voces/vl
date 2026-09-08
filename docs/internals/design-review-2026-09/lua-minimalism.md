# VL is not a small language — a Lua-tradition adversarial review

Reviewer stance: minimalism as a discipline. A feature earns its place by what it lets you
delete elsewhere, not by what problem it happens to solve for one caller. Judged against
that bar, VL is not settling into a small core with a library on top; it is accreting
orthogonal subsystems, each defensible in isolation, each adding a permanent tax on every
future line of the compiler and every future learner. Ranked worst first.

Numbers used below, all measured against the checked-out tree (2026-09-07):
`compiler/*.vl` = 159,610 lines (`typecheck.vl` 36,391, `emit_classify.vl` 35,297,
`wasmEmit.vl` 23,922, `emit_collect.vl` 11,762); `docs/internals/*.md` = 101 files;
`DECISIONS.md` = 5,960 lines / 63 ruling sections; `docs/internals/open-rulings.md` =
1,547 lines; filed defect inventory = 880 + 19 rows across two directories, with its own
`ls.py`/`split.py`/`check-filed-witnesses.py` tooling to keep track of itself; the release
CLI (`dist/vl`) is 28 MB; the compiled compiler seed (`build/vl-compiler.wasm`) is 2.36 MB;
`git log` shows 3,297 commits total, 972 in the last 7 days, 213 on a single day
(2026-09-01), and of the last 1,000 commit subjects 400 start `fix` against 151 `feat`/`add`
— roughly 2.6 fix commits for every 1 feature commit.

For contrast, the whole of Lua 5.4's reference implementation (lexer, parser, bytecode VM,
GC, and standard library) is about 20,000 lines of C, and the interpreter embeds in ~200 KB.
VL's type checker ALONE is 36,391 lines, before codegen exists.

---

## 1. Two memory models in one language — WasmGC plus a self-managed linear-memory tier

**The excess.** VL ships a "one object model" ruling in `DECISIONS.md` ("No second,
self-managed object model — linear memory stays ONE scoped tier") and then builds exactly
that second tier anyway: `Buffer`/`Buf`, a hand-rolled bump allocator in `std/buffer.vl`,
typed views (`F32View`/`I32View`, then superseded by newtype-branded views), raw
`__load_i32__`/`__store_i32__` intrinsics with no bounds checking, a widening width matrix
(i32/i64/f32/f64 load/store, then bulk `memory.copy`/`memory.fill`), `flat` record layouts
addressed over it, and now a SIMD vector library that can *only* operate on this tier because
`v128.load`/`store` cannot touch a WasmGC array at all (`simd-design.md` §A2: "There is no
instruction that reads a v128 out of a WasmGC (array i8)"). That is not a scoped escape
hatch, that is a second, fully-general memory model with its own allocator, its own aliasing
hazards (`memory.grow` "silently detaches every host view" — `buffer-design.md` §B5), its
own bounds-check policy (engine trap, no checked default), and its own composition rules with
every other feature (`flat`, SIMD, newtypes-as-views).

**Why it fails "earns its complexity."** `memory-gc-design.md` §3 states the actual price
out loud and then pays it anyway: WasmGC is what lets an emitter type-confusion bug fail
loudly as "an un-instantiable module" instead of silent corruption — and that is not
hypothetical, the same document cites a real "structural twin soundness bug" from
`DECISIONS.md` that was caught *only* because the wasm validator refused the module. The
`Buffer` tier throws that guarantee away by design (`__store_i32__`/`__load_i32__` have no
bound check; a `flat` row address has "none, deliberately" per `flat-records-design.md` §9.5)
for exactly the code that most needs it — hand-computed byte offsets. A minimalist language
picks one memory discipline and lives inside its limits; VL picks two and asks the programmer
to know, at every call site, which one they are in and what safety net (if any) applies there.

**What a minimalist cuts.** Ship WasmGC only. No `Buffer`, no `flat`, no SIMD library (SIMD is
entailed by the linear-memory tier per the design doc itself — kill one, the other has no
home). Bytes-in/bytes-out interop with a host (the actual FFI need) is served by a `T[]`/
`u8[]` argument marshaled at the import boundary, the way every GC'd language talks to a
byte-oriented host.

**What's lost.** The veldt/webcraft consumers' SIMD kernels and byte-exact Lua-VM-layout
port lose their fast path, and have to marshal through GC arrays at the WASM boundary instead
of computing addresses directly. That is a real, measured loss for those two specific
external customers — and it is also the entire justification offered anywhere in the repo
for tier two existing. No general-purpose VL program needs it.

---

## 2. `flat` — one declaration that is simultaneously a GC struct and a raw layout, stitched together with two other features to be usable

**The excess.** `flat type TValue = { value: i64, tt: i32, pad: i32 }` is, by the design
doc's own ruling (§4), "not a separate tier of value" — it is an ordinary WasmGC struct type
*and* a byte-offset descriptor, at the same time, selected by which syntax you use on it
(`v.tt` for the struct field, `TValue.tt` for the byte offset — the receiver's syntactic
shape, not its type, decides which universe you're in). The type name doubles as a
compile-time value namespace (`N.size`, `N.<field>` fold to `i32` constants), which then
collides with the ordinary value namespace: "the receiver must ... not resolve as a value
binding (a local named `TValue` wins, and shadows the layout constants)" — a plain local
variable can silently shadow the type's own metadata with no diagnostic.

Then the design doc's own §9 discovers that the ask it was built for (`stack[i].tt`, direct
index-then-field sugar) doesn't actually work with `flat` alone. Getting back to that
ergonomic requires composing **three separate features** by hand: a `flat` record for the
offsets, a `new i32` newtype branded as a `RowAddr` so the bracket operator can't be misused,
and a user-defined `"[]"` operator overload returning that branded address instead of a
value. The result still diverges from the spec's own spelling — `.tt()` with parens, not
`.tt` — because real field-position UFCS was never built, and the doc spends a full page (§9.1)
explaining why the more natural spelling is a *loud reject, on purpose*, rather than fixing
the resolver.

**Why it fails "earns its complexity."** A feature whose own author needs a page to explain
why the natural spelling of its own headline example doesn't parse, and needs three
unrelated language features hand-assembled by the *user* to reconstruct it, has not built a
struct-layout feature — it has built three narrower features and left the composition as an
exercise. The zero-cost erasure (§4, "flat is erased before the emitter runs") is a genuine
engineering win, but it's a win purchased by making the type simultaneously mean two
incompatible things, which is exactly the kind of "one syntax, two semantics selected by
context" design a minimalist refuses on sight (compare: Lua's tables are ONE thing, always;
there is no second reading of `t.x`).

**What a minimalist cuts.** Either give layout descriptors their own noun (a `Layout N { … }`
declaration that is *not* also a value type, closing off the shadowing hazard and the
dual-reading problem at the syntax level) or don't build the feature at all and let the one
external customer (a Lua-VM byte-exact port) hand-write offset arithmetic, which the doc
itself shows is only "the `16` and the `8` are hand-computed... silently wrong" as its
complaint — a lint that flags a magic-number offset near a `__load_i32__`/`__store_i32__`
call would close 80% of that gap for a tenth of the surface.

**What's lost.** Self-documenting offset constants for the one customer (a Lua bytecode VM
port) who needs to match a foreign, hand-specified layout byte-for-byte. That customer is
real but is not "VL users" — it is one port.

---

## 3. Flow narrowing — a full type-algebra subsystem that exists to make static unions bearable to write

**The excess.** `docs/guide/narrowing.md` documents a dedicated intersect/subtract type
algebra (`intersectType`/`subtractType`, real `Intersection`/`Negation` type nodes),
a scope-stack overlay for names, a *second*, *separate* overlay (`narrowedPaths`) for
property paths, per-branch join semantics that differ for names vs. paths vs. loop bodies,
accumulating post-guard subtraction across `if`/`else if` chains that stops at the first
non-diverging arm, and a special-cased substitution rule for generic type parameters so `is T`
means something different depending on monomorphization. This is not a small feature; it is
a shadow type system riding on top of the primary one, entirely to make `T | U` tolerable to
use without a `match`.

**Why it fails "earns its complexity."** The guide's own "what narrows" section reads like a
list of footguns a user must memorize: a write inside a *nested* block does not re-narrow,
but a write inside a non-nested one does; a narrowing on a bare name survives a loop back-edge
differently depending on whether the guard came from the loop head or an *enclosing* `if`; a
call in either arm of a branch silently invalidates a place's narrowing with the join
"declining rather than handing the fact back" — silently, from the user's point of view, the
type just gets wider than expected and a use-site error appears somewhere else. This is
precisely the class of "feature that requires a mental model of the *compiler's* internals to
predict" that a minimalist forbids on principle — Lua has none of this because it has no
static union to narrow.

**What a minimalist cuts.** Drop static exhaustiveness/narrowing as compiler machinery.
Either (a) keep unions but require an explicit `match`/`is` dispatch with a runtime tag read
at every use (no compiler-tracked "the type narrows in this branch" fact — the user reads a
tag and calls a typed accessor, same cost as narrowing today, but no invisible state machine
to predict), or (b) don't make narrowing exhaustive-checked at all and accept a runtime
"wrong variant" trap the way a dynamic language would, which is the actual VL fallback anyway
whenever narrowing can't prove something (the guide's answer to nearly every hard case is "the
join declines" → a use-site type error the user has to work backward from).

**What's lost.** The genuinely nice cases — `if x != null { … }`, `if x is T { … }` reading
straight through without a manual cast — would need an explicit unwrap call instead. That is
real ergonomics lost for the easy 80% of narrowing use, to avoid the footguns in the other 20%.

---

## 4. Three different runtime encodings for one surface type (`A | B`), chosen invisibly

**The excess.** `docs/guide/unions.md`: a union value can be a bare nullable ref (niche), a
`{tag: i32, value: <rep>}` value-kind-tagged struct, or a `{tag: i32, value: anyref}`
boxed-tagged struct — decided by "the representation classifier" based on the members'
lowered wasm types, invisibly to the user. On top of that sits a *global* tag registry keyed
on a field-name-aware structural signature (`structSig`), specifically to avoid a real bug
class where WasmGC's structural type-erasure would collapse two same-shape-different-name
structs into one heap type and make `is A` wrongly true for a `B`.

**Why it fails "earns its complexity."** This is a correctness-critical subsystem the user
cannot see and must trust blindly, and it has already produced a real, shipped unsoundness
bug (the "structural twin" bug cited in `DECISIONS.md`, caught by luck — the wasm validator
happened to reject the miscompiled module). A representation choice that (a) the user cannot
observe or reason about, (b) requires a *global* registry to stay sound as values flow between
related unions, and (c) has already broken once in exactly the way this kind of hidden
machinery breaks, is the opposite of "the whole language fits in your head." Compare Lua: a
table is a table; there is no invisible classifier deciding whether *this* table gets boxed
today.

**What a minimalist cuts.** Pick ONE representation for every union — boxed-tagged, always.
Slower for the niche/value-kind cases (no `null`-as-union-member optimization, always an
allocation for `i32 | boolean`), but uniform, and it deletes the classifier, the global tag
registry, and the entire class of bug the classifier exists to prevent.

**What's lost.** The zero-cost `T | null` niche encoding (which most users benefit from
constantly and would probably vote to keep) and the scalar-value-kind fast path that Heap2Local
usually erases anyway. This is the one item on this list where the cut has a real, felt
performance cost for the common case — which is exactly why it's ranked here rather than #1:
it is expensive complexity, but it is complexity that is at least *earning* something
measurable, unlike most of the rest of the list.

---

## 5. SIMD as a std feature: 8+ nominal vector types, 2 mask types, ~60 intrinsics — for one external consumer, before the win is measured

**The excess.** `simd-design.md` is 598 lines proposing `F32x4`/`F64x2`/`I32x4`/`U32x4`/
`I16x8`/`I8x16`/`U8x16`/`I64x2` plus `Mask32x4`/`Mask8x16`, a `v128` primitive scalar rep, a
new `0xFD`-prefixed instruction family in the emitter, ~60 named intrinsics, and *ten* open
owner rulings (O1–O10) still to be decided before a line of it is built. It exists because one
external consumer (veldt, a voxel/rigid-body engine) estimates it is "~4x off" without it.
The doc's own §H concedes: **"The actual speedup on veldt's kernels... 'the real number is
S3-gated'"** — i.e. the entire justification for the feature is an unverified estimate from
the one customer asking for it, and even the design doc's authors know that.

**Why it fails "earns its complexity."** This is textbook scope creep: a single downstream
project's performance guess becomes a permanent addition to the language's std surface —
new nominal types, a new wasm-scalar rep threaded through locals/params/returns, a whole
opcode family in the emitter — gated on ten unresolved design questions, before the number
that justifies it has been measured against real data. And it doesn't stop at the vector
core: §F O7 already proposes a follow-on `std:vec` graphics layer (`Vec3`/`Vec4`/`Mat4`,
`.xyz` swizzles, `dot`/`cross`) "on top," because one consumer's math is graphics-shaped. The
design doc itself is honest that this is chasing one consumer (§ "The ask" — veldt names it
"ask #1"), which is the definition of scope creep, not "the language grew a needed
capability."

**What a minimalist cuts.** Don't build a `std:simd` at all. If a program needs raw `v128`
speed, let it drop to `extern` and call a host-provided SIMD kernel written in whatever
language the host already has good SIMD codegen for (Rust/C compiled to wasm, linked via
`memory.copy` of the `Buffer`). That is strictly less work than building and maintaining ~60
intrinsics, a new emit family, and a still-undesigned graphics layer inside VL itself.

**What's lost.** veldt's rigid-body solver and voxel passes stay ~4x slower without a
hand-written scalar loop, and lose the ability to write the kernel in VL at all (they'd need
an external, separately-compiled wasm module). That is a real cost to exactly one named
customer, and zero cost to everyone else.

---

## 6. The soundness contract is false today, in the same document that states it

**The excess/defect.** `docs/guide/soundness.md` opens with: **"Every well-typed VL program
is type-safe at runtime"** stated as *the contract*, no hedge. The same document's closing
section admits: **"Container element variance is the live unsound corner and is not pinned
here at all: a `Cat[]` flowing into an `Animal[]` parameter is silently accepted and emits
invalid wasm."** That is not a diagnostic gap or a missing feature — it is the headline claim
being false, admitted in the same file, with no test pinning it as `xfail-unsound-*` (the
document's own mechanism for tracking exactly this class of gap), because the document says
outright there are currently zero such files.

**Why it fails "earns its complexity."** A soundness claim this absolute, backed by a
narrowing subsystem (#3) and a three-way union representation (#4) built specifically to keep
that claim true, and *still* false on a case as basic as array element variance, means the
enormous machinery above is buying a guarantee the language doesn't actually deliver. A
minimalist's objection here isn't "don't have types" — it's "don't sell a guarantee your own
docs contradict two pages later." Every one of the heavyweight subsystems above (#3, #4) is
partly justified by "this is what makes VL sound"; that justification is weaker than it
appears.

**What a minimalist cuts.** Nothing new — this is a call to either (a) stop stating the
contract as absolute until it is, or (b) treat container covariance as `P0`, not a filed
row among 880 others. Listed here because it undercuts the ROI calculation on items #3 and
#4: complexity bought for soundness that isn't fully delivered is complexity bought at a
loss.

---

## 7. Four cast spellings (`as` / `as?` / `as!` / `as%`), plus a byte-width domain that isn't a type, plus a parser special case to keep `%` unambiguous

**The excess.** `docs/guide/operators.md`: four distinct cast suffixes with three genuinely
different failure behaviors (propagate-null-through-caller, produce-`| null`, trap), plus a
fourth (`as%`) that wraps instead of checking, plus `u8` which "names a byte-sized range, not
a value type" — meaning `bytes.push(300)` silently truncates to 44 with **no** diagnostic,
while `300 as! u8` **traps** on the exact same value, in the exact same file, and the guide
has to spend a paragraph telling the reader which of the two answers a given piece of code
will get. On top of that, the grammar needs a dedicated disambiguation rule so that `a as% u8
% b` reads correctly and a variable literally named `as` still works — "the suffix is read
only directly after `as`... and `as` only directly after a postfix operand."

**Why it fails "earns its complexity."** Two different answers (silent truncate vs. loud trap)
to the identical question ("is 300 in range for `u8`?"), disambiguated only by which of two
call-site spellings you happened to use, is the canonical least-surprise violation. A grammar
rule whose entire purpose is "don't let `%` after `as%` collide with the modulo operator" is a
tell that the surface has more spellings than the grammar comfortably supports.

**What a minimalist cuts.** One cast form (`as`, returning `T | null`, no trapping variant —
callers who want to trap write `x as T ?? panic()` once a panic/abort primitive exists) and no
`as%`; a wrapping narrow is a named function (`wrapU8(x: i32): i32`), not new syntax and not a
grammar special case. Keep `u8[]`'s truncating store as the sole byte-narrowing behavior and
delete the competing cast-side range check entirely — one truncation rule, not two.

**What's lost.** The exactness guarantee `as!`/`as?` give (fail loud/fail soft on inexact
float→int or out-of-range casts) becomes a library convention instead of a language guarantee,
and the ergonomic single-token spelling of "wrap to this width" becomes a function call. Minor
loss, since the four-way split is mostly serving symmetry with itself rather than a proven
need.

---

## 8. Contextual keywords as a scaling liability — every one is a tax paid by four unrelated scanners, and it has already caused a bug

**The excess.** VL avoids reserving words by making `new`, `flat`, `readonly`, and `until`
context-sensitive — recognized only in one syntactic position, ordinary identifiers
everywhere else. `flat-records-design.md` documents, in its own words, that this is not free:
`driver.vl`'s **token-level** module-export scanner (`modScan`) doesn't call the parser, so it
had to be taught the `flat` pair by hand — and until it was, `export flat type TValue = …`
silently **failed to register as an export at all**, producing "`TValue` is not exported by
`./lib`" on a line that plainly says `export`. The doc names this as a *pattern*: "a
contextual keyword has to be recognized by every scanner that reads the declaration form, not
just by the parser, and a token-level scanner cannot ask the parser what it decided." That is
four sites per keyword (parser, formatter, LSP highlighter, module scanner) that must be kept
in lockstep by hand, forever, with no compiler-enforced check that a fifth scanner won't be
added later and miss the memo.

**Why it fails "earns its complexity."** This is a scaling cost with a demonstrated failure
mode, chosen specifically to avoid the *appearance* of adding keywords — but a real reserved
keyword costs a one-line lexer table entry and a one-time audit for uses-as-identifier (which
the design docs themselves measure as "zero occurrences" every time, because these are rare
English words). The contextual-keyword approach was chosen to save a cost that was already
measured to be near-zero, and it bought a recurring, structural bug class instead.

**What a minimalist cuts.** Reserve the words. `new`, `flat`, `readonly`, `until` become hard
keywords; any of the "zero occurrences in the corpus" programs that used them as identifiers
(there are none, per every one of these docs) rename, and the four-scanner synchronization
problem disappears permanently, for every future keyword too.

**What's lost.** Nothing measurable — the documents' own corpus scans found zero live uses of
any of these words as identifiers.

---

## 9. `until` alongside `to` — two range keywords to route around a self-inflicted off-by-one trap, with the trap left standing

**The excess.** `for i in 0 to a.length` traps on its last iteration, because `to` is
inclusive and the natural "iterate every index" idiom needs exclusive-upper-bound semantics.
Rather than make the common case (index iteration) the safe default, VL adds a **second**
range keyword, `until`, specifically to be the exclusive form, plus a `warning`-tier lint that
watches for the exact shape `<lo> to <expr>.length` and nudges the user toward the new
keyword. The original trap-on-last-iteration behavior of `to` is retained, unlint-flagged, in
every other shape.

**Why it fails "earns its complexity."** This is complexity added to avoid breaking backward
compatibility with a design decision (`to` inclusive by default) that, by the project's own
admission (a lint had to be built to route people away from it), was the wrong default for
the dominant use case. A minimalist doesn't add a second keyword to defend a bad default; a
minimalist fixes the default and pays the one-time migration cost while the userbase is still
small enough for it to be cheap (VL's userbase, per this repo, is currently one to a handful
of named external consumers).

**What a minimalist cuts.** Make `to` exclusive (matching the dominant use), rename the
occasional inclusive need to an explicit `through` or drop it and let the rare closed-range
caller write `to n - 1`... n` by hand. One keyword, one semantics, no lint required to steer
users away from the default spelling of the loop they'll write most often.

**What's lost.** `for day in 1 to 31`-style natural, one-past-the-end-free inclusive ranges
read slightly less naturally as `1 to 32` or `1 through 31`. A genuinely small loss set
against a second permanent keyword plus a lint that exists solely to discourage the default
one.

---

## 10. The compiler-defect-tracking apparatus is itself evidence the language is still being invented, not stabilizing

**The observation.** This repo does not merely have bugs — it has built an entire
second engineering discipline to *manage* having bugs: an 880+19-row numbered defect
inventory with its own directory-per-row convention, a `TEMPLATE.md`, an `ls.py` queue
tool, a `split.py` migration tool, and a `check-filed-witnesses.py` regression harness whose
own README records it found "eight of sixteen" previously-graded rows already silently
re-broken or re-fixed the first time it was run for real. Alongside it: a `docs/internals/
open-rulings.md` running to 1,547 lines of undecided design questions, a `DECISIONS.md` of
5,960 lines / 63 sections recording design reversals (several documents in this review
explicitly note "this reverses the same morning's decision"), a family of custom static
lints whose entire job is to keep the compiler's *own* pathologies from recurring
(`sentinel-index-unguarded`, `kind-ladder-incomplete`, `arena-scan-outside-pass`,
`comment-*` ratchets), and a purpose-built "distilled census" fuzzing corpus (7,565 cells)
whose own stated job is finding silent miscompiles the type system was supposed to rule out.

**Why this matters for "small language."** None of this tooling exists to serve a VL
*program author*. All of it exists to keep the compiler from regressing against itself,
across a codebase large enough (159,610 lines) and moving fast enough (972 commits/week,
213 in one day, a fix:feature ratio near 2.6:1 over the last thousand commits) that ordinary
code review stopped being sufficient. A small language with a small, settled core does not
need a bespoke defect-inventory framework, a bespoke sentinel-index lint family, or a
purpose-built census fuzzer to keep believing its own soundness claims (see #6). The
existence of this apparatus is the strongest evidence in the repo that VL is still
accreting surface area, not settling into one.

**What a minimalist cuts.** This isn't a language feature to cut — it's the tell that the
*rate* of feature and subsystem addition (flat, SIMD, newtypes, readonly views, until,
contextual keywords, three union encodings) needs to slow down long enough for the inventory
to actually shrink, rather than being managed at a stable 880-ish open rows by tooling that
gets more sophisticated every week.

---

## 11. Embeddability: VL has none of Lua's actual home-turf story

**The claim tested.** Lua's defining property is that a ~200 KB interpreter drops into any
host process, in any language, with a five-function C API (`lua_open`/`lua_pcall`/
`lua_register`/...), and runs untrusted or semi-trusted scripts with a tunable, tiny memory
footprint. VL has nothing resembling this.

- **No host-embedding API at all.** Searching the design docs for "embed" turns up only
  *VL's own std and compiled seed embedded inside the `vl` CLI binary* — i.e., "embedding" in
  this codebase means "bundling VL's runtime into VL's own tool," never "embedding a VL
  interpreter into a third party's C/Rust/Go application." `extern-design.md` — the closest
  thing to an FFI story — is exactly what any WASM-emitting language gets for free from the
  WASM import/export model; VL adds a typed surface over it, nothing more. A host that wants
  to run VL output does what it would do for output from Rust, Zig, AssemblyScript, or C via
  Emscripten: bring your own WASM engine.
- **VL's own docs concede a real portability wall.** `memory-gc-design.md` §3, verbatim:
  "WasmGC restricts VL's output to V8, SpiderMonkey, JSC and wasmtime" — a linear-memory VL
  would run on WAMR, wazero, wasm2c, and "any browser with GC disabled"; the GC-based VL that
  shipped does not. That is precisely the embedded/constrained-runtime space (game engines,
  IoT, plugin sandboxes) that Lua-style embedding targets, and VL's own design document
  states it is closed off by the memory-model choice.
- **The distribution is three-plus orders of magnitude heavier.** `dist/vl` is 28 MB (host +
  bundled wasmtime + bundled binaryen + embedded std + embedded compiler seed); the compiled
  compiler seed alone is 2.36 MB of WASM. Lua's amalgamated source is ~35 files, its compiled
  interpreter is on the order of 200–300 KB.

**Why it fails "earns its complexity."** This isn't a feature that costs too much — it's an
entire axis (embeddability) the project has not designed for at all, while its own docs
repeatedly reach for a Lua-adjacent customer (`flat-records-design.md`'s forcing use case is
literally "the Lua 5.3 VM," ported byte-for-byte) without VL itself being embeddable the way
Lua is. VL is a compile-to-WASM-bytecode *language*, evaluated as a batch-compiled artifact
you run under a general-purpose WASM engine; it is not, and does not aim to be, an in-process
scripting layer a host calls into function-by-function with a small footprint. Calling that
gap out matters because several of the heavyweight subsystems above (Buffer, SIMD, flat) are
partly justified by "a real customer's data plane," and none of them buy VL programs the
ability to actually live inside a host process the way Lua scripts do inside a game.

**What a minimalist cuts.** Out of scope for "cut a feature" — this is a gap, not an
excess — but it belongs in this review because it is the yardstick the assignment names: on
Lua's own turf, VL currently offers nothing.

---

## Summary table

| # | Excess | Cut | Lost |
|---|---|---|---|
| 1 | Two memory models (WasmGC + linear-memory `Buffer`/`flat`/SIMD stack) | Ship GC only; marshal bytes at the WASM boundary | Fast paths for 1–2 named external consumers |
| 2 | `flat` = GC struct + layout descriptor, needs 3 features hand-composed to be usable | Separate `Layout` construct, not a value type; or drop it | Self-documenting offsets for one byte-exact port |
| 3 | Flow narrowing (intersect/subtract algebra, two overlays, footgun-laden join rules) | Explicit tag read + typed accessor, no compiler-tracked narrowing state | Ergonomic unwrap in the easy 80% of cases |
| 4 | Three invisible union runtime encodings + global tag registry | One encoding always (boxed-tagged) | Niche/value-kind performance wins |
| 5 | `std:simd`: 10 types, ~60 intrinsics, 10 open rulings, unmeasured payoff | Drop it; SIMD kernels via `extern` to a host module | One consumer's ~4x, unverified |
| 6 | Soundness contract stated absolute, admitted false for array covariance in the same doc | N/A — fix the claim or the gap | — |
| 7 | Four cast spellings + a domain-not-type with two contradictory truncation behaviors + a grammar special case | One `as` form; wrapping is a named function | Symmetry, single-token wrap syntax |
| 8 | Contextual keywords (`new`/`flat`/`readonly`/`until`), four scanners each, one already caused a real bug | Reserve the words | Nothing (zero corpus collisions measured) |
| 9 | `until` added beside `to` to route around `to`'s own off-by-one trap, trap left standing | Make `to` exclusive; rename the rare inclusive need | Minor naturalness of `1 to 31` |
| 10 | An entire second engineering discipline (inventory, ratchets, census fuzzer) to manage the compiler's own defect rate | Slow feature velocity until the inventory actually shrinks | — |
| 11 | No embedding story; explicit 4-engine-only WasmGC wall; 28 MB binary | (gap, not a cut) | — |
