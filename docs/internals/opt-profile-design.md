# The release profile: `vl build -O3` (webcraft P1.3)

`vl build -O3` runs the emitted module through `wasm-opt` with an **audited flag
set**, not an optimization level:

```
wasm-opt <module> --closed-world -O3 --gufa -O3 \
         --enable-reference-types --enable-gc --enable-bulk-memory -o <module>
```

`vl build -O` is unchanged — one open-world `-O` with the same feature enables.
Both rungs are a **soft no-op** when no `wasm-opt` is found: a note naming the
flag on stderr, the unoptimized module left on disk, exit 0.

The ask this answers is webcraft P1.3: *"vl's union boxes and `{backing,len,cap}`
wrappers must melt in per-tick scratch code, or the alloc-free-steady-state
discipline becomes 'avoid half the language in the sim.'"* So the profile is
judged by one number — **allocation sites surviving in the hot loop** — and every
claim in §2–§5 is that number, read out of the disassembly.

**Read §7 before recommending either rung.** Judged by that one number the profile
is a clear win; judged by wall clock it is uneven, and on tight scalar loops BOTH
rungs are a loss of up to 2.4× under wasmtime. §7 names the cause (a loop rewrite
that every `-O` level performs, mis-compiled by Cranelift and not by V8), shows that
no flag set avoids it, and pins the shape it costs.

---

## 1. Why the spelling is `-O3` and not `--release`

`-O3` sits in the flag family that already exists (`-o`, `-O`), and it is the
string that every measurement table in this repo is already headed with
(`buffer-design.md` §L4, `newtype-design.md`, `index-operator-design.md` all say
`-O3 --closed-world`). Unknown `vl build` flags are silently ignored — measured:
`vl build f.vl -O3` before this change wrote an unoptimized module, printed
`wrote f.wasm (N bytes)` and exited 0 — so any *other* spelling would have left
`-O3` as a live rc=0 trap for the reader of those tables. Naming the flag after
what people already type is what closes it.

**`-O3` is deliberately not a bare binaryen level, and the precedent is `-O`.**
VL's `-O` has never been binaryen's `-O` either: it has always carried three
`--enable-*` features, because VL output is WasmGC and binaryen will not even
validate it otherwise. The VL `-O` family means "the audited flag set for this
rung". `-O3`'s load-bearing member, `--closed-world`, is likewise not a level at
all — it is a claim about the module BOUNDARY (§4).

`--release` was the alternative and it is the better *name* for a set containing
an assumption. It was rejected on the trap above, and because a profile flag that
nobody types is a profile nobody runs.

When both `-O` and `-O3` are passed, **`-O3` wins**: on every shape measured it is
a superset of `-O`'s effect, so running the shrink rung first would buy a process
spawn and nothing else.

---

## 2. The melt table

Seven per-tick-scratch fixtures, `tests/fixtures/opt-melt/*.vl`. Each is a loop that
allocates and consumes scratch and stores nothing. The number is **allocation
sites (`struct.new*` / `array.new*`) surviving in the module**, read out of
`vl build --wat`. Pinned as goldens by `tests/selfhost_native_release_test.ts`
(`MELT_TABLE`), which is the authority — this table is a reading of it.

| fixture | what it is | (none) | `-O` | `-O3` |
|---|---|---|---|---|
| `struct-scratch-call` | `{x,y}` record built by a helper, read, discarded | 3 | **0** | **0** |
| `list-wrapper-literal` | `[i, i+1, i+2]` built and read in the loop | 3 | **0** | **0** |
| `list-wrapper-call` | same list, built by a helper across a call | 3 | **0** | **0** |
| `union-box-call` | `i64 \| boolean` from a helper, `is`-narrowed in the loop | 3 | **0** | **0** |
| `union-box-payload-read` | same, with the narrowed payload READ | 3 | 2 | **2** |
| `union-box-branch-local` | same box via a `let` written on two SEPARATE statements | 4 | 4 | **2** |
| `list-wrapper-push` | scratch list GROWN by `.push` each trip | 6 | 3 | **2** |

