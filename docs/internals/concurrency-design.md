# Concurrency and parallelism — the model

**Status: the model is RULED (owner, 2026-08-22). Nothing here is built.** This file
records the decision, the alternatives that were rejected and why, and the order the
pieces land in. It is a design record, not a plan of record — `ROADMAP.md` owns
scheduling.

The short version:

> **I/O concurrency is uncoloured and direct-style.** An I/O function is an ordinary
> function; suspension is the host's business and is invisible in source. Concurrency
> is requested with **one optional argument on `map`**, is bounded by construction, and
> is structured by construction. **CPU parallelism is deferred** until the platform can
> share a heap across threads. An **inferred effect analysis** — never written down,
> never in a type — powers the diagnostics and the codegen.

---

## 1. The two problems are not one problem

I/O concurrency and CPU parallelism have opposite optimal designs. I/O wants *many*
cheap suspension contexts on *one* core, dominated by waiting. CPU parallelism wants
*exactly core-count* contexts, dominated by computing and memory locality. Cheap stacks
buy CPU work nothing; extra cores buy I/O work nothing.

Every language that unified them ships a caveat telling you not to: Loom's own
documentation says virtual threads are not for CPU-bound work; Rust's standard advice is
"don't use async for CPU work, use rayon." Go unifies and pays for it — decent CPU
parallelism, no structured data-parallel story, and heavy-CPU Go programs reach for
explicit worker pools anyway.

**In wasm the split is forced regardless**, because the two mechanisms are different and
have different availability:

| | mechanism | wasmtime | browser |
| --- | --- | --- | --- |
| I/O concurrency | stack switching | fibers / async host functions | JSPI |
| CPU parallelism | separate instances, message passing | OS threads (already used by `vl test`) | Web Workers |
| shared-memory parallelism | threads + atomics over a shared heap | **WasmGC references cannot cross threads** | same, plus COOP/COEP |

The third row is the one VL would actually want and it does not exist. The
shared-everything-threads proposal is in flight; until it lands, VL's data model
(WasmGC structs and arrays) cannot be shared across threads at all.

*Carve-out worth remembering:* **`Buffer` is linear memory**, and linear-memory threads
*are* shipped. SoA numeric work living in a `Buffer` — the webcraft P0 tier — is the one
shape that could be threaded today if a host exposed it.

---

## 2. I/O: no colour, no keyword

An I/O function is an ordinary function returning an ordinary value:

```vl
const raw = fs.read(path) as string
```

No `async`, no `await`, no `Promise` type, no CPS transform. One implementation of every
library, so no ecosystem fork.

### 2.1 Why not colour it

**Colouring duplicates the ecosystem.** Rust has `postgres` *and* `tokio-postgres`;
Python has `requests` *and* `httpx`; npm forked the same way. That split comes from the
runtimes genuinely differing (blocking socket vs event loop), not from the syntax — and
with stack switching there is only one runtime, so there is nothing to fork into.

**The industry is moving away from it, and the reasons hold on this axis.** Java 21
virtual threads, Ruby 3's `Fiber::Scheduler`, Scala's direct-style movement and Zig's
removal-pending-redesign all rest on the same observation: *async syntax was a workaround
for expensive stacks.* Cheap stacks make it dead weight. Every coloured design in
mainstream use is 2012–2021; nothing since has gone that way.

**Colouring would also damage the error model already ruled.** `error-handling-design.md`
settles `as` / `as?` / `as!` as the propagation trio. Under colouring the call site becomes
`await fs.read(p) as string` — Rust's `(await x)?`, two operators on every fallible I/O
call, which is one of the most-complained-about corners of that language.

### 2.2 The visibility objection, and the answer

The honest cost of uncoloured is **the invisible seam**: nothing at the call site says
"this waits", so an engineer writing a loop does not think to batch it. This is a real,
observed failure mode — it is the *reason* the coloured cohort exists, and Loom's answer
("use observability") is a production answer to a design-time question.

Note the failure is **not** caused by colouring or its absence. Every language in the
survey is serial by default: `xs.map { f(it) }` in Kotlin, `for x in xs { f(x).await }` in
Rust, `for (const x of xs) await f(x)` in JS. `await` marks *that it suspends*, not *that
you failed to parallelize* — different facts, and only the second is the bug.

**VL's answer is to infer the effect and spend it on a diagnostic instead of a keyword**
(§4). That gives *more* coverage than `await` does: a keyword tells you about one frame,
an inferred effect is transitive and knows the helper three frames down opens a socket.

---

## 3. The surface: one optional argument on `map`

```vl
urls.map(u => http.get(u))          // serial
urls.map(u => http.get(u), 8)       // concurrent, at most 8 in flight
```

