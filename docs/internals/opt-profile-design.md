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
claim below is that number, read out of the disassembly.

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

Six per-tick-scratch fixtures, `tests/fixtures/opt-melt/*.vl`. Each is a loop that
allocates and consumes scratch and stores nothing. The number is **allocation
sites (`struct.new*` / `array.new*`) surviving in the module**, read out of
`vl build --wat`. Pinned as goldens by `tests/selfhost_native_release_test.ts`.

| fixture | what it is | (none) | `-O` | `-O3` |
|---|---|---|---|---|
| `struct-scratch-call` | `{x,y}` record built by a helper, read, discarded | 3 | **0** | **0** |
| `list-wrapper-literal` | `[i, i+1, i+2]` built and read in the loop | 3 | **0** | **0** |
| `list-wrapper-call` | same list, built by a helper across a call | 3 | **0** | **0** |
| `union-box-call` | `i64 \| boolean` from a helper, `is`-narrowed in the loop | 4 | 4 | **0** |
| `union-box-branch-local` | same box via a `let` written on two paths | 4 | 4 | **2** |
| `list-wrapper-push` | scratch list GROWN by `.push` each trip | 6 | 3 | **2** |

The count is over the whole module, which is the honest upper bound: unoptimized,
some sites live in helpers the loop calls; optimized, everything reachable has
been inlined into the one loop, so the module IS the loop.

**The headline: `-O` melts no union box at all, and `-O3` melts them.** That is the
P1.3 ask, answered — and it is the same one-flag cliff `buffer-design.md` §L4
priced at 3.5× on kernel speed, now visible as a count rather than a duration.

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
- **The trailing `-O3` (the repeat) is load-bearing.** It is the only member that
  moves `list-wrapper-push` from 4 sites to 2 — and note `--closed-world -O3`
  alone is *worse* there than plain `-O` (4 vs 3), a regression the second pass
  more than recovers. It is also ~15% of module size on its own (113 → 97 bytes on
  the small fixtures). This is the guidebook's "non-LLVM GC compilers need
  repeated runs" advice showing up with a number.
- **`--gufa` is measured INERT on VL output.** Zero allocation sites and zero
  `ref.cast`s removed, on all six fixtures AND on the 1.1 MB `vl-compiler.wasm`
  (4503 casts with and without). Its whole contribution is −571 bytes and +2s of
  wall clock on that module. It is in the set because P1.3 names it explicitly and
  because it is cheap — **not because it was observed to do anything.** If the
  profile ever needs to get faster, this is the flag to drop first.
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
   The discriminating variable is whether the narrowed value is *consumed*.

   So P1.3's ask — "vl's union boxes must melt in per-tick scratch code" — is
   **answered NO for the shape a sim actually writes**, and yes only for a box
   that is allocated, tag-tested and discarded. A kernel that writes
   `if e is Unit { e.hp … }` allocates once per trip at every optimization level
   available today. **Filed, not fixed**; it is the strongest remaining argument
   for the A16 literal-union compact representation and for a non-boxing union
   rep generally, since the fix is to not allocate rather than to melt.

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

| profile | size | wall |
|---|---|---|
| (none) | 1,113,934 | — |
| `-O` | 912,719 | 16s |
| `-O3` (release) | 914,086 | 26s |

**The release profile is 1.4 KB BIGGER than `-O` on a large module**, and 60%
slower to produce. Inlining duplicates code and duplicates allocation *sites*
(6,396 → 7,090 statically) even as it removes allocations *executed*. So `-O` is
not vestigial: it is the fast rung for a compile-edit loop, and `-O3` is what a
shipped artifact gets. On the small fixtures the release profile is smaller on
every one (e.g. 122 → 97 bytes), because there the inlining has nothing to
duplicate.

---

## 6. Where this is wired

- `scripts/vl-host/src/main.rs` — `RELEASE_PASSES` (the flag set), `OPT_PASSES`,
  `BINARYEN_FEATURES` (shared with `--wat` so the binaryen call sites cannot
  drift), `optimize_in_place`.
- `tests/fixtures/opt-melt/*.vl` — the six fixtures.
- `tests/selfhost_native_release_test.ts` — the melt table as goldens, behaviour
  preservation, `-O3` beating `-O`, and the missing-`wasm-opt` soft no-op.
  Env-gated like the `-O` suite (`SELFHOST_NATIVE_ALIGN=1` + the binaries).