The count is over the whole module, which is the honest upper bound: unoptimized,
some sites live in helpers the loop calls; optimized, everything reachable has
been inlined into the one loop, so the module IS the loop.

The four `union-sink-*` fixtures in the same directory belong to the box sink and
are pinned by `tests/vl_union_return_sink_test.ts`, not here.

**The headline: what decides whether a union box melts is the number of
CONSTRUCTION SITES, and the rung needed follows from it.** At one site plain escape
analysis suffices and `-O` melts the box; at two or more the box can only go through
`--closed-world` type refinement, which is the `-O3` rung. The box sink gives a
multi-armed producer one site, which is why `union-box-call` now melts a rung
earlier than the profile's first measurement found. `union-box-branch-local` writes
its `let` from two SEPARATE statements — an init and an assignment inside an `if` —
so there is no merge point for a box to sink into, and it still needs `-O3` and
still leaves two sites. §3 item 0 is where that rule is stated in full; it is the
SITE COUNT, not whether the payload is consumed.

---

## 3. What each flag is actually worth (measured, not assumed)

Each of these was isolated by running the flag alone and in combination against
the same six modules.

- **`--closed-world` is the entire lever, and the LEVEL is not.** `-O3` alone
  leaves all 4 allocations of `union-box-call`; `--closed-world -O` melts all 4.
  `-O`, `-O2`, `-O3` are indistinguishable in both worlds. Reading the WAT says
  why: open-world `-O3` *does* inline the helper — the two `struct.new`s end up in
  the loop, provably non-escaping — and Heap2Local still leaves them, because the
  box reaches its use through an `if`-result of reference type. Under
  `--closed-world` binaryen may refine the `{tag: i32, value: anyref}` box's field
  types and propagate the constant tag, at which point the tag compare folds and
  the whole box is dead. **The union box does not melt by escape analysis. It
  melts by closed-world type refinement plus DCE**, which is why no amount of
  `-O` level reaches it.
- **The trailing `-O3` (the repeat) is load-bearing — RE-DERIVED, and it does more
  than the row it was justified by.** It is the only member that moves
  `list-wrapper-push` from 4 sites to 2 — and note `--closed-world -O3` alone is
  *worse* there than plain `-O` (4 vs 3), a regression the second pass more than
  recovers. It is also ~15% of module size on its own (113 → 97 bytes on the small
  fixtures). Re-measuring it on the 1.1 MB `vl-compiler.wasm` — which the original
  justification did not do — shows the repeat is worth considerably more than one
  fixture row there: **7,720 → 7,635 allocation sites, 4,640 → 4,546 `ref.cast`s,
  and 930,519 → 919,547 bytes.** This is the guidebook's "non-LLVM GC compilers need
  repeated runs" advice showing up with a number.
- **`--gufa` is measured INERT on VL output — RE-DERIVED and CONFIRMED, with one
  correction.** Zero allocation sites and zero `ref.cast`s removed, on all ten
  fixtures in `opt-melt/` AND on the 1.1 MB `vl-compiler.wasm` (7,635 sites and
  4,546 casts with and without it, byte for byte the same counts). It is in the set
  because P1.3 names it explicitly and because it is cheap — **not because it was
  observed to do anything.** If the profile ever needs to get faster, this is still
  the flag to drop first.

  The correction is that its **byte** contribution is an artifact of ORDER, not a
  property of the flag. `--gufa` on its own GROWS the compiler module by 7.9 KB
  (922,642 → 930,519); it nets −593 bytes only because the profile runs another
  `-O3` after it, which cleans up what it expanded. Move it after the last `-O3`
  and the sign flips. Its wall-clock cost is also under a second, not the ~2s first
  reported (n=1 per arm on a shared box; both arms land within noise of each other).