Not a new name. Not `gather`, and specifically not `join` — `join` has a strong prior
meaning as *the dual of spawn* (`pthread_join`, `thread.join()`): it takes one handle for
one thing you already started. This takes a collection and a function and does both
halves, which is `map`.

Three properties fall out, and each is load-bearing:

- **Serial elision is literally visible.** Delete the limit and you have the sequential
  version; results are ordered by index, never by completion, so the two are
  observationally identical. This is Cilk's property and it is what makes a debug mode
  that runs everything serially and asserts identical results a real gate.
- **There is no unsafe spelling.** Omitting the limit gives *serial* (safe); passing one
  gives *bounded* (safe). Compare `Promise.all` / `awaitAll()`, where the hazard —
  unbounded fan-out — is reached by writing **less**. Here it is not reachable.
- **Structured by construction.** `map` returns when its children are done; lifetimes are
  lexical. No `Job`, no `Scope`, no cancellation token, no task that outlives its caller.
  Structured concurrency without any of its usual nouns.

Errors need no new machinery: the result is `(T | E)[]`, and
`error-handling-design.md` §O7 already measured that `R[]` where `R = string | Err` lowers
and runs today.

**No user-facing `Task` / `Future` / handle type.** `map` returns results, not handles.
Handles invite unstructured spawning, which is the thing structured concurrency exists to
prevent. If a genuine fire-and-forget case appears it should be added deliberately, with
a name that says so.

### 3.1 `map` belongs in std, and the blocker is one intrinsic

Today `map`/`filter`/`push`/`pop` are compiler builtins (`typecheck.vl`
`holeArrMethod`), while `reduce`/`mapIndexed` are `std/array.vl`. **RULED (owner,
2026-08-22): `map` should be std.**

The reason it is a builtin is not the one it looks like. From
`selfhost-lambdas-design.md` §2.3, the builtin lowers to an inline loop **but does not
inline the callback** — it is `call_indirect` per element. A std `map` pays exactly the
same per-element indirect call, so the builtin never bought call overhead. It shipped in
the same commit as lambdas (`27e84371`), so it does not predate function values either.

What it actually bought is `array.new_default(outElemArr, n)`: a **pre-sized result array
at the right element heap type**. A std version writes `const out: U[] = []` and pushes,
which grows. And when it was written, generic array *building* did not work at all —
`std/array.vl`'s own header gives the tense away: a generic `const out: T[] = []` + `push`
"**now** propagates `T` through monomorphization."

**`mapIndexed<T, U>` is the existence proof** that a generic std `map` is writable today;
it is `map` plus an index parameter. The residue is pre-sizing:
`__array_new__(n, fill)` / `__array_new_default__(n)` exist as emitter intrinsics but are
**i32/f64 only** — `emit_classify.vl` states that `__array_new_default__`'s element kind
"is not derivable from the argument list." So a std `map<T, U>` would be correct and would
grow instead of pre-allocating.

**One generic, monomorphization-aware sized-array constructor closes it** for `map`,
`filter`, `mapIndexed`, `reverse` and `concat` at once.

This is also the concrete argument against special-casing concurrency on builtin names:
if `map` is std, the scheduling primitive must be exposed the way `__array_new__` is, so
`reduce`, `mapIndexed` and user code can take a limit too. Otherwise concurrency becomes
a privilege of the four names the compiler happens to know about.

---

## 4. The effect analysis — inferred, never written, spent three ways

A bottom-up fixpoint over the call graph, the same shape as the existing
`unconditional-recursion` lint, answering "can this function suspend / does it touch
ambient mutable state." **It never appears in a type and nobody writes it.** (Checked
2026-08-22: VL has no purity or effect analysis today; `pure` occurs only in prose.)

| job | what it does |
| --- | --- |
| **the serialization lint** | *"`fetchOne` performs I/O and is called once per element here — these run one at a time. Pass a concurrency limit."* |
| **mechanism selection** | which of §5's mechanisms a callback is eligible for |
| **eliding the machinery** | a callback that cannot suspend gets the plain serial lowering, so the limit costs nothing |

That third row matters: with stack switching, running something concurrently means
allocating a stack, which is not free. The concurrency argument is a **permission**, not
an instruction — the compiler grants the strongest mechanism the callback qualifies for
and elides the rest.

**Why infer rather than annotate.** VL's stated aims are *fully type safe* with *types
invisible*, and *no boilerplate*. The effect is not needed for safety — `T | E` already
carries failure — so putting it in a type buys nothing and costs an annotation on every
signature. OCaml 5 is the precedent worth weighing: the community best equipped to type
effects shipped handlers deliberately **untyped**. VL goes one step further and infers
them anyway, then declines to surface them.

