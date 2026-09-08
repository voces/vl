# VL `Buffer` tier — adversarial memory-safety review (Rust perspective)

Reviewer stance: I am not here to praise the design docs' honesty (which is real and
unusual — `buffer-design.md`/`simd-design.md` state most of these hazards themselves).
I am here to say what a Rust programmer loses by trusting this tier, ranked by how badly
it can go wrong and how easily. All numbered repros below were run against
`dist/vl` (commit at time of review) unless marked "from repo corpus", in which case the
program already lives at the cited path and I re-derived its behaviour from the doc/test
rather than re-running it myself.

Scope note up front, because it changes the grade of two items: **SIMD (`v128`,
`docs/internals/simd-design.md`) is a design doc only — zero compiler lines, nothing in
`std/`.** Everything about it below is "the plan re-commits to the same flaw," not "this
is live and exploitable today." `Buffer` (`std/buffer.vl`) is fully shipped and live.

---

## Severity 1 (Critical) — `Buf` is not a capability, it is a forgeable pair of integers

**The flaw.** `export type Buf = { base: i32, length: i32 }` in `std/buffer.vl:13` is an
ordinary structural record type, not an opaque handle, not a newtype (confirmed directly
in the doc, `buffer-design.md` §L2b: *"the same argument still says `Buf` itself
(`{base, length}`) is distinct from the views only by luck of field naming — `Buf` is not
a newtype"*). VL type-checks a `Buf` by shape. So any program that imports `Buf` from
`std:buffer` can construct one out of thin air, with any two `i32`s, and every accessor
accepts it — no call to the allocator, no relationship to any real allocation, required.

**Concrete failing scenario — verified live, rc=0, no diagnostic:**

```vl
import { Buf, loadI32, storeI32 } from "std:buffer"

// std/buffer.vl's own header promises address 0 is "never a real Buf"
// (HEAP_BASE = 1024, so base == 0 is supposed to be an impossible Buf).
// That promise is enforced nowhere. This typechecks and runs:
const forged: Buf = { base: 0, length: 65536 }
storeI32(forged, 100, 0xDEADBEEF as i32)   // writes ANYWHERE in the whole memory
print(loadI32(forged, 100))                // -559038737
print(loadI32(forged, 0))                  // reads the reserved low region, offset 0
```

Output: `-559038737`, `0`. `vl check` reports no errors; `vl run` executes both writes.
There is no `unsafe` keyword to type before this — **VL has no `unsafe` concept at all**
(grepped the compiler and both design docs: the only hit for the string is a comment
about Rust's `core::arch`). A `Buf` reads, syntactically, exactly like calling `print`.

This is strictly worse than a raw pointer in C: in C you at least need `(int*)0` to
manufacture the hazard, which announces itself as a cast. In VL, `{ base: 0, length: N }`
is a struct literal indistinguishable from constructing any other record, and the type
that turns it into "read/write arbitrary linear memory" is imported by name from the very
module whose entire job is supposed to be gatekeeping that capability.

**What Rust does instead.** A `Vec<u8>`/`&mut [u8]` cannot be constructed from two
integers without going through `unsafe { std::slice::from_raw_parts_mut(ptr, len) }` —
the `unsafe` block is mandatory, syntactically visible, lint-flagged (`clippy::missing_safety_doc`
on the function that hides it), and grep-able in CI. A crate that wants to expose "here is
a checked region of memory" as a *safe* API (e.g. `bytes::Bytes`, memory-mapped file
crates) achieves it by making the constructor private/sealed and the type non-`Copy`,
non-`Default`-constructible with arbitrary fields — you cannot spell a `Bytes` with two
integers of your choosing from safe code, ever. That is the exact guarantee `Buf` is
missing.

**Proposed VL fix.** Make `Buf` (and every view type) a `new` newtype (`newtype-design.md`
already exists and is used for `F32View`/`I32View` — §L2b of this very doc shows `Buf`
was simply never migrated). A newtype alone does not stop forgery of the *underlying*
shape, but combined with **not exporting the newtype's field accessors/literal
constructor**, only `Buffer(n)` could mint one. VL's `new` types are structural wrappers
without private fields today (worth checking, but nothing in `buffer-design.md` claims
field-hiding) — if `new` cannot hide fields, VL needs a sealed/opaque-constructor
mechanism before `Buf` can be a real capability rather than a naming convention.

---

## Severity 1 (Critical) — Use-after-release is a true, silent, unprevented dangling reference

**The flaw.** `bufferRelease(mark)` (§O6, ruled) resets the one bump pointer with **no
liveness check and cannot have one** — there is no way, at release time, to know whether
any `Buf` minted after `mark` is still reachable. The module header states this outright
("a `Buf` held across a `bufferRelease` still points at live, in-bounds, since-reused
linear memory, so reads return someone else's bytes and writes corrupt them silently — no
trap"), and the repo's own fixture (`tests/cases/std/buffer-mark-release.vl`) pins it as
expected behaviour, not a bug.

**Concrete failing scenario — verified live, rc=0:**

```vl
import { Buffer, bufferMark, bufferRelease } from "std:buffer"

function makeVec3(x: i32, y: i32, z: i32) {
  const b = Buffer(12)
  b.storeI32(0, x); b.storeI32(4, y); b.storeI32(8, z)
  return b
}

const mark = bufferMark()
const temp = makeVec3(111, 222, 333)
bufferRelease(mark)                 // temp now dangles -- nothing says so
const other = makeVec3(9, 9, 9)     // reuses temp's bytes

print(temp.loadI32(0))  // 9   -- silently reads `other`'s data
print(temp.loadI32(4))  // 9
print(temp.loadI32(8))  // 9
print(temp.base == other.base)  // true -- same address, two live-looking handles
```

This is not a synthetic gotcha — it is the *natural* shape of "allocate a scratch value,
do scoped work, release the scope, keep a handle for later" that any arena API invites.
Nothing distinguishes a `Buf` that is still good from one that is not; both have the same
type, the same fields, and both pass every check `std:buffer` performs. The repo's own
`buffer-view-release-dangles.vl` shows the identical hazard reaches the *checked* view
types too — a `stale` view's per-access bound (`0 <= i < length`) is fully satisfied by
the same corrupted read, because "in bounds of a since-reused region" and "in bounds of
a live region" are indistinguishable to a check that only ever looks at `length`.

**What Rust does instead.** This is precisely what the borrow checker and lifetimes exist
to make a **compile error**: a `&[u8]` (or an arena `Id<T>`/`Handle<T>` from crates like
`generational-arena`, `slotmap`, or `typed-arena`) cannot outlive the scope/generation
that created it — either statically (lifetimes) or via a runtime generation check
(slotmap's generational index traps a stale handle as a *distinguishable Err*, not silent
data). Even a hand-rolled bump arena in Rust (`bumpalo`) ties every allocation's lifetime
to the arena's own borrow, so `bumpalo::Bump::reset()` requires `&mut self` and is a
compile error while any allocation from it is still borrowed. VL's `bufferRelease` takes
no relationship to the `Buf`s it invalidates at all — it is a bare `i32`.

**Proposed VL fix, smallest first.** A **generation counter**: bump a module-global
`u32` epoch on every `bufferRelease`, and stamp it into a fourth field on `Buf` (or a
separate checked-handle type) at allocation time; every accessor compares the stamp to
the live epoch and traps on mismatch. This is O(1), needs no borrow checker, and turns
today's *silent corruption* into today's *engine-trap-equivalent loud failure* — the same
trade the project already made for view bounds (§L3) and evidently considers worth
"per-access cost of ~0.1 ns" (measured in §L4 for the two-compare bounds check; a
generation compare is the same shape). This does not need lifetimes at the type level —
it needs the release path to make staleness *observable*, which it currently goes out of
its way not to do (O5 explicitly ruled out an epoch for `memory.grow`, and O6 built no
epoch for release either — both for the same "nobody asked for this" reasoning, which is
a different bar than "this can't be done cheaply").

---

## Severity 2 (High) — A `Buf`'s own declared `.length` is not enforced on its own accessors

**The flaw.** `loadI32`/`storeI32`/etc. take `self: Buf, off: i32` and do **zero range
checking against `self.length`** — they compute `self.base + off` and hand it straight to
the raw intrinsic. `.length` is purely descriptive metadata a caller can choose to consult
or not; it is not a fence. Only the newer, *optional*, separately-imported `f32view`/
`i32view` types perform a per-access check, and only if a caller chooses that API over the
`Buf` one the module header lists first.

**Concrete failing scenario — verified live, rc=0:**

```vl
import { Buffer, storeI32, loadI32 } from "std:buffer"

const pub = Buffer(4)      // caller believes this Buf is exactly 4 bytes
const secret = Buffer(4)   // allocated immediately after, in the same arena
secret.storeI32(0, 424242)
pub.storeI32(0, 1)

print(pub.length)        // 4  -- "this is the whole extent"
print(pub.loadI32(0))    // 1  -- in range
print(pub.loadI32(8))    // 424242 -- reads straight into `secret`'s live bytes
```

`buffer-design.md` §L3's own table names this exact class as "the entire SoA kernel's bug
class" and its `buffer-view-bounds-control.vl` fixture demonstrates it deliberately for
*views*; the same holds one layer further down, for the plain `Buf` accessors that are the
module's primary, documented surface (module header lists `loadI32`/`storeI32` before it
even mentions views).

**Grade against Rust slices.** A Rust `&[T]` makes this **structurally impossible**:
indexing panics on out-of-range, and there is no "give me byte 8 of a value that says its
length is 4" spelling that isn't `unsafe { s.get_unchecked(8) }` — which requires the
`unsafe` keyword and a safety comment convention (`# Safety`) that clippy and rustdoc both
nudge toward. VL's `Buf.loadI32` **is** `get_unchecked`, wearing the clothes of a safe,
undecorated function.

**Proposed VL fix.** Bound `Buf`'s own accessors against `self.length` by default (the
same two-compare cost §L4 already measured as ~0.1 ns/access and called "under a third of
a cycle"), and rename the current unchecked behaviour to something that reads as an escape
hatch (`loadI32Unchecked`) rather than the default. The project has already done exactly
this migration once, for views (§L3 states the *view* tier is "the only thing in
`std:buffer` that is" fenced) — the fix here is to stop treating `Buf` itself as
categorically exempt from the policy it invented for views one layer up.

---

## Severity 2 (High) — `memory.grow` silently detaches every host view, by design, permanently

**The flaw.** Ruled and shipped behaviour (§O5, §H8): `Buffer(n)` grows the wasm memory
lazily and **exports no growth counter**. Any host holding a `Float32Array`/`DataView`
over `instance.exports.memory.buffer` has that view silently zeroed-out
(`byteLength === 0`, indexed reads return `undefined`, **not a throw**) the moment any
guest call triggers a grow — and the guest has no way to signal *when* that happened,
because the epoch export was deliberately not built.

**Measured in the repo** (`buffer-design.md` §B5, reproduced there against V8):
```
host view byteLength AFTER grow: 0 (0 == detached)
host view[0] after grow: undefined         ← silent, not a throw
```

This is the *documented, ruled-permanent* contract, not a bug awaiting a fix: "re-take
your typed-array views after any call that may allocate, and detect staleness with
`byteLength === 0`." That places the entire burden on every external consumer
remembering, on every guest call that could possibly allocate, to re-derive its view — an
easy thing to get right once and silently regress six months later when an unrelated code
path starts allocating.

**What Rust does instead — and the doc says so itself.** §H8: *"A Rust/wasmtime host gets
this for free: `Memory::data` borrows the `Store`, and growing needs it mutably, so a
stale slice is a borrow-check ERROR rather than a silent `undefined`."* The project's own
measurement is the indictment: the identical hazard is a **compile-time borrow error** in
a Rust host and a **silent `undefined`** in the two JS hosts VL actually ships
(`tests/support/runWasm.ts`, `playground/src/runtime.ts`), and the design explicitly chose
not to add the one piece of state (a monotonic epoch, one `i32` global, one export) that
would let *any* host — including a JS one with no borrow checker — detect the hazard
itself instead of relying on programmer memory.

**Proposed VL fix.** Ship the epoch export the doc rejected in O5. It costs one global and
one export; every host-side wrapper (`runWasm.ts` already carries the "re-read after any
call that can grow" contract in a comment — trivially turn that comment into a runtime
assertion by comparing the epoch before use).

---

## Severity 3 (Medium) — SIMD's design doc re-commits to the identical unchecked-read model one layer up, before it exists

**The flaw.** `simd-design.md` §D3 states plainly: *"like `std:buffer`'s raw loads,
`loadF32x4` reads 16 bytes past `base+off` with no bounds check (a read past a `Buf` is
still inside the memory and nothing would catch it); a checked `v128view` … is the safe
wrapper."* This is not live code — SIMD is a survey/recommendation with zero compiler
lines shipped — but it is the **plan**, and the plan is to reproduce Severity-2's flaw
verbatim at 16-byte granularity instead of 4/8-byte, with the fenced variant again framed
as an opt-in "safe wrapper" rather than the default.

**Why this matters now rather than later.** The `Buf`-tier precedent (raw unchecked
first, checked view bolted on afterward, chosen *by the caller*) is being treated as
settled prior art for the next tier rather than as a lesson to fix going in. Compounding
the risk: a `v128.load` reads a full 16 bytes in one instruction, so an off-by-one in a
manually computed offset now silently touches up to 15 bytes of a neighbouring allocation
instead of up to 7 (the widest scalar, i64/f64) — the blast radius of the exact same class
of bug (Severity 2) grows with every wider load width the `Buffer` family adds, and
nothing in the design changes the *default* to fenced-first.

**What Rust does instead.** `std::simd::Simd<T, N>` (portable-simd) loads via
`Simd::from_slice`, which panics if the slice is shorter than the vector — the **safe**
constructor is bounds-checked by construction; the unchecked form
(`Simd::from_slice_unaligned_unchecked` or a raw pointer load) requires `unsafe`. Even
`core::arch`'s raw SIMD intrinsics (`_mm_loadu_ps`) take a raw pointer and are `unsafe fn`
end to end — Rust never offers a *safe*, unchecked 16-byte load the way VL's proposed
`loadF32x4(self: Buf, off: i32)` would be a perfectly ordinary, undecorated function call.

**Proposed VL fix.** Before `std:simd` ships, flip the default: `loadF32x4`/`storeF32x4`
should take a `checked` view type (a natural extension of `f32view`/`i32view`, e.g. one
that further guarantees a multiple-of-16 remaining length) as their primary signature, and
the raw-`Buf`, unchecked form should be the named escape hatch — mirroring the fix
recommended for Severity 2, and getting it right before the surface exists rather than
after 16 KiB of load-bearing kernels are written against the unchecked spelling and can't
be changed without breaking them.

---

## Severity 3 (Medium) — Structural typing makes any `{base:i32, length:i32}`-shaped value a `Buf`, independent of Severity 1

**The flaw.** Even setting aside that `Buf` isn't a newtype (Severity 1), VL is
*structurally* typed (stated explicitly and enforced: `buffer-design.md` §L2 — "Two
declarations with the same field names and types **are the same type**"). So a completely
unrelated struct type, declared in a completely unrelated module, with the same two field
names and types, is not merely convertible to `Buf` — it *is* `Buf` as far as the checker
is concerned, with no cast, no `as`, no acknowledgement anywhere in the source.

**Concrete failing scenario — verified live, rc=0:**

```vl
import { Buffer, storeI32, loadI32 } from "std:buffer"

type Buf2 = { base: i32, length: i32 }   // an unrelated type, in application code

const a = Buffer(16)
const bogus: Buf2 = { base: a.base, length: a.length }
a.storeI32(0, 555)
print(bogus.base == a.base)   // true
print(bogus.loadI32(0))       // 555 -- Buf2 aliases `a` perfectly, no cast needed
```

`std:buffer` itself hit this exact hazard while designing `F32View`/`I32View` (§L2: an
`I32View` satisfied every `F32View` parameter and silently reinterpreted an int's bytes as
a float) and fixed it there with `new`. The fix was never applied to `Buf`, so the
*original*, most-used type in the tier still has the hole its own sibling types were
redesigned specifically to close.

**What Rust does instead.** Rust is nominally typed: two structs with identical fields are
different types unless one explicitly implements `From`/`Into` or the programmer casts via
`unsafe { transmute }` (itself a documented, `unsafe`, and clippy-flagged operation:
`clippy::transmute_ptr_to_ptr` and friends). "Same shape, different type" is the default
and the safe case in Rust; VL has it backwards for this tier.

**Proposed VL fix.** Same as Severity 1's: make `Buf` a `new` type. The module already
demonstrates (§L2b) that this is a small, well-understood, and even code-size-*reducing*
change once the "put the width in the field name" anti-pattern is avoided — there is no
open design question left to resolve, only a migration that was apparently never
scheduled for the original type.

---

## Severity 4 (Low-to-Medium, architectural smell rather than a live bug) — the `-2` monomorphization pin collapse

**What was asked about.** `docs/internals/inventory/D1816.md`: a hole pinned two different
ways by two monomorphized instances of a function collapses to a sentinel (`-2`) in
`holePinTys`, a **scalar** map ("first pin wins, a disagreeing second writes `-2`, and no
list is kept"). When a downstream consumer (an array-literal closure-element mint) needs
to know *which* of the two pins applies and can only see the collapsed sentinel, it has no
way to answer and the emitter currently **rejects loudly**: `emitProgram: callee is not a
function name`.

**Current grade, stated accurately.** This particular instance is *not* a soundness
violation as things stand — `vl check` accepts the program, but `vl run` fails loudly
before producing a module, which is a clause-2 (capability-gap) issue, not a clause-1
(silent-miscompile) one. The owner's 2026-09-08 ruling in the same file agrees: "it is a
LOUD emit reject, not a silent miscompile, so soundness (clause 1) holds."

**Why it still belongs in this review.** The *shape* of the defect — collapse two
disagreeing answers into one sentinel value, and trust every future reader of that sentinel
to check for it before treating it as real — is the same shape CLAUDE.md's own project
history shows has produced **actual silent-trap and soundness bugs** elsewhere in this
compiler multiple times (the `sentinel-index-unguarded` lint exists *because of* this
pattern, with 386 live hits at the time it landed; D1440, D1462, and D1500 are three
distinct compiler traps from exactly this "sentinel value read as a real index/type by a
reader that forgot to check" mechanism). `holePinTys`'s `-2` is architecturally identical:
a scalar sentinel bank with no enumeration of what it collapsed, consulted by an unbounded
number of readers (`pinnedHoleTyOf`, `pinResolvedFnTy`, "every pin consumer" per the
row's own text), each of which has to remember to special-case it. That today's one known
consumer happens to check and reject loudly is not evidence the *next* consumer will.

**What Rust does instead.** Generic monomorphization in Rust never collapses two
instantiations' type information into one shared, lossy slot — `Vec<i32>` and `Vec<f64>`
are distinct `TypeId`s and distinct generated code from the start; there is no "one hole,
two pins, pick a sentinel when they disagree" step at all, because monomorphization
in rustc keys everything by the full substituted type from the point the generic is
resolved, not by a mutable scalar updated in place as pins arrive.

**Proposed VL fix.** Exactly what D1816's own mechanism section already scoped and
declined to build for lack of a consumer: make `holePinTys` a **set**, not a scalar,
recording every distinct pinned type rather than overwriting to a sentinel on
disagreement. This is a bigger change than anything else in this review and the project
has correctly deprioritized it for a single-array-literal-element defect — but it should
be tracked as a standing soundness *risk factor* (a scalar-sentinel collapse with an open
consumer list), not filed away as "closed, was loud." The next consumer of `holePinTys`
that forgets to check for `-2` is the next D1440-shaped trap, and nothing in the type of
`holePinTys` stops that from compiling.

---

## Summary judgment

**What VL actually guarantees in the `Buffer` tier: the wasm engine will not let a program
read or write memory outside the module's linear memory.** That is the entire proof. Every
guarantee above that — that a `Buf` you hold still refers to *your* data, that reading
byte 8 of a 4-byte `Buf` means anything, that a value typed `Buf` actually came from
`Buffer()`, that a host's cached view of memory is still valid — is a **convention stated
in a doc comment**, checked by nothing, and (for at least three of the four) demonstrably
violated by a five-line program that raises no diagnostic anywhere in the pipeline.

This is not "unsafe by default" in the Rust sense, where `unsafe` is a narrow, marked,
lint-tracked island inside a safe-by-default language. It is **unmarked by construction**:
there is no keyword, no block, no clippy-equivalent lint, and no syntactic tell
distinguishing a `Buffer`-tier call that can corrupt arbitrary state from an ordinary safe
one. A Rust programmer reading `std/buffer.vl`'s surface for the first time would look for
the `unsafe fn` markers and find none — every one of the functions in this review's repros
is a plain `export function`.

The project's own instincts are good — the mark/release hazard, the view-bounds hazard,
and the `memory.grow` detach hazard are all *stated*, in the module header and in
purpose-built fixtures that pin the corruption as measured behaviour rather than leaving
it to be discovered. That intellectual honesty is real and better than most systems
languages manage. But stating a hazard is not mitigating it, and the smallest fixes here
(a generation counter on release, bounding `Buf`'s own accessors by `.length`, an epoch
export for grow, and making `Buf` a sealed newtype) are all cheap, all measured-affordable
by the project's own benchmarks (~0.1 ns/access for a two-compare bound), and would move
three of these five findings from "silent corruption" to "loud, deterministic trap" — which
is the exact bar the project already set for itself in `docs/internals/buffer-design.md`
§A4 ("the engine trap is what happens today, and it is clean and loud") and then declined
to extend to the tier's own descriptor type.