- **Heap2Local does not need naming.** It is in every `-O` level; naming it
  explicitly (`--heap2local`) changes nothing at any rung. Alone it is nearly
  useless — on `union-box-call` it melts 0 of 4, and on the same-function variant
  it melts the outer box but not the inner payload, because one pass cannot see
  through the box it just removed.
- **The audit's full pipeline buys nothing more.**
  `--closed-world --type-ssa -O3 -O3 --type-merging --gufa -O3 --type-finalizing`
  (`wasm-toolchain-audit.md` §1) produces byte-identical output to the shipped
  four-flag set on all six fixtures. The type passes are not carrying anything on
  these shapes, so they are not shipped.

### The shapes that do NOT melt

The first is the one that matters most to the customer and it was found by
re-measuring this section's own headline rather than by a fixture, so it is
stated first and the table above must be read through it.

0. **READING THE NARROWED VALUE blocks the melt completely — and that is what
   real per-tick code does.** The `union box … 4 → 0` row is measured on a
   fixture whose `is` arm tests the tag and never touches the payload
   (`if u is i64 { acc = acc + 1 }`). Add the read and every allocation comes
   back, at every rung including the full release profile. The union KIND moves
   it too: the 4 → 0 row is a SCALAR union (`i64 | boolean`); the same program
   over a struct union melts only half.

   | shape (same loop, same helper, release profile) | none | `-O3` profile |
   | --- | ---: | ---: |
   | scalar union `i64\|boolean`, tag test only — *the table's row* | 4 | **0** |
   | struct union `Hit\|Miss`, tag test only | 4 | **2** |
   | scalar union, payload read (`acc + (u as i32)`) | 4 | **4** |
   | struct union, field read (`acc + u.dist`) | 4 | **4** |

   The `else` arm is irrelevant (tag-only with and without an `else` both give 2).

   **CORRECTED BY #1320 — "whether the narrowed value is consumed" is ONE of TWO
   variables, and it is the less important one.** Every cell in the grid above has
   the box constructed at TWO allocation sites (the helper has two `return`s, one
   per arm). At ONE site the box melts *whatever* is done with it:

   | construction sites | payload read? | none → `-O3` |
   | ---: | --- | ---: |
   | 1 | **yes** | 2 → **0** |
   | 1 | no | 2 → **0** |
   | 2 | no | 4 → **0** |
   | 2 | **yes** | 4 → **4** |

   So the rule is: *a union box melts when it is constructed at ONE allocation
   site, whatever is done with it; at two or more sites it melts only if the
   payload is dead.* The consumption axis alone does not explain the grid, and
   reporting it as the discriminator understates what is fixable — see
   `unboxed-union-rep-design.md` §2.

   So P1.3's ask — "vl's union boxes must melt in per-tick scratch code" — is
   **answered NO for the shape a sim actually writes**, and yes only for a box
   that is allocated, tag-tested and discarded. A kernel that writes
   `if e is Unit { e.hp … }` allocates once per trip at every optimization level
   available today. **Filed, not fixed.**

   **A16 is NOT the fix, and it is worth saying so here because the adjacency is
   inviting.** `litunion-compact-rep-design.md` §5 prices every payload encoding
   at *one allocation — the box only*; A16 changes what the box's `value` field
   HOLDS (an atom id rather than a string ref), not whether the box exists. The
   allocation that survives here is the box itself, so a compact payload leaves
   this row exactly where it is. What would move it is an unboxed union rep — the
   tag carried without a heap object at all — which is a different and much larger
   question than A16, and nothing in this document licenses it.

Both of the following are characterized, not mysterious, and both are pinned as
fixtures so the rule stays honest.