**Known imprecision, stated up front.** Indirect calls through a function value cannot
always be resolved statically. VL's monomorphizer resolves much of it, but not all, and
higher-order sites are exactly where the lint would be most valuable. The analysis must be
conservative there, and that is a real coverage loss rather than a detail.

---

## 5. Eligibility, not contract

When both mechanisms exist, `map(f, n)` dispatches on the inferred effect. The trap in
naive dispatch is that the mechanisms have different **safety** properties — threaded
execution over a shared heap races if the callback mutates shared state; stack switching
is cooperative and cannot, because control changes hands only at a host call and
mutations between suspension points are atomic (this is why JS has no data races).
Dispatching naively would let a refactor that removes an I/O call silently convert safe
concurrency into a race.

So the rule is **eligibility, not a contract imposed on the caller**:

| what the callback does | mechanism |
| --- | --- |
| I/O | stack-switched — mutation of captured state is fine |
| pure CPU | threaded *(when the platform allows — see §6)* |
| CPU **and** touches ambient mutable state | **serial, with a diagnostic saying why** |

No restriction is imposed that is not needed, nothing unsafe is reachable, and a refactor
that costs you parallelism *says so* instead of silently changing semantics.

**One name, not two.** Java's `stream()`/`parallelStream()` is the two-name design with an
unstated, unchecked contract, and is widely considered a mistake. Rust's
`iter()`/`par_iter()` works because `Send`/`Sync` check it. Here the compiler has strictly
*more* information than the author — it knows the callback's transitive effect, which the
author often does not — so making a human restate it is exactly the boilerplate VL avoids.
Visibility comes from tooling instead: hover should report which mechanism a call got.

---

## 6. CPU parallelism is deferred, deliberately

**RULED (owner, 2026-08-22): do not ship a restricted `parMap`.**

A worker is a separate instance with a separate heap, which forces a callback to avoid
capturing heap references and to avoid reading module globals (a worker gets *fresh*
globals from their initializers — a silent wrong answer, the worst outcome class this
codebase tracks). Those restrictions are artifacts of one temporary platform gap: WasmGC
references cannot cross threads *yet*.

**Baking a temporary platform gap into a permanent language surface is how you end up
with two APIs** — which is the failure this entire design exists to avoid. When
shared-everything threads land, every one of those restrictions evaporates.

Meanwhile multiple cores are already reachable **from the host**, which is where they
belong for now: `vl test` runs N instances across an OS thread pool via `parallel_map`,
one instance per file, and needed no language feature to do it.

When it is revisited, the fork is not open: type-safe CPU parallelism restricts
*something*, always —