1. **A union box reached through a ref-typed local with two definitions.**
   `union-box-branch-local` writes `let u: i64 | boolean` on two paths and narrows
   after the join. At `-O3` the payload is gone — the box has collapsed to a
   one-field `{i32}` holding only the tag — but the `struct.new` survives, twice.
   Heap2Local scalarizes **per allocation site**, so when two sites merge into one
   local, neither can own it. The rule for per-tick scratch code:

   > A scratch box melts when its allocation reaches its uses as an EXPRESSION.
   > Build it with `const u = <helper call>`, not by assigning a `let` on two
   > branches. `union-box-call` and `union-box-branch-local` are the same program
   > written both ways: 0 sites versus 2.

   **THAT GUIDANCE IS NOT SUFFICIENT AS WRITTEN, and #1320 measured why.**
   `union-box-payload-read.vl` *is* written with `const u = <helper call>` and it
   does not melt — because the HELPER has two `return`s, and two returns are two
   allocation sites just as surely as a `let` written on two branches is. The site
   count is a property of the PRODUCER, not of how the consumer binds it.

   **And there was no VL spelling that fixed it** — measured, three ways. A single
   `return` of an `if`-expression and a single `return` of a local assigned on two
   branches BOTH still emitted two sites and both stayed 4 → 4 (verified
   independently). `emitUnionIfValue` routes each arm through `emitUnionCoerce`,
   so the arm count was the site count regardless of syntax. That is precisely why
   #1320 refuses a documented-pattern answer and recommends an emitter-side
   box-sink instead: there is no pattern to document.

   **THE SINK HAS SINCE CLOSED EVERY SPELLING BUT THIS ONE, so the row that
   survives is narrower than the rule above states.** A multi-`return` producer,
   a `return` of an if-expression and a `const u = if c { a } else { b }` BINDING
   all reach one site and melt at `-O`. What is left is the literal shape of this
   fixture — an init and a LATER assignment, two writes with no merge point
   between them — and closing it means holding the tag and payload across a
   liveness window rather than rewriting a join, which is a REP question.
   `unboxed-union-rep-design.md` §12.4 has the argument and the before-number.

2. **The BACKING ARRAY of a grown list.** In `list-wrapper-push` the
   `{backing, len, cap}` wrapper itself melts completely — zero `struct.new` at
   `-O3`, which is exactly what P1.3 asked for. What survives is `array.new_fixed`
   (the empty backing) + `array.new_default` + `array.copy` (the growth). Growth
   allocates an array whose indices are dynamic, and binaryen's Heap2Local
   scalarizes structs and only fixed-size, constant-indexed arrays. **Filed, not
   fixed**: a per-tick loop that wants zero allocation should size its scratch
   list once (a literal, or a list hoisted out of the loop), not grow it per trip.

---

## 4. Is `--closed-world` SOUND for VL output?

`buffer-design.md` §O left this open ("whether `--closed-world` is safe for VL
output generally"). It is answered by measurement rather than by argument.

**All 1,338 corpus `@run` cases produce identical stdout AND identical exit status
through the shipped profile** (built plain, built release, both run under
wasmtime; traps compared as exit status). Zero divergences, zero `wasm-opt`
failures.

The invariant it rests on is stated in `wasm-toolchain-audit.md` §1 and is
DECISIONS H6: **no GC type reaches an import or export.** VL's module boundary is
scalar-only — i32 print imports, i32 driver exports. Under `--closed-world`
binaryen treats any type reachable from the boundary as public, refuses to modify
it, and a public type poisons its whole rec group; a scalar boundary means there
are none. **The day VL exports a GC-typed function — a host-visible string or
struct ABI — this flag has to be re-audited**, and the 1,338-case sweep is the
instrument for doing it.

---

## 5. Cost, and why `-O` still exists

On the 1.1 MB `vl-compiler.wasm`, binaryen 130:

| profile | size | wall (min-of-3) |
|---|---|---|
| (none) | 1,120,712 | — |
| `-O` | 918,258 | 13.1s |
| `-O3` (release) | 919,547 | 19.5s |

**The release profile is ~1.3 KB BIGGER than `-O` on a large module**, and ~50%
slower to produce. Inlining duplicates code and duplicates allocation *sites*
(7,090 → 7,635 statically) even as it removes allocations *executed*. So `-O` is
not vestigial: it is the fast rung for a compile-edit loop. On the small fixtures
the release profile is smaller on every one (e.g. 122 → 97 bytes), because there
the inlining has nothing to duplicate.

**`-O3` is not automatically what a shipped artifact gets.** On tight scalar loops
both rungs are a LOSS under wasmtime — up to 2.4× — for a reason that is not in
either flag set. §7.

---

## 6. Where this is wired

- `scripts/vl-host/src/main.rs` — `RELEASE_PASSES` (the flag set), `OPT_PASSES`,
  `BINARYEN_FEATURES` (shared with `--wat` so the binaryen call sites cannot
  drift), `optimize_in_place`.
- `tests/fixtures/opt-melt/*.vl` — the melt fixtures.
- `tests/fixtures/opt-loop/*.vl` — the loop-shape fixtures (§7).
- `tests/selfhost_native_release_test.ts` — the melt table and the loop-shape table
  as goldens, behaviour preservation, `-O3` beating `-O`, and the
  missing-`wasm-opt` soft no-op. Env-gated like the `-O` suite
  (`SELFHOST_NATIVE_ALIGN=1` + the binaries).

---

## 7. The `-O` REGRESSION: loop rotation

`perf-landscape.md` §P11 records the release profile making two benchmarks SLOWER
and asks for it to be gated or fixed. Both regressions reproduce. Neither is caused
by any member of `RELEASE_PASSES`, and there is no flag set that avoids them.

### 7.1 Both regressions reproduce

Interleaved A/B, `taskset -c 2-5`, `vl run <prebuilt.wasm>`, with the plain module
entered TWICE under different names so the noise floor between two identical
configurations is read from the same run rather than assumed. Load average ~3–4
throughout; every module's stdout was checked against `meta.expect` first.

| benchmark | plain (A) | plain (B) | `-O3` | ratio | floor (A vs B) |
|---|--:|--:|--:|--:|--:|
| `arith/mixed-width` (min-of-9) | 197.2 | 199.1 | 475.7 | **2.41×** | 1.0% |
| `arrays/binsearch` (min-of-7) | 1406.0 | 1446.9 | 1713.8 | **1.22×** | 2.9% |

Both land on the landscape's figures (2.43× and 1.23×). Nothing here is subtle:
`mixed-width`'s slowest plain sample is faster than `-O3`'s fastest by 2.1×.

### 7.2 The flag bisection — no member of the profile is responsible

Seventeen flag combinations built from the same plain module and timed in one
interleaved pass (min-of-7 ms):

| flags | mixed-width | binsearch |
|---|--:|--:|
| *(plain, control A / control B)* | 200.2 / 193.0 | 1342.6 / 1343.1 |
| `--closed-world` alone | 202.6 | 1394.0 |
| `--gufa` alone | 199.0 | 1361.4 |
| `-O` | **470.9** | **1668.5** |
| `-O2` | 471.8 | 1570.9 |
| `-O3` | 467.7 | 1695.2 |
| `--closed-world -O` | 472.1 | 1701.4 |
| `--closed-world -O3` | 480.9 | 1746.3 |
| `-O3 --gufa` | 463.9 | 1679.1 |
| `-O3 --gufa -O3` | 478.6 | 1626.4 |
| `--closed-world -O3 --gufa` | 469.7 | 1808.9 |
| `--closed-world -O3 -O3` | 470.8 | 1657.9 |
| `--closed-world -O3 --gufa -O3` *(shipped)* | 470.5 | 1739.1 |

Read the first two rows against the rest. **`--closed-world` and `--gufa` each do
nothing at all, and every combination containing ANY `-O` level costs the whole
regression.** The shipped four-flag profile is not measurably worse than bare `-O`
on either program. The level does not matter, the repeat does not matter, and the
world assumption does not matter.

Two consequences, and the second is the one that reframes P11:

1. **The release profile did not introduce this.** `vl build -O` — the shrink rung,
   long shipped and not under review — carries it identically. So does anything
   else that runs `wasm-opt -O` over VL output.
2. **Option "change the flag set so it is never a regression" is REFUTED by
   measurement, not declined.** Every flag set that melts an allocation contains an
   `-O` level, and every flag set containing an `-O` level regresses. The two
   properties are carried by the same member.

### 7.3 The transformation, named

VL emits a top-tested loop:

```wat
(block $b (loop $l (br_if $b (i32.eqz COND)) BODY (br $l)))
```

binaryen rewrites it to put the back-edge inside an `if`:

```wat
(loop $l (if COND (then BODY (br $l))))
```

That is the *entire* hot-loop difference on `mixed-width`. Diffing the two
disassemblies, the loop bodies are instruction-for-instruction identical; the only
other change anywhere is that the trip bound `n` is constant-propagated out of its
local, and the `main()` wrapper is inlined. Both loops in `binsearch`, and its
`.push` fill loop, get the same rewrite.

Isolated by hand-editing the `-O` output — one variable per module, each assembled
with `wasm-as` and each verified to print `meta.expect` before being timed
(min-of-9, interleaved):

| variant | loop shape | trip bound | ms |
|---|---|---|--:|
| V0 | `-O`'s (`if`) | constant | 469.5 |
| **V1** | **reverted to `br_if`** | constant | **196.3** |
| V2 | `-O`'s (`if`) | back in a local | 469.0 |
| V3 | `br_if` | local *(= VL's own shape)* | 197.6 |
| — | *(plain module, control)* | | 202.9 / 201.1 |

**Reverting only the loop shape recovers the whole 2.4×. Undoing the constant
propagation recovers none of it.** No binaryen pass performs the rotation on its
own — `--remove-unused-brs` alone leaves the `br_if` in place — and no flag undoes
it: `--rereloop` requires `--flatten`, and the pair leaves a module with 27 locals
that would need another `-O` to clean up, which rotates it again.

### 7.4 Whose defect it is: the V8 control

The same four modules under V8 (deno, `WebAssembly.Instance`, the `start` function
doing the work), min-of-5:

| | V0 (`if`) | V1 (`br_if`) | V2 | V3 |
|---|--:|--:|--:|--:|
| V8 | 190.6 | 194.0 | 196.3 | 195.6 |
| wasmtime | 469.5 | 196.3 | 469.0 | 197.6 |

**V8 compiles both shapes to the same speed.** binaryen's output is not worse wasm;
it is wasm that wasmtime/Cranelift compiles worse. This is an upstream codegen
defect, and it is the same class of finding as §4.5's Cranelift `array_elem_addr`
row in `perf-landscape.md` — pinned by a cross-engine control rather than argued.

### 7.5 Why it grades by loop-carried count

The same kernel at one, two and three accumulators, each spelled both ways
(min-of-7; A and B print identical output at every rung):

| loop-carried accumulators | A (`br_if`) | B (`if`) | penalty |
|---|--:|--:|--:|
| 1 | 86.6 | 84.9 | **1.00×** |
| 2 | 128.3 | 174.1 | **1.36×** |
| 3 | 192.9 | 463.6 | **2.40×** |

A rotated loop is not harmful by itself. Reading the machine code (modules
serialized through the host's own wasmtime and disassembled with `objdump`) says
why. At three accumulators, shape A's loop body is 17 instructions with one store
and no load — the i32 accumulator lives in `edx`, the i64 in `rsi`, the f64 in
`xmm0`. Shape B's is 25, and the extra eight are:

- **four register shuffles on entry** to the `then` block and **four on exit**
  (`mov rsi,rdi` / `mov rcx,rdx` / `mov rdx,r12` … and their inverses), because the
  rotated loop is two blocks and every carried value has to be materialised at the
  block-parameter positions on both edges;
- **`movdqu xmm0,[rsp]` / `movdqu [rsp],xmm0`** — the f64 accumulator makes a stack
  round-trip every iteration. Shape A stores it once per trip and never reloads it.

The reload sits **on the loop-carried dependency chain** (`vaddsd` consumes it), so
it adds store-to-load-forwarding latency per iteration rather than throughput. At
one accumulator nothing needs shuffling, no value spills, and the shape is free —
which is exactly the 1.00× row.

### 7.6 The ruling

**The profile is not wrong as shipped, and its flag set is exonerated. The GUIDANCE
was wrong, and P11's attribution was wrong.** The landscape names
`--closed-world -O3 --gufa` as "actively destroying the mixed-width cast sequence";
the cast sequence is untouched (byte-identical instructions), and the three named
flags contribute nothing — bare `-O` is the whole effect.

The four options, decided on the evidence above:

- **(a) change the flag set** — REFUTED (§7.2). Melting and rotating are carried by
  the same member; no set has one without the other.
- **(b) refuse to ship `-O3` guidance until the suite is clean** — REJECTED. The
  suite cannot be made clean by anything in this repo, so this is a permanent veto,
  and it would forfeit 11.8× on `algorithms/lambda-hot` and 2.90× on
  `collections/struct-field` to avoid 2.4× on tight scalar loops. It would also
  leave `-O`, which has the identical defect, unreviewed.
- **(c) split into a safe default and an aggressive opt-in** — REJECTED, and it is
  worth saying why the obvious split does not exist: the "safe" rung would have to
  be the one without an `-O` level, which melts nothing at all. `-O` is not the safe
  rung; it has the same defect at the same size.
- **(d) report upstream and document meanwhile** — **ADOPTED.** The defect is
  Cranelift's register allocation on a rotated loop, established by the V8 control
  and the machine code. `RELEASE_PASSES` and `OPT_PASSES` are unchanged.

What ships instead of a flag change is a **caveat with a number and a gate with a
proxy**:

> **`-O`/`-O3` are a large win on allocation- and closure-heavy code and a LOSS of
> up to 2.4× on tight scalar loops under wasmtime.** The severity grades by how many
> values a hot loop carries across its back-edge: one is free, three costs 2.4×. The
> gap is a wasmtime/Cranelift defect, not a VL or binaryen one — the same modules run
> at identical speed on V8 — so it is expected to close from underneath us, and the
> gate below is what will notice when it does.

### 7.7 The gate, and why its proxy is stable

`tests/selfhost_native_release_test.ts` pins, per fixture in
`tests/fixtures/opt-loop/` and per rung, the triple **(loops, rotated, carried)**:
how many `(loop` headers the module has, how many are in the rotated shape, and the
largest set of distinct locals written inside one loop.

Timing cannot be the proxy — CI is shared, and this box was measured swinging
2.5–4× on identical binaries. The loop shape can be, for four reasons:

1. **It is deterministic.** Static counts over the `vl build --wat` dump, with
   binaryen pinned by `package-lock.json`. No load sensitivity, no flake.
2. **It is what the slowdown was traced to**, not a correlate — hand-editing exactly
   this shape back recovers 100% of the 2.4× (§7.3), and the machine-code difference
   it produces is the mechanism (§7.5).
3. **It carries the severity axis.** `rotated` alone would grade `scalar-accum-1`
   (measured 1.00×) the same as `scalar-accum-3` (2.40×); `carried` is what
   separates them, and the calibration 1 → 1.00×, 2 → 1.36×, 3 → 2.40× is measured.
4. **It is independently load-bearing**, which was checked rather than assumed: a
   sabotage appending `--flatten --rereloop --vacuum` to `RELEASE_PASSES` fails all
   three loop rows while **all seven melt rows still pass**. The melt table is blind
   to this class.

The `none` column pins VL's own emission at zero rotated loops on the scalar
fixtures. If a `compiler/*.vl` change ever emits the rotated form directly, the
default build inherits the penalty with no flag available to escape it, and that row
is what says so.

Both directions fail loudly. A count that goes UP means a flag change made a pinned
program slower; one that goes DOWN is a finding — most likely that wasmtime or
binaryen fixed this — and the golden update is the record of it.

### 7.8 What was refuted along the way

- **"`--closed-world -O3 --gufa` is destroying the mixed-width cast sequence"**
  (`perf-landscape.md` §P11). The cast sequence is untouched — the loop bodies are
  instruction-identical before and after. All three named flags are innocent; the
  effect is bare `-O`'s.
- **"the `-O3` regressions"** as a release-profile property. `vl build -O` carries
  both at the same magnitude.
- **Constant propagation of the trip bound** as a contributor: 469.0 vs 469.5 ms
  with and without (§7.3).
- **`--gufa` as a byte win in isolation**: it GROWS the compiler module by 7.9 KB
  and only nets −593 bytes because an `-O3` runs after it (§3).
- **`--gufa`'s ~2s cost**: under a second, within noise of its own control (§3).

---

## 8. The feature enables are a COMPATIBILITY CONTRACT, not a tuning knob

`BINARYEN_FEATURES` is shared by `-O`, `-O3` and `--wat` (§6). Every other flag in
this document trades one number against another; these do not. **A wasm feature
binaryen does not have enabled is not a missed optimization — it is a hard build
failure**: `wasm-opt` exits 1 with `error validating input` and writes **no output
file**, so `optimize_in_place` `bail!`s and the program cannot be built at that rung
at all. The failure is total and it lands on whoever writes the construct, not on
whoever changed the flag.

That is why the list is populated **ahead of** the emitter producing the opcodes:

| enable | opcodes | why it is here before it is needed |
|---|---|---|
| `--enable-reference-types`, `--enable-gc` | all of VL's heap output | required today; binaryen will not validate VL output without them |
| `--enable-bulk-memory` | `memory.copy` / `memory.fill` | the linear-memory tier (`buffer-design.md` §B4) |
| `--enable-tail-call` | `return_call`, `return_call_indirect` | the tail-call emitter (`perf-landscape.md` P1, worth 2.06× on `recursion/tailcall`) |

Measured for the tail-call row, since it was added on the strength of a slice that
had not landed yet:

- **Without it**, `wasm-opt` rejects a `return_call` module at BOTH rungs — rc=1,
  `return_call* requires tail calls [--enable-tail-call]`, no output file. So the
  day the emitter starts producing it, every tail-recursive program stops building
  under `-O` and `-O3` while building fine without a flag.
- **With it**, both rungs return rc=0 and the `return_call` **survives** the full
  release profile (it is not rewritten back to a `call`, which would silently undo
  the 2.06×). The optimized module runs on the host and prints the right answer.
- **No host change is needed to RUN it**: wasmtime 47 has the proposal on by
  default, and the module executes correctly unoptimized and at both rungs.

Pinned by `tests/fixtures/opt-tailcall/tailcall.wat` and its case in
`tests/selfhost_native_release_test.ts`. Two deliberate choices there:

1. **The fixture is `.wat`, not `.vl`.** A tail-recursive `.vl` program compiles to
   a plain `call` until the emitter slice lands, so it would pass with or without
   the enable — inert for exactly as long as the gate is the only thing standing
   between a flag edit and a broken `-O`. Hand-written wasm is what makes the gate
   live from the commit that adds the flag.
2. **The flag lists are parsed out of `main.rs`** rather than copied. A test with
   its own copy of `BINARYEN_FEATURES` passes while the shipped list is broken;
   parsing means the test either exercises what ships or fails loudly saying it
   could not find the list.

**When a slice adds an opcode from a new proposal, its enable belongs here in the
SAME change**, and the test above is the pattern to extend.