| | cost |
| --- | --- |
| message passing | serialization restrictions (Erlang, Web Workers) |
| shared memory + typed race safety | `Send`/`Sync`-shaped annotation burden (Rust, Swift 6, Pony) |
| shared memory, races are your problem | **unsound** (Go, Java, C#) |

— and VL's own *fully type safe, statically sound* principle rules out the third row.

**GPU is not a language feature.** Bind WebGPU/wgpu as a library over the `Buffer` tier
that webcraft P0 already shipped. A GPU is a host capability, like a filesystem.

---

## 7. Rejected, with reasons

| rejected | why |
| --- | --- |
| **`async`/`await`** | Colour duplicates the ecosystem; the CPS/state-machine transform is what makes Kotlin's colour heavy (it is load-bearing for the *compiler*, not the reader); and it forces `await x as T` on every fallible I/O call. `await` is currently a reserved keyword and `async` is not — keep `await` reserved, use neither. |
| **A typed effect system** (Koka, Flix, Unison) | Effect *polymorphism* is the right answer to the combinator problem **if** you type effects — one `map` polymorphic over its callback's effect, no `tryMap` sibling. The better answer is not to type them. Worth revisiting if `T \| E` forces a combinator split in practice. |
| **Implicit / invisible futures** (Multilisp, Oz dataflow) | Requires either colouring (defeats the purpose) or a resolved-yet? check at *every read of every value*, since any value might be a future. VL races Kotlin; that is a tax on every load to buy ergonomics at a handful of sites. It also breaks the error model — the failure would surface at an arbitrary later touch, not at the call — and it is strictly worse on visibility than eager-plus-explicit. |
| **Lazy futures** (Rust, Haskell) | Serial-by-default is the same trap by the opposite route: `f().await; g().await` is sequential because nothing polls them together. Eager buys concurrent-by-default; it costs retry, replay and cancellation, which is a smaller loss for VL than for JS because `T \| E` makes an unconsumed failure a leak rather than a stray global rejection. |
| **A user-facing `Task`/`Future` type** | Invites unstructured spawning. See §3. |
| **Shared-memory threads now** | Not portable, unspecced against WasmGC, and it is the entire cost of a data-race type system. See §6. |

---

## 8. Sequencing

Steps 1–3 require **no async decisions at all**, and nothing in them changes when 4–6
land — that invisibility is the defining property of the uncoloured model.

1. **Host ABI batch** — argv, file read/write, directory listing. One batch: every import
   must land in **three hosts** (`scripts/vl-host/src/main.rs`,
   `tests/support/runWasm.ts`, `scripts/wasmtime-host.rs`) plus a declaration in
   `compiler/wasmEmit.vl`. Miss one and a program runs under the CLI and fails under
   `deno task test`.
2. **`std:fs`** on the ruled error shape (floor `{msg: string}`, `IoError` adding `code`).
   `error-handling-design.md` §O7 measured every signature shape it needs as already
   lowering — **re-run that probe at the head that implements it**, per its own
   instruction.
3. **The `as` trio.** ~~Its stated trigger — *"once `std:fs` proves the ladder
   boilerplate"* — fires here.~~ **DONE (2026-08-24)** for the two lowered members:
   `as` propagates and `as!` traps, over a value-atom arm, a struct arm and a
   sub-union target. `as?` is parsed and refused at the checker (its `T | null`
   result needs the per-rep nullable classifiers); it is the lossy member, so step 4
   is not blocked on it.
4. **Stack switching**, wasmtime first.
5. **`map(f, limit)`**, with the generic sized-array intrinsic so `map` moves to std
   (§3.1).
6. **Effect inference** → the lint, mechanism selection, machinery elision (§4).

**Browser parity is NOT on the initial path (owner, 2026-08-22.)** Blocking I/O is
trivial under wasmtime and *not implementable* in a browser — `fetch` returns a Promise
and wasm on the main thread cannot synchronously wait for one, so the browser needs JSPI
or a Worker plus `Atomics.wait` on a SharedArrayBuffer. A filesystem in a browser is
dubious by nature anyway. Standalone is also where the immediate value is: the shell
scripts become VL programs, `vl test` can write files, and Track J gets its on-ramp.

Constraint to remember before step 1: `cli-design.md` records that the compiler **seed**
is instantiated with an EMPTY linker by every consumer — the playground, the Node/LSP
checker, `cases_wasm`, and the Rust host. Adding imports to the seed breaks all of them.
User programs are unaffected (they already receive the seven print imports), so `std:fs`
for user code is unblocked; **the compiler itself consuming `std:fs` stays gated on a WASI
host.** That only bites the "rewrite the shell scripts in VL" goal where those scripts
drive the compiler.

---

## 9. Open, and what needs verifying

- **JSPI's browser status and wasmtime's async API shape** are the load-bearing platform
  assumptions in this document and were **not** verified against current sources. Check
  both before step 4 is scheduled.
- **The limit's spelling and position** — `map(f, 8)` is written here as a trailing
  optional argument (B15a shipped optional params). Not ruled.
- **Whether `reduce` takes one**, and what its associativity contract says. A parallel
  reduce needs associativity, which is not checkable and must be documented.
- **The sized-array intrinsic's design** (§3.1) — the element kind has to come from the
  instantiation rather than from a fill value.
- **Lint severity and firing rule.** Warning or hint, and it must fire only in a loop or a
  `map`-shaped callback; firing on every I/O call would be useless.
- **Cancellation.** Structured lifetimes give scope-exit cleanup for free, but nothing
  here says what happens to in-flight children when one fails. Go needed `context` and it
  is widely considered a wart; decide deliberately rather than by accident.

## 10. Where the argument came from

The survey behind §2 and §7 is in the session that produced this file, not in the tree.
The load-bearing observations, so they can be re-derived rather than re-argued:

- The mainstream complaint about accidental serialization tracks **call-site visibility**,
  not colouring — Kotlin marks `suspend` on the *declaration* and its call site is bare,
  which puts it in the same column as Go and Ruby fibers rather than with TS and C#.
- It also tracks **eagerness**: JS and C# start the work at the call and are concurrent
  when you collect them; Rust and Haskell are lazy and Kotlin and Go run to completion,
  and all three are serial by default.
- The languages that hurt most on N+1 (JS, Kotlin, Python, Swift) are exactly those
  **without a bounded concurrent map**. Those that have one — `xargs -P` (1980s),
  `NSOperationQueue.maxConcurrentOperationCount`, `errgroup.SetLimit`,
  `buffer_unordered`, `Task.async_stream(max_concurrency:)`,
  `Parallel.ForEachAsync(MaxDegreeOfParallelism)` — do not.
- **occam** is the sharpest prior art for the actual mistake: every statement block is
  explicitly `SEQ` or `PAR`, so "these should have run together" is a decision the
  language will not let you skip. §3's serial-elision property is the same idea, reached
  through Cilk.
