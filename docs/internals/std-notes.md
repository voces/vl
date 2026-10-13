# std — the compiler-facing notes

**Why this file exists.** A `std/*.vl` comment is API surface: the person reading it
imports the module. Everything that is true about the COMPILER rather than about the
API — why a shape was chosen, what a defect did, which row graded it, what a candidate
cost — was moved out of `std/` and into this file, so std reads as documentation and
this reads as the record. `std/` does not link here; the pointer goes one way.

The rule is `docs/internals/std-api-review.md` §4, enforced by `std-comment-audience`
in `compiler/lint.vl` (module-scoped to `std/`, no baseline).

**Read a claim here as a measurement with a date on it.** These paragraphs were true of
the compiler they were written against. Run the witness before you act on one — several
of them name the fixture or the probe that grades them. **This is not decoration: on the
day this file was created, four of the paragraphs lifted out of std were already refuted
by their own cited witnesses** (`i64-list-pop`, the float-tie divergence, D1030, D947).
Each now says so, in the shape the `concat`-vs-`+` bullet uses.

---

## `std:args`

- **Which clause admits it.** `docs/internals/std-design.md` D2's INVENTORY clause — "what
  the LANGUAGE story needs to be complete without third parties … fs/io/args once WASI
  lands", which names it outright — and NOT "a consumer in the tree", because there is
  none yet; converting `fuzzgen.vl`'s sed-rewritten flags is the FOLLOW-UP, not the
  warrant. `std-api-review.md` §2's last bullet is the criterion that asks.
- **Why `programArgs` and not `args`.** VL has no namespace import, and a module that both
  imports and declares a name is a HARD PARSE ERROR, so an export `args` would make
  `const args = args()` refuse to compile; `argv` promises the C layout this floor lacks.
  It is not `self`-first because argv has no receiver. It answers a LIST rather than
  `argCount()` + `argAt(i)` so that `string[]` reaches the generic surface, where an index
  protocol composes with nothing.
- **Not here, each for a reason.** No flag parsing: clustering, `--name=value`, `--`,
  repeated flags and typed defaults are each a policy a half-parser would settle silently,
  and none needs a new floor intrinsic. No bytes accessor and no lossy variant: every
  `std:fs` entry takes `path: string`, so non-text argument bytes could not open the file
  they name. No environment, exit code, program name or stdin.
- **The failure arm is currently unreachable.** The floor hands over `u8[]` and a POSIX
  argument is any NUL-free byte string, but both Rust hosts read `std::env::args()`,
  which panics before VL is instantiated. `programArgs` ships fallible anyway because
  widening a return type later is the breaking change std has no deprecation story for.
- **`Utf8Error` is BORROWED, not invented.** One failure domain; a new
  `ArgError = { code: i32, msg: string }` would be structurally identical to `std:fs`'s
  `IoError`. The re-export costs no host imports — measured, the import section stays
  at three, all called. Same mechanism `compiler/emit_base.vl` uses to republish seven
  type names from `typecheck.vl`.
- **The one `__trap__` rests on a `std:fs` FLOOR INVARIANT.** The empty-argument branch
  traps when `__fs_errno__()` is non-zero, and that is unreachable at both hosts ONLY
  because `__args_get__` zeroes the shared errno cell on success. `PROGRAM_ARGS` being
  immutable does not guard it: the adversarial case is a dirty cell left by an unrelated
  failed `std:fs` call followed by a legitimately empty argument. Cross-module coupling
  of this kind is what `std-api-review.md` §3's last bullet asks about.
- **A host wart the module cannot see.** `vl run p.vl -v x` delivers ONE argument,
  because the host discards unknown dash-led tokens with no diagnostic, while
  `vl run p.vl -- -v x` delivers both. Nothing in std can tell a dropped argument from
  an un-passed one. Pinned by `tests/vl_std_args_test.ts` (#1818).
- **The error is written where it is returned.** A struct produced by a CALL and flowing
  into a union position does not lower at this head, so `programArgs` re-spells the
  `Utf8Error` as a literal rather than forwarding `s`. `std:fs` records the same
  constraint.

## `std:array`

- **`extend`'s `other` is `readonly T[]`, and NOT for the reason it looks like.** The
  obvious reading — that the read-only view is what lets a narrower list be read as a wider
  one — is wrong, and the control refutes it: the same function with `other: T[]` accepts
  the covariant source too, and refuses a read-only ARGUMENT with the same words. Every
  call-site row is identical between the two spellings. What `readonly` actually buys is
  one row, the body: a write through a mutable `other` at a generic pin is `vl check`-clean
  and the write is SILENTLY LOST (D1799), while the read-only spelling refuses it by name.
  The word is load-bearing against D1799, not against invariance — do not drop it as
  redundant when D1798 closes.

- **`extend` cannot pass its own `readonly` parameter on, so `concat` still hand-rolls the
  loop.** `concat`'s `other` was widened to `readonly T[]` with `extend`'s, so the twins
  agree, and its body SHOULD read `out.extend(self); out.extend(other)` — the module being
  its own first consumer, and two of the tree's bulk-append loops gone. It cannot:
  `argument 1: expected T[], got readonly T[]`, because substituting `T` into `readonly T[]`
  drops the flag (D1798). The DRY rewrite is a one-line follow-up the day that row closes.

- **Why `extend` and not `pushAll` or `appendAll`.** `pushAll` promises the arity semantics
  of the core `push`, which is arity-1 and has no variadic form; `appendAll` is what
  ROADMAP §H4.6 called the hand-written workaround, so it names the thing being replaced.
  `extend` is in-place in every language that has it, and JS — the source of the `reverse`
  naming debt below — has no `extend` at all, so no reader arrives expecting a copy.
  Where a `u8[]` bulk append would live is not settled here: `std:bytes` reads bytes and
  does not write them, so its header would have to change first.

- **`other` joins the per-position surface below.** A read-only source position now exists
  and inherits that list exactly: it runs at `i32`, `i64`, `f64`, `boolean`, `string`, a
  nested list, a struct union and a map element, and an anonymous un-named object shape is
  the same loud emit reject `concat` already gives it, not a new carve-out.

- **`sorted`'s body is `sort`'s, copied, and that is a compiler limitation.** It should
  read `const out = …copy…; sort(out, less); return out` and cannot: a GENERIC function
  cannot pass its own generic-typed function parameter to another generic function. The
  direct call, the UFCS call, a forwarding local and a re-wrapping lambda were all
  refused. `tests/cases/std/array-sort-agrees.vl` is the differential fixture that keeps
  the two copies honest; the only intended differences are the leading copy and the
  tail, where `sorted` returns whichever buffer holds the answer.
  The refusal is lifted (D2552, `tests/cases/std/generic-closure-forward.vl`); collapsing
  `sorted` onto `sort` is the pending follow-up.
- **`SORT_RUN` lives inside the function** rather than beside the module header: a
  module-level `const` is emitted as a wasm global whether or not anything imports the
  export that reads it, so it would be charged to callers who never sort.
- **How far the generic surface reaches, per position.** Admitted at element, `needle`,
  `reduce` accumulator and callback result: `i32`, `i64`, `f64`, `boolean`, `string`,
  nested lists, and string or numeric LITERAL UNIONS. At `needle` only: a nullable ref
  niche and the two i32-sentinel nullables. A MAP element is admitted at `mapIndexed`
  and `sorted`, refused at the four `needle` exports (the axis there is equatability,
  and a map has no compare core). The live carve-out is LOUD and is one mechanism at two
  spellings: an anonymous object shape the generic boundary cannot name. The remedy is
  to give the shape a NAME the boundary can see — a `type` declaration mints a row and
  need never be referenced, and so does any inline annotation of that layout anywhere in
  the program. Grids: `array-litunion-*.vl`, `array-struct-element-*.vl`,
  `array-needle-*.vl`, `array-reduce-*.vl` under `tests/cases/std/`.
- **`A` is the only door on this module that admits a DECLARED union.** A `Shape[]`
  receiver is loud at both scopes, a `mapIndexed` union RESULT is loud, and a
  union-member struct as a map value is a loud emit refusal. A union MEMBER is a
  different door and is admitted.
- **`concat` used to beat `+` for some element types, and no longer does — the std
  comment saying so was STALE and was deleted rather than moved.** `F[] + F[]` over
  `type F = 1.5 | 2.5` was a loud `vl check` reject (D102; before that it wrote invalid
  wasm) while `xs.concat(ys)` over the same lists ran, because `+` had exactly one
  lowering (`emitListConcatI`, hard-wired to the i32 backing) and `concat` is an ordinary
  `push` loop over `T`. Re-measured 2026-09-03 against the current seed: `+` RUNS at all
  five of the spellings that comment listed — `F`, `type G = 1.5`,
  `type BIG = 9999999999`, `1 | 2 | null` and `1.5 | 2.5 | null`. What `concat` still
  reaches that the SEARCH helpers do not is a non-equatable element (a map element runs
  through `concat` and refuses at `indexOf`), and that is the fact the export's doc
  comment now carries.
- **`u8[]` is outside the surface at every spelling, and it is a CHECKER error** — `T`
  ranges over value types and `u8` is storage, so a `u8[]` is not an instantiation of
  `T[]`. `tests/cases/std/error-u8-array-generic.vl` runs the pair side by side.
- **`reverse` is not in place, and that is a naming debt.** JS's
  `Array.prototype.reverse()` DOES mutate, so a JS-shaped reader writing `xs.reverse()`
  as a statement gets a silent no-op, clean at every severity. The rule going forward is
  that a building export whose verb also names a common in-place operation takes the
  participle instead (`sorted`); `reverse` predates it and std has no rename story.
- **`filled` is the one export with no receiver, and its hot path is two allocations
  behind one compare.** Its body is `__array_new__(n, v)`, and `wasm-dis` of an emitted
  instance reads: `i32.lt_s` against zero guarding a cold arm (a per-character print loop
  over the message, held in a module-level global, then `unreachable`), then `array.new`
  for the backing and `struct.new` for the list wrapper. That is O(1) code against a
  `push` loop's O(n), which is the whole reason to prefer this body — *"it lowers to one
  instruction"* was the first wording here and the disassembly refutes it. The export
  exists to put a std name on an intrinsic a program should not be spelling, which is
  what its consumer asked for (glean VL-019 / R8: *"either bless the intrinsic under a
  std name or make `[]` take a size"*). `n` is the first parameter because a length reads
  first in `filled(256, 0)`, and there is no receiver to be `self`: the module header
  carries that deviation, per `std-api-review.md` §4.5.
- **A REFERENCE fill is SHARED across every slot, and that is `array.new`, not a
  shortcut.** `filled(4, { count: 0, symbol: -1 })` writes one struct reference into four
  slots, so `nodes[0].symbol = 7` is visible at `nodes[3]`. It is the Python
  `[[0] * n] * m` trap and it is in the doc comment for that reason. **The remedy is one
  call in this same module** — `filled(n, 0).mapIndexed(f)` builds a fresh object per
  slot, measured distinct at both a struct and a list element — and the doc comment names
  it, because a hazard whose answer is one call should carry the answer.
  `tests/cases/std/array-filled-elements.vl` pins both halves and the remedy.
- **The struct element and the list element were two fixtures because they could not be
  instantiated in ONE module; D1605 closed that and they are one file again.** A generic
  `T[]` constructor over `__array_new__` pinned at a named struct AND at a nested list
  emitted check-clean invalid wasm, and the order decided it — nested-first ran, and so
  did either alone. The mechanism was not the order: `refListElemNameOfExpr` answered ""
  for a fill whose type only the monomorphized instance knows, and `refListSlotOfExpr`
  clamped that miss to slot 0, the first-interned ref row. The direct
  `__array_new__(2, [1,2])` is still a *different* cell — silent ALONE, with a different
  message, and the wrapper FIXES it, because through the wrapper the fill is an identifier
  rather than an array literal, so `filled` is a small capability gain here as well as a
  rename. `scripts/capability-probes/generic-array-new-struct-then-nested.vl` is the
  standing witness, and it now runs.
- **Three element types are outside the surface and every one of them is the raw
  intrinsic's, not this export's.** A value-union element (`(i32 | string)[]`) and a
  nullable-ref element (`(Node | null)[]`) are check-clean invalid wasm; a bare `null`
  fill is the loud `bare null needs a struct-typed context`; a closure fill is the loud
  `only i32[] arrays and struct/union element arrays are supported`. Each behaves
  identically at the direct `__array_new__` spelling, so `filled` inherits them. The
  nullable-ref one is the sharpest, because "fill with a placeholder and write the slots
  later" is the shape a length-first constructor is FOR:
  `scripts/capability-probes/array-new-nullable-ref-fill.vl`. D1605 did not move any of
  them: their mechanism is `arrNewIntrKind`'s kind ladder falling through to the i32 list,
  not the element-name channel that row closed. Through `filled` the same fall-through
  also claims an `f64[]`, `i64[]` or `u8[]` element, each of which runs at the direct
  spelling — so that one is a pin-only face, filed on D1605 as residue.
- **Not done, deliberately:** no `sortUnstable`, no `sortBy`/`sortedBy`, no default
  ordering `xs.sort()` (`<` is defined for the scalars and `string` but not for a struct
  or a union, and VL has no overloading to express that), no `binarySearch`/`lowerBound`
  (excluded by name in `perf-workstream.md` §6.2), and no adaptivity. No `filledWith(n, f)`
  taking a producer per index: `mapIndexed` over a `filled` list already composes into it.

## `std:buffer`

- The design record is `docs/internals/buffer-design.md`; the module implements §C's
  sequencing item S5, with O1 = (c) — `Buffer` is std VL, not a compiler-known type.
- **Bounds: none, by design (§A4) — with two exceptions, both for one reason.** An access
  past the end of the MEMORY traps in the engine, and that trap is the memory-safety proof;
  a VL-level check would only make it quieter. Past the end of a `Buf` but still inside the
  memory is where that proof does not reach, and that is what both exceptions check. The
  typed views check at construction (§J3 is why, rather than per access); the `u8[]` bulk
  pair checks per call. `bulk-copy-design.md` §E3 proposed that the pair NOT check and treat
  a short `src` as fewer bytes; the owner overrode it, because an over-long range hands
  `writeFile` or a decoder a `u8[]` whose tail is a neighbouring buffer's bytes with nothing
  to tell it apart.
- **`memory.grow` detaches every host view of `exports.memory.buffer`** (O5 = lazy
  growth, no epoch export). A stale view is detectable by `view.byteLength === 0`. This
  is what Emscripten's `updateMemoryViews()`, wasm-bindgen's `byteLength === 0` probe
  and Go's `wasm_exec.js` buffer-identity check all do; none exports a growth counter,
  and neither does this module.
- **`ensureCapacity`'s `-1` branch is defensive, not routine.** `Buffer`'s i32 overflow
  guard caps `end` at 2^31 — at most 32768 pages — and wasm32's own ceiling is 65536, so
  the SPEC limit is unreachable from here and only host resource exhaustion produces the
  -1. Both hosts grow a 2 GiB request without complaint (wasmtime 47 and V8 alike,
  measured), which is why no corpus fixture pins that line.
- **The heap window is the build's, not the module's.** `__heap_base__()` and
  `__heap_limit__()` each lower to a `global.get` of an immutable global the emitter appends
  only when a program reads one, set by `vl build --heap-base=/--heap-limit=` (defaults 1024
  and 2^31-8). The allocator counts `bumpOff` from the base, so its global keeps a constant
  initialiser and the module needs no start function.
- **`Buffer`'s window check is one comparison, and that is load-bearing.** `byteLength >
  limit - base` cannot overflow (the window lies in `[0, 2^31)`) and, because both ends are
  multiples of 8, a length that passes still fits once rounded up — so it REPLACES the old
  `next < base` overflow check instead of joining it. Adding it as a second check pushed
  `Buffer` past the always-inline size `vl_view_descriptor_melt_test.ts` prices (§M4), and
  the `Buf` stopped melting; a lazy "0 means unstarted" bump pointer did the same.
- **`ALIGN` is a performance choice, not a correctness one.** Wasm's alignment immediate
  is a hint and every load/store here is legal at any address; the unaligned cases in
  `tests/cases/memory/` pin it.
- **`fill`'s guard is policy, and it is std's job (O1 = (c)).** Both bulk instructions
  take an UNSIGNED byte count and VL has no unsigned i32, so a negative `len` is ~4 GiB
  and traps in the engine (`tests/cases/memory/bulk-negative-length-traps.vl`). The byte
  loops these bodies replaced treated a non-positive `len` as "write nothing", and that
  behaviour is pinned by `tests/cases/std/buffer-bulk.vl`.
- **`fill` nests rather than returning early** because a BARE `return` in a void function
  type-checks and then fails at emit with `emitProgram: bare return is not supported`.
  `std:array`'s `sort` has the same shape for the same reason.
- **`store8` must stay one instruction.** A read-modify-write over the containing word is
  unobservable from VL (no threads, no shared memory) but not from the host, and
  `tests/vl_exported_memory_test.ts` reads the untouched neighbours through the exported
  memory. `store16` was two byte-wide read-modify-writes because a halfword at an address
  congruent to 3 mod 4 straddles two words; the instruction has no such difficulty.
- **The views are `new` because VL is STRUCTURALLY typed** (`newtype-design.md`): spelled
  plainly, `F32View` and `I32View` would be ONE type and `iv.getF32(0)` would silently
  reinterpret integer bytes as a float. Erasure makes the brand free; §M has the rulings.
- **`F32Base` is a separate MINTER, not `byteAddrF32`'s return type.** Branding that one
  was tried and is wrong: it exists for raw address ARITHMETIC, and a brand makes
  `a + (i << 2)` a type error (`operator '+' mixes F32Base and i32`) at every use in this
  tree.
- **The hoisted accessors are a LIBRARY answer to a measured cost.** The view accessors
  take the view, so each access re-reads `base` and `length` and nothing hoists those out
  of a loop; the compiler-side repairs were measured and REFUTED (§M8).
- **`getF32At`'s leading `base` is nominal `self`-first only.** An `F32Base` is an i32
  newtype and an i32 is not a UFCS receiver — `pb.getF32At(n, i)` is
  `member access '.getF32At' on non-object F32Base`. It keeps the leading slot for
  uniformity with `bufferMark()` / `bufferRelease(mark)`.
- **The bracket forward is a real frame at the unoptimized rung.** `x[i]` emits a call to
  the `"[]"` function, which then calls `getF32`, where `x.getF32(i)` emits one call. Both
  `-O` and `-O3` inline it away; §M2 has the number. `wasm-opt -O` does NOT inline the
  plain accessor wrappers; `-O3 --closed-world` does (§O1).

- **`window` is a view, not a copy, and CHECKS its range** — the one `Buf`-returning
  function besides `Buffer`. It traps rather than answering an error, which is this
  module's convention for every range check (`storeBytes`, `loadBytes`, the views), and is
  why `std:fs` can take a window without a second error channel. Named by the std review
  (`fs-streaming-design.md` §5): `u8view` would promise the `[]` indexing the typed views
  have, `view` drops the width, `slice` copies on arrays. Not re-exported from `std:fs`.

## `std:fs`

- **`IoError` cannot extend the design doc's floor shape at this head.** It is meant to
  extend `{ msg: string }` (`error-handling-design.md` O3) and does not: a `{code, msg}`
  value does not satisfy a `{msg}` parameter, and `x is Err` over an `IoError` arm is a
  hard type error. So a caller handles `IoError` BY NAME and "any error" has to spell the
  union.
- **Every `IoError` is an object LITERAL at the site that returns it.** A struct produced
  by a CALL and flowing into a union position does not lower — `return someHelper()` from
  a function returning `T | IoError` fails at emit with `ref valtype with no interned
  shape`. That is why only the MESSAGE is factored out (`emptyPathMsg`) and not the error
  value; a constructor is the obvious tidy-up and it does not compile.
- **The `self`-first break is IN THE HEADER, not here**, and deliberately: a caller meets
  it at every call site. `self` is the UFCS switch, matched on the literal parameter name,
  so calling the first parameter `path` makes `"hello".readTextFile()` unspellable by
  construction — the thing operated on is the FILE, not the string naming it. The second
  break is NOUN-FIRST (`pathKind`/`pathExists`, not `kind`/`exists`): VL has no namespace
  import, so a bare `exists` would collide with every other existence check in the
  importer's flat scope, and `pathKind` is not `stat`, which would promise the size, mtime
  and mode this cannot report.
- **The errno global is a knowingly-taken deviation** (`std-api-review.md` §2 flags
  ambient state). Neither in-band shape lowered when it was written, so the reason travels
  out of band through `__fs_errno__()`, read immediately after the failed call. That
  constraint has since lifted — `u8[] | i32` lowers and runs (#1806) — and `emptyErrno` is
  the one place the swap has to happen.
- **`IoResult` is a named alias by preference, not by constraint any more.** A struct
  appearing both in an inline `S | null` and in another union of the same module used to
  fail at emit with `ref valtype with no interned shape`, because only the declaration
  route interned the shape. Both routes intern it now, the inline spelling lowering as the
  `nulvariant` niche.
- **Nothing pre-checks for the caller.** `readFile` does not stat first for a prettier
  error: a pre-check costs a syscall and buys a race, and nothing here is atomic against
  another process. `fileSize`'s `EISDIR` for a directory is decided in the HOST for the
  same reason — deciding it in std would cost a second syscall and a TOCTOU window.
- **`readFileRange` is positional, not a handle**, and that is what keeps the module's
  "errors are values, nothing is ambient" shape: every call carries its own offset, so
  there is no cursor to get wrong, no order dependence between two calls, and nothing to
  close. The price is one `open`+`seek` per window, paid deliberately. Its failure
  channel is `readFile`'s unchanged — empty plus a non-zero `__fs_errno__()` — which is
  why a short read and an empty read at end of file can both be successes.
- **`fileSize` answers off the i64 SIGN, and its reason off the errno cell — to keep the
  header's no-trap promise.** The floor returns `-errno` for a failure and a size is never
  negative, so one i64 carries both. `writeFile` and `pathKind` negate their floor's
  return directly, and `fileSize` deliberately does not: its return is an i64 and the only
  narrowing to the `i32` `code` field is `as!`, which ABORTS when the value does not fit.
  The header promises *nothing here traps*, so the reason comes from `__fs_errno__()`
  instead — which costs nothing, since the host writes the cell on every failure path.
- **The `i64` offset and `i32` length are not an oversight.** `length` bounds an
  allocation that has to fit in a `u8[]`, whose own `.length` is an `i32`; an `i64` length
  would be a type able to express a request the RESULT type cannot represent. `offset`
  addresses the file, which is not bounded by memory. The asymmetry costs the caller
  nothing — `off = off + w.length` widens the i32 silently — and the i64 survives the host
  boundary, which is the half worth checking: offset 2^32 answers empty rather than the
  file's head, and 2^31 answers empty rather than `EINVAL`.
- **`EFBIG` (22) is by number, deliberately.** `__fs_size__` answers `-EFBIG` for a size
  past `i64::MAX` rather than clamping, but the constant is not exported: it needs an 8 EiB
  file, so naming it would add a permanent std name for a branch no caller can take.
- **Naming, and the precedent that did NOT win.** `readFileRange` pairs with `readFile` and
  repeats its module, as the flat namespace requires. The tree's suffix for the same
  operation over a range is `At` (`decodeUtf8At`), and it is deliberately not followed
  here: `readFileAt` reads as "read the file at [a path]" against a first parameter that is
  a path. `fileSize` continues `pathKind`/`pathExists`'s noun-first split of what `stat`
  would have promised, and changes the noun on purpose — a PATH has no size, and the
  function refuses (`EISDIR`) when the path names something that is not a file.
- **`readFileInto`/`readFileRangeInto` take a `Buf` rather than a raw address, by owner
  ruling** — `bulk-copy-design.md` §F put the choice to the owner and the answer was the
  `Buf`. The price is that `std:fs` now imports `std:buffer`, and `std:buffer`'s body
  carries the memory intrinsics, so EVERY `std:fs` program gets a linear memory and a
  `memory` export whether or not it ever builds a `Buf`. Measured on a program whose only
  call is `readFile`: 26,124 → 29,171 bytes unoptimized and 927 → 1,260 at `-O3`. An `i32`
  address would have avoided it and would have dropped the length the truncation is
  measured against, which is the whole reason the count is meaningful.
- **A destination OFFSET, and no destination length**, as §E1 of that doc recommends. The
  window's length is `dst.length - dstOff`, so there is no second number that can disagree
  with the buffer about how much room there is, and an offset is what a caller assembling
  one buffer out of several reads needs. The two exports are the `readFile`/`readFileRange`
  split repeated, not a new axis.
- **One floor slot serves both.** `__fs_read_into__(path, offset, addr, cap)` is fs slot 9;
  `readFileInto` passes offset 0. Splitting it would have been a second host import with
  the same body, and the emitter's per-slot tables would carry two rows saying one thing.
- **It is the first fs slot that WRITES, so the use scan forces the memory.**
  `fsSlotTouchesMemory` (then `fsSlotWritesMemory`) sets `memUsed` exactly as `__memory_size__` does: the host looks the
  destination up by the module's `memory` EXPORT, so a program whose only contact with
  linear memory is this call still needs section 5 emitted and section 7 to name it.
  `tests/cases/intrinsics/fs-read-into.vl` is the pin — it carries zero load, store or
  bulk-memory instructions and its module still exports a memory.
- **`EFAULT` (21) is not an exported constant, deliberately**, on the same terms as `EFBIG`.
  The host answers it when a `Buf` window does not lie inside the memory, which a `Buf` from
  `Buffer(n)` cannot produce — that call grows the memory to cover the extent — so exporting
  the constant would add a permanent std name for a branch an allocating caller cannot take.
  `errnoName` does render it (`EFAULT (a Buf outside linear memory)`), since #3064: the
  message is what a caller with a forged `Buf` reads, and `errno 21` told them nothing.
  **The re-export widens who CAN take it**, which the API review found by writing the
  program: `Buf` is a structural type, so `const forged: Buf = { base: 0, length: 100000000 }`
  now type-checks with `std:fs` as the only import, and `readFileInto` through it answers
  `EFAULT` (21) — a value, not a trap, and the header's no-trap promise holds for a base past
  the end (21) and a negative base (28) alike. That is the price of `Buf` being trusted
  rather than checked, and the declarations say so.
- **The host LOOPS the read**, rather than taking one `read(2)`. That is what makes a short
  count mean end of file instead of a short syscall, and a stop condition that can also
  mean "the kernel felt like it" is not one a scan can use. A failure part-way through a
  window answers `-errno` and leaves whatever arrived in the buffer; the count is lost, not
  the bytes.
- **A window of ZERO bytes still opens the file.** A buffer with no room left is not a
  reason to stop answering the question the caller asked about the FILE, and the deciding
  argument is agreement: `readFileRange(p, 0, 0)` on a missing file is `ENOENT`, so
  `readFileInto` with a full buffer has to be too. The first draft short-circuited on a
  zero capacity and answered 0, which is a success the call never looked for.
- **The measurement that justified the out-parameter** is `bulk-copy-design.md` §B and §D —
  the copy loop is 0.1791 s of the 0.2374 s a 64 MiB read costs, and §2 of the API rubric
  requires it before a caller-owned buffer is admitted.
- **The write side: `writeFile` widened, `writeFileRange` and `appendFile` added** — the
  surface ruled in `fs-streaming-design.md` §5/§6, for plumb PL-020 (145 files of up to
  256 MB, each assembled in a `Buf`) and PL-009 (a 300 MB generated source). Four choices:
  - **One union source, `data: u8[] | Buf`**, rather than `…From` twins: three write names,
    not a 2×2 matrix. The read side's `Into` has no `From` mirror because a write returns
    `IoResult` whatever the source, while a read's return changes with its destination.
    VL has no overloading of named functions (`DECISIONS.md` B16). The widening changes no
    function-value binding: `writeFile` could not be taken as a value before (its
    `IoResult` result has no function-value ABI) and still cannot. A partial write from a
    `Buf` is `std:buffer`'s `window`; there is no copy-free partial write from a `u8[]`.
  - **Contiguous only, for now (Q4).** An offset past the file's length is `EINVAL`, never a
    zero-filled gap, so relaxing it later is additive. The host checks the offset against
    the size of the descriptor it OPENED (`fstat`), not a separate stat. On `EINVAL`, std
    reads `__fs_size__` for the message's length — the length when the error is reported,
    which is the one a caller can act on; a missing file reads `length 0`, and any other
    failed size read falls back to `failed()`'s errno rendering. At a non-zero offset a
    missing file is refused rather than created, so a refusal never leaves a file behind.
  - **`appendFile` exists by owner ruling (Q2)**, for logs. Its offset is the file's current
    length, state the call both reads and changes, and it is not idempotent across runs; its
    comment names `writeFile(path, [])` as the fresh start. It is not
    `writeFileRange(p, fileSize(p), d)`: `O_APPEND` reads and uses the offset atomically.
  - **`writeFile` now PROMISES to create a missing file**; the old comment left that to the
    host. Every host already did (`std::fs::write`), so no caller's behaviour changed.
- **`appendTextFile` exists by owner ruling (2026-09-23, `fs-streaming-design.md` §6 Q7)**,
  added after the three byte writes: logs are text, and an append of whole strings never
  splits a character. It mirrors `writeTextFile` exactly — the empty path is refused under
  its own name, and every other failure is reported by `appendFile`'s message, as
  `writeTextFile`'s are by `writeFile`'s. The header's text line became "text is UTF-8,
  whole or appended, never a byte range, which can split a character": `appendFile` is not a
  byte range, and `writeFileRange` and the range reads still have no text sibling.
- **Two floor slots, 15 and 16.** `__fs_write_at__(path, offset, data: u8[], mode)` and
  `__fs_write_from__(path, offset, addr, len, mode)`; `mode` is 0 replace (`O_TRUNC`),
  1 at the offset (no truncate), 2 append (`O_APPEND`) — a host argument no caller spells,
  since the three exports carry the distinction by name. `writeFile`'s `u8[]` arm stays on
  slot 1. Slot 16 reads the `Buf` IN PLACE from the exported memory (`-EFAULT` outside
  it), the mirror of slot 9, so `fsSlotTouchesMemory` covers both. Both handlers loop until
  every byte is written (`write_all`), so a short count is never success, and a zero-length
  source still opens the file, so a replace truncates. Measured by
  `tests/vl_std_fs_write_test.ts` on 64 MiB: every `Buf` write peaks within 1 MiB of the
  fill alone, while the whole-array `writeFile` peaks ~128 MiB higher (the `u8[]` copy plus
  the host's `Vec`).
- **An empty `[]` into `u8[] | Buf` needed a compiler fix (D2201)**: the union box built the
  i32 list for it and the narrowed read trapped, so `writeFile(path, [])` — the documented
  fresh start — trapped on the first draft. The `string[]` and struct-array twins are
  D2202 and D2203, still open.
- **Not here, and why:** no path manipulation (a future `std:fs/path`); no open handles or
  seeking (`readFileRange` and `writeFileRange` are positional, so a stream needs none,
  and a handle waits on scope-exit cleanup, Q1); no truncating to a length (Q5); no ranged
  TEXT read, since a byte range can split a UTF-8 sequence; no metadata beyond
  file-or-directory and size; no mkdir, remove, rename or symlink inspection — each is a
  floor intrinsic that does not exist, and a std wrapper for a syscall VL cannot make is
  a name that fails at emit.

## `std:process`

- **Which clause admits it, and there is no consumer yet.** `std-design.md` D2's INVENTORY
  clause names "fs/io/args once WASI lands" and does NOT name process or env; ROADMAP row
  30 does, and it also names the intended consumers — the orchestrator scripts — which is
  a stronger warrant than `std:args` had. But no `.vl` outside `std/` imports either module
  today, so the same sentence applies: the dogfooding is the FOLLOW-UP, not the warrant.
  The first port is `scripts/seed-size.vl`, which routes around D1864 and D1865 rather than
  waiting for them.
- **Why `runProgram` and not `run`.** VL has no namespace import, and a module that both
  imports and declares a name is a HARD PARSE ERROR — the rule that made `std:args` export
  `programArgs` rather than `args`. `run` is the most-claimed verb in exactly the population
  this module serves (test runners, orchestrators, build scripts), so it is the stronger
  case of the two, not the weaker. `exit` keeps its bare spelling deliberately: it is the
  universal one (`Deno.exit`, `sys.exit`, `process::exit`) and nobody contests it.
- **Why `ProcessOutput` and not `ProcResult`.** std's other two uses of "Result" —
  `std:fs`'s `IoResult` and `std:json`'s internal `asResult` — both name the union that
  CARRIES the failure. Naming the success arm with the same word would put both readings in
  one file. Rust's is `std::process::Output` and Deno's is `CommandOutput`; both peers call
  the `{code, stdout, stderr}` triple output.
- **Why `runProgram` is three imports.** A wasm import answers ONE value and a finished
  child has three. `__proc_run__` spawns and answers the code; `__proc_out__` /
  `__proc_err__` read a per-instance cell it fills, cleared at the start of every run. The
  alternative — one length-prefixed block — copies both streams twice and needs byte-slicing
  in std; this shape copies once and the ambient cell never surfaces, because `runProgram`
  makes all three calls itself. **The ORDER is load-bearing and invisible to a caller**: the
  errno is `std:fs`'s shared cell, so it has to be read before the two stream fetches, which
  is why they are the only floor calls in this module that deliberately leave it alone.
- **Why NUL separates rather than terminates, and why std enforces the precondition.**
  `cmd` alone is a command with no arguments and `cmd\0` is a command with one EMPTY
  argument, which is lossless for a POSIX argv — but a VL `string` CAN carry a NUL
  (`decodeUtf8([97, 0, 98])` succeeds with `.length == 3`), so the premise is about the
  wrong type. Without the pre-flight `EINVAL` the child receives one more argument than the
  caller wrote, silently, while both sibling modules refuse the same byte loudly. This is
  the `emptyPathMsg` shape: one policy applied ahead of the host so the answer is the same
  everywhere. `tests/vl_std_process_test.ts` grades the refusal and the empty-argument
  round trip in one suite, because they are the two halves of the same encoding.
- **`exit` is void because VL has no `never`, and because `__trap__` already is.**
  `function pick(n: i32): i32 { __trap__("x") }` is `return type mismatch: expected i32,
  got void` today, so `exit(code: i32): i32` would make `exit` the only diverging call in
  the language that composes in a value position — and it would buy that by claiming an
  `i32` no execution produces, which `const x = exit(1)` would then type-check. Two
  divergence primitives that agree is no rule to memorise. If VL ever grows `never`, these
  two move together, which stays true only while they agree now.
- **`__proc_exit__` is the first host import returning nothing, and both emitter ladders
  that name the void intrinsics one by one were blind to it** — `wasmEmit.vl`'s
  statement-position `drop` decision and `emit_classify.vl`'s `stmtIsTailValue`, each a
  `vl check`-clean program becoming invalid wasm (`exit(3)` and
  `function bail(n: i32) { exit(n) }`). Both now ask `fsRetIsVoid` on the slot rather than
  a spelling; the two positions are pinned by `tests/vl_std_process_test.ts`.
- **Not here, and why:** no shell (the block is an argv, so nothing expands or splits); no
  stdin; no streaming, pipelines or background processes; no working directory and no
  environment overrides — the last two are the most likely next ask and neither of the two
  scheduled script ports needs them.

## `std:env`

- **Which clause admits it.** ROADMAP row 30's slot (5), with `std:process`; see that
  section — the warrant, the missing consumer and the follow-up are the same ones.
- **Why there is no setter.** A setter changes what every later read in the program
  answers, including reads made by code that never asked. The rubric is critical of
  ambient/stateful APIs and this is the one place the criticism has a cheap answer: pass
  the value. Stated in the header too, because a caller meets the absence.
- **Why the signature is `string | IoError | null` and not the two-armed `string | null`
  the brief wrote.** A value that is SET but not UTF-8, or a name no environment can hold,
  would collapse to `null` and be indistinguishable from unset. That is the lossiness
  `pathExists` refuses when it turns only `ENOENT`/`ENOTDIR` into `false`, and the one
  `programArgs` refuses when a single non-UTF-8 argument fails the whole call. It still
  composes: `getEnv("HOME") ?? "none"` narrows to `string | IoError`, so the default-value
  idiom works without swallowing the error.
- **It reads `std:fs`'s errno cell.** `__fs_errno__` is shared with the filesystem floor,
  so `getEnv` reads it immediately after `__env_get__` and before anything else can fail.
  The same coupling `std:args` documents, and the reason both modules keep their own
  private `lastErrno` rather than importing one: exposing the cell would be a second error
  channel next to `IoError`.
- **`errnoName` was `std:fs`'s private `errName`.** Exporting it is what lets three modules
  answer with one `IoError` vocabulary instead of each growing an errno table — the
  alternative the brief forbids ("do not mint a second error type") applied one level down,
  to the reason string rather than to the type. Each module re-exports the SUBSET of codes
  it can actually answer with rather than all nine, because a re-export is a permanent
  promise: `std:process` never answers `ENOSPC`. `errnoName` returns a name AND a sentence
  (`"ENOENT (no such file or directory)"`), which under-promises against its name; a caller
  wanting the bare symbol for a structured log field has no route to it today.

## `std:fmt`

- **`toString` replaced an ambient builtin, by owner ruling** (DECISIONS.md). The compiler
  once carried a builtin of that name over `i32 | boolean`; retiring it lost no capability
  (this domain is a strict superset) and bought the UFCS spelling, since builtins are not
  `self`-first. Because std has no deprecation story the compiler pays for the break with
  `typecheck.stdFmtMovedNote`, which appends the import line to both refusals, for
  `toString` and the old `toStr` alike.
- **A string identity arm is deliberately absent.** An arm that does nothing invites the
  name to grow into the universal renderer VL has no overloading or traits to deliver; the
  derived `show<T>` is that future (serde stage 2).
- **An `f32` widens losslessly INTO the f64 arm**, so `x.toString()` over one passes the
  checker and floors at emit — a compiler hole older than this module, pinned by
  `scripts/capability-probes/f32-into-f64-union-arm.vl`. `f32` in either direction is
  `docs/serde-design.md` stage 0's, not this module's: its shortest rendering is shorter
  than its widened f64's, so it is Burger–Dybvig at 24-bit boundaries and never a wrapper.
- **The string surface moved to `std:str` for a correctness reason, not tidiness.** VL has
  no namespace import, so two modules each carrying a `split` would let a file import
  `toString` and `split`, or `trim` and `split`, but never all three — and whichever the
  caller reached for would silently decide whether their `join` was O(n) or O(n²). It
  costs bytes, because there is no cross-module dead-code elimination; quote the
  OPTIMIZATION RUNG when pricing that, since at `-O3` an unused parser costs nothing
  measurable and a constant-foldable probe prices the FOLD, not the renderer.
- **High zero limbs are left in place, and the reason has EXPIRED.** It was that `.pop()` on
  an `i64[]` did not lower — an `i64[]` PARAMETER refused loudly and an `i64[]` LOCAL was
  check-clean invalid wasm. Re-run 2026-09-03: `scripts/capability-probes/i64-list-pop.vl`
  **RUNS**, so by the old note's own instruction `bnLen` and the untrimmed limbs are now
  removable. That is a code change, not a comment one, and is left for whoever wants it.
- **`parseI32`'s `as! i32` is correct twice over.** The bounds refused everything outside
  i32 first; and since the 2026-09-02 numeric-`as` ruling (DECISIONS.md §"Numeric `as` to
  an INTEGER target is exact-or-fail under the trio") an `i64 -> i32` `as!` is
  exact-or-fail rather than a wrap, so an out-of-range value would TRAP rather than
  silently wrap. Moving the cast in front of the check would turn the null channel's job
  into an abort. (Until that ruling landed the comment there read "`as i32` is an unchecked
  wrapping truncation on this compiler" — true of the compiler it was measured against and
  false of every one since.)
- **Two names, not one, for the integer parsers.** This is NOT `parseI64` followed by a
  narrow: it range-checks in the WIDE type first. The RETURN TYPE is the point — handing
  every i32 caller an `i64 | null` hands them a cast — and VL has no return-type
  overloading and no return-position generic, so a single
  `parseInt<T>(self: string): T | null` cannot be CALLED (the refusal is at the USE, not
  the definition).
- **Ryū was declined** for `shortestDigits`: faster, but it needs a large power-of-five
  constant table and a synthesised 128-bit multiply, and its correctness rests on bounds
  proven elsewhere — a std module with no deprecation story should be re-derivable.
- **The Rust host's `print` USED TO disagree at exact decimal ties**, rounding away from
  even where the spec rounds to even, and `tests/vl_std_float_text_test.ts` pinned the
  divergence. D1011 closed it: that suite's third test is now named *"print(x) and
  toString(x) agree at every vector"* and asserts equality outright. `std:fmt`'s header
  saying `print(x.toString())` and `print(x)` agree is therefore TRUE, not a simplification.
- **`parseBoundedInt`'s symmetric version is not written** because it needs `0 - lo`, which
  overflows at `lo == i64 min`, and no caller wants it.
- **The digit test in `parseBoundedInt` is spelled inline** rather than through
  `isDigitByte` (which the f64 parser uses further down), because it is the hot loop's
  first test and the negated form lets the refusal return directly. One predicate, two
  spellings — if a third appears, collapse them.
- **`toFixed` is JS's `Number.prototype.toFixed`, ECMA-262 step for step** (owner ruling
  2026-10-03 (A) on `open-rulings.md` §`fmt-fixed-precision`; sunpa SP-015; D3565). The
  choices a reviewer should know were made, not drifted into:
  - **Exact, not float.** |x| is `m × 2^e`; the answer is `m × 10^digits × 2^e` rounded to
    an integer with ties upward, which for `e < 0` is "add `2^(-e-1)`, shift right `-e`" on a
    big natural. No float multiply anywhere, so `1.005` at two places is `"1.00"` because
    its double is below the tie. A scaled value under one half short-circuits to zero
    before any shift is materialised, so `5e-324` costs no 1074-bit numbers.
  - **`digits` outside 0..=100 traps.** JS throws `RangeError`. Clamping was the other
    candidate the ruling named; it was declined because a clamp hands back a string the
    caller did not ask for, silently, and the error model's channel for a caller bug is a
    trap (`std:array`'s `filled` and `std:idtable`'s `set` trap the same way on a negative
    count). A `T | E` return was not considered: a formatter that can fail gives every call
    site a second error channel for an argument that is almost always a literal.
  - **|x| >= 1e21 renders as `toString`**, i.e. exponential (`"1e+21"`), matching JS rather
    than always printing fixed. The consumers that asked for it port JS, and agreement
    with JS is the one property a caller can test without reading this module. Non-finite
    values render `"NaN"` / `"Infinity"` / `"-Infinity"` for the same reason.
  - **The sign is read with `<`, not off the bit pattern** — the opposite of `renderF64` —
    because the spec does: `-0` renders `"0"`, but `-0.0001` at two places renders `"-0.00"`.
  - **`self: f64` only**, where `toString` takes `i32 | i64 | boolean | f64`: an `i64`
    above 2^53 is not exactly an f64, and an integer at N places is `toString` plus zeros.
    An `i32` widens in without a cast.
  - **Locale-free by contract.** Always `.`, never grouped. Display formatting with a
    locale is a separate, later `std:intl`; `toFixed` must not grow a locale parameter.
  - **Agreement, measured.** 1,000,000 random doubles × `digits` 0..20 (21M calls) in five
    families — raw bit patterns, exponents 2^-40..2^72, `n / 10^j`, exact binary ties
    `n / 2^k`, quarters — plus 20,000 × 0..100 and 50 edge values × 0..100, graded string for
    string against V8 (node and Deno): 0 mismatches.
  - **Cost.** Per call, measured as wasmtime fuel by bisection on an unoptimised build:
    ~1,500 at 0 digits, ~2,200 at 2, ~3,100 at 6, ~6,900 at 20, against ~14,000 for
    `toString` of the same values. One `-O` program that imports only `toFixed` is 4.5 KB.

## `std:json`

- **The profile is I-JSON (RFC 7493) minus two clauses.** §2.1's NONCHARACTER half is not
  enforced — a noncharacter is an ordinary scalar a VL string already holds, where a lone
  surrogate has no UTF-8 encoding at all, and that half IS enforced — and §2.2's precision
  half is the `f64` rounding rather than a refusal. `docs/json-design.md` is the spec.
- **The two string routes disagree on malformed UTF-8.** An escape-free literal is one
  byte-exact `slice`; one with any escape goes through `for cp in …`, which substitutes
  U+FFFD. That is the price of not carrying a second UTF-8 decoder, and it is why v1 takes
  `string` and not `u8[]`.
- **The `Json` arms are not named** (`type JsonObject = { [string]: Json }`), which is what
  a reader wants and what the compiler refuses: as a member of the recursive union the
  checker rejects it, and declared after the tree `let o: JsonObject = Map()` refuses at
  emit (D1022). An alias is transparent, so adding the names later changes no program.
- **`kind` is an INLINE literal set with no alias** because of D1050.
- **D1030 USED TO reach the caller, and is CLOSED.** Narrowing `JsonError` away from
  `parseJson`'s result used to leave the flattened member list rather than the name `Json`,
  so `toJson(r)`, `r.toJson()` and `const v: Json = r` were all refused at check. D1030
  closed 2026-09-02 (one `assignable` predicate, shared with D1009/D1010) and all three
  spellings run — measured 2026-09-03, each printing `{"a":1}`. The std comment telling
  callers to work around it was deleted rather than moved: a capability claim is a
  measurement with a date on it, and this one had outlived its date.
- **D1033 trips a walker**: a string INDEX handed straight to a value-union parameter —
  `k[i].toString()` — is check-clean INVALID WASM when `k` was narrowed out of `Json`;
  hoist it as `const b: i32 = k[i]` first.
- **D1029: an `is`-narrowed MAP arm still carries the union's box at every delivery
  position**, and re-binding it at the arm's own type is what unwraps it. Six of eight
  positions are check-clean invalid wasm without the `const o: { [string]: Json } = v`
  line in `renderInto`, and `asResult` needs the same line.
- **D1112/D1161: every read of `err` narrows IN PLACE and never through a rebind**, in both
  `Rend` and `Scan`. Neither rebind spelling runs at every position this module needs, and
  the compiler ACTIVELY suggests the refused one with a `redundant type annotation` hint —
  so it is not a safe cleanup.
- **D1034: `renderInto` must not be void.** It was once, and an `if`/`else` with ONE EMPTY
  BRANCH in a void function is check-clean and TRAPS. Two facts keep it away: it is not
  void, and no branch in it is empty. D1032 is why every arm exits with a value rather than
  a bare `return`.
- **D1009/D1025: the map read is hoisted, and it is `Json | null` rather than `Json`.**
- **`MAX_DEPTH` is a stack budget.** A parser-shaped frame on this host runs out of stack
  around a thousand levels and recursive descent spends about two frames per level, so the
  cap sits well inside the budget. Re-take the measurement with the real frame before
  moving it; a limit can be RAISED later and never lowered. VL is the only surveyed
  implementation that caps BOTH directions.
- **`toJson`'s unreachable floor is a `JsonError`, not a `__trap__`**, because this
  module's whole contract is that neither direction traps — the same argument the depth cap
  is built on. It carries the same `kind` the pre-D1031 flat carrier's initial values
  produced. Since D1031 closed, `parseJson` hands back the SAME object the scanner raised,
  not a copy of its fields.
- **Not here, each named so nothing else takes the spelling:** `toJsonPretty` (the
  mode-switch `toJson(v, pretty)` is refused outright, and the indent PARAMETER is
  deliberately not fixed — an `i32` would foreclose tabs forever), `jsonKind`,
  `jsonPointer`, `jsonEquals` (absent rather than deferred: `==` over refs is already
  structural, so compare by rendering until `==` over a struct union lowers), and stage 3's
  `fromJson<T>` / generic `toJson<T>`, which at `T = Json` IS this `toJson`.

## `std:str`

- **Every builder fills a code-point buffer — read this before editing.** `let s = ""` then
  `s = s + piece` in a loop is QUADRATIC on this compiler: there is no accumulation fusion
  in the native emitter, and `tests/cases/strings/accum-*.vl` asserts only the RESULT, so
  it is blind to the cost class. An `i32[]` grows (amortized push); a `string` does not.
  Two `+`s splicing ONE result (`replace`) are fine — O(n) once, not O(n) per element.
  `join`'s `out = out + parts[i]` spelling is the exact loop that went quadratic and blew
  the compiler's non-freeing heap (see `compiler/fmt_util.vl`'s `joinLinesRange`).
- **The unit is CODE POINTS, in two ruled places** — the builder buffer and `len`
  (`docs/internals/str-byte-semantics.md` §R1). `pushStr` iterates rather than indexes
  because `s[i]` is a BYTE and `fromCodePoints` reads code points; `buf.push(s[i])` would
  ship mojibake from every builder in the file. §R2 is the open ruling on the byte-boundary
  reading of an empty-separator `split`.
- **`trim` is ASCII-only and NOT named for it — an OPEN RULING** (§R3): JS, Python, Rust and
  Go all strip U+00A0, and Go's six characters are a fast path rather than its definition.
  The set is rep-independent, so nothing about the UTF-8 migration forces the question.
- **`pushRange` clamps `lo` explicitly** rather than delegating to `slice`, because VL's
  `slice` reads a negative index as JS does — from the END — which is the opposite of the
  "clamp to the start" the helper promises.
- **`padStart` measures with `cpLen()` and not `.length`.** That is O(n), and naming it at
  the call site is §Codepoints' own principle satisfied. Code points are still not DISPLAY
  width; grapheme- or width-correct padding belongs to `std:unicode`.
- **The degenerate inputs follow the unanimous precedent.** `DECISIONS.md` already put the
  core's string methods in the JS camp, and a std module disagreeing with its own core
  would be a seam. THE ONE LAW is `s.replaceAll(f, t) == s.split(f).join(t)` for a NON-EMPTY
  `f`, which is why the two share `findFrom`; for an empty `f` it cannot hold.
- **The core's `indexOf` takes no start offset** (checked: `typecheck.vl` types it at exactly
  one argument), which is why `findFrom` exists.

## `std:test`

- **The D941 family is why the receipt is EAGER.** Every `T`-dependent fact is computed once
  inside `expect` from the RAW parameter, because the lazy spellings are the miscompiling
  ones: D941 re-forwards a generic parameter, D942 mis-answers `is` on the carrier field,
  D943 captures the generic value, D944 widens then narrows. The render ladder therefore
  lives once, in `vltShow<T>(value: T)` over a raw value — the one placement today's
  monomorphizer answers correctly for every `T` measured.
- **`VltAtomReps` is registration, not a type anyone names (D947).** Declaring the five-atom
  value union mints the i32/i64/f64 value-box heap types and the string payload type in
  every module that links `std:test`, so a generic `is` ladder instantiated at a union `T`
  lacking some atom still VALIDATES — the missing-atom arms are dead at runtime, but their
  emitted casts need the types to exist. It is the side effect v1's five-atom receiver union
  had by existing, kept as one line. Remove it only when D947 closes compiler-side.
- **`.toEqual` compares with the SAME `==` the operands get outside a test, and the ONE
  recorded exception is GONE.** A union `T` holding a non-atom member used to be check-clean
  invalid wasm where v1 refused it loudly (the D941 family, D947). Re-run 2026-09-03 over
  `type U = i32 | { x: i32 }` at both an `i32` and a struct payload: both pass. `VltAtomReps`
  is the registration that half of this rests on and stays until D947's own bar says
  otherwise.
- **One VL rule governs the file's shape:** a function's result type is its TAIL statement's
  and a test BODY is `() => void`, so every function a body can end with must be void —
  hence `vltDone()` and matchers closing with a call rather than an `if`.
- **`done()` exists because void-return covariance on function values does not.** That fix is
  not free: the array's element type IS the interned `$fnsig`, so it needs a real coercion,
  not a relaxed check. Filed in `docs/internals/vl-test-design.md` §Known gaps.
- **`CallerLoc`'s shape is the COMPILER's, its name is std's.** `__callsite__` is checked
  STRUCTURALLY against exactly `{ file: string, line: i32, col: i32 }` (field order free), so
  any identical alias satisfies it and growing `CallerLoc` is a compiler change, not a std
  one. It is exported because a forwarding helper has to name the type; it is not in
  `std:fmt` because this module's dependency surface is deliberately ZERO.
- **The MATCHER is the anchor, not `expect`.** `expect(x)` and `not()` are setup and decide
  nothing, so `expect(x).not().toEqual(y)` anchors on the FINAL matcher's token. A second
  hand-in point would need a precedence rule defaults v1 cannot express, since a callee
  cannot tell a supplied argument from an omitted one. ONE HOP, never a chain: a wrapper
  takes its own `caller: CallerLoc = __callsite__` and forwards it explicitly. `vltFail`'s
  `loc` is REQUIRED, not defaulted, so a matcher added later cannot report without one.
- **"The location line is last" is this module's invariant, and `lsp/src/testDiscovery.ts`
  depends on it** — it takes the LAST match, so a rendered operand (arbitrary user text) can
  carry a perfectly anchored forgery and still lose. A line appended after the location
  silently re-anchors every failure in the editor.
- **`vltI64Str` is a knowingly-kept second renderer.** The reason is INDEPENDENCE, not import
  inability — std modules do import each other (`fmt` ← `str`, `utf8` ← `fmt`, measured).
  This is the assertion surface that reports failures in everything else, `std:fmt` included,
  and a defect in fmt's renderer must not be able to corrupt the message that reports it.
  `tests/cases/std/renderers-agree.vl` pins the two against each other at i64 min.
- **`toBeTrue` stays generic on purpose.** Tightening it to `Expectation<boolean>` would turn
  a documented runtime failure into a compile-time break, which is a surface decision to make
  on its own rather than as a rider.
- **`vltLocStr`'s empty case is unreachable through this module** — every consumer imports
  `std:test`, which is a module table, and only a table-less single-source compile answers
  `""` — but a message reading `at :9:1` would be worse than one with no location at all.
- **`fail`'s deferral of `CallerLoc` is cheap:** a trailing default is ADDITIVE, so
  `fail(msg, caller: CallerLoc = __callsite__)` can land later without breaking a caller. No
  `toBe`, `toThrow` or `toBeNull` yet: they wait on `===` (ROADMAP A15), the error model and
  `null` handling (std-design OD6).

## `std:utf8`

- **A VL `string` IS its UTF-8 bytes** (`docs/guide/strings-design.md` §Storage/§API), so
  `utf8Length` collapses to `self.length` and `encodeUtf8` to `self.bytes()`. The collapse is
  sound only because §Wrap ruled `encodeUtf8` RAW: a string holding malformed bytes keeps
  them through the encoder, so `.length` counts exactly what it emits. Decoding to code
  points and re-measuring would answer 3 per replacement character and disagree with this
  module's own encoder. The audit is `docs/internals/utf8-byte-ready.md`.
- **`bytes()` is FRESH, not a view (§Ownership).** A `u8[]` wrapper has no `start` field and
  cannot express a view of a sliced string, and a `u8[]` is MUTABLE — an aliasing `bytes()`
  would hand out a writable pointer into an immutable string's storage.
- **`at` is a BYTE OFFSET, relative to `off`** (§at), exactly as Rust's
  `Utf8Error::valid_up_to()` is, so `s.slice(0, e.at)` is the valid prefix with no converter
  and — decode being a byte identity — `at` is also that prefix's byte length
  (`tests/cases/std/utf8-invariant.vl` §6).
- **`byte` also keeps `Utf8Error` structurally DISTINCT.** VL aliases are structural, so the
  `{ at, msg }` shape `error-handling-design.md` §90 blesses as `ParseError` is literally
  this type, and a union naming both would fail at emit with no recorded members.
- **The encode side's non-scalar ruling lives in the CORE, not here.** A string can no longer
  hold a lone surrogate or a value past U+10FFFF: `fromCodePoints` substitutes U+FFFD, and
  `print` streams the stored replacement bytes rather than dropping them (§NonScalar).
  `scalar`/`utf8Width` were deleted rather than kept as defensive documentation of that rule,
  because a second copy of a rule is a thing that can disagree with the first.
- **The validity table in `decodeCore` is the standard one**, and every row rejects a sequence
  a naive shift-and-or would decode. Accepting one is the classic security bug — two byte
  strings decoding to one string is how a path check that already ran gets walked past.
  `C0 C1` overlong two-byte forms; `E0 80..9F` overlong three-byte; `ED A0..BF` the surrogate
  block; `F0 80..8F` overlong four-byte; `F4 90..BF` beyond U+10FFFF; `F5..FF` no such lead
  byte.
- **`decodeUtf8Lossy` is a SANITIZER, not a decoder**, which is why it does not collapse into
  the core's lenient wrap. §Validity is Go-lean: the core wraps ill-formed bytes and lets them
  read as U+FFFD only when something iterates them, and that wrap KEEPS the original bytes.
  This function REWRITES them. Go draws the same line between `string(b)` and
  `strings.ToValidUTF8`.
- **One private renderer per module was REFUSED.** `toString` is `std:fmt`'s export as of
  2026-09-01 (owner ruling, DECISIONS.md), so `std:utf8`, `std:fs` and `std:args` each import
  it rather than carrying a decimal renderer: one implementation beats smaller output, and
  three copies that must agree about i32 min is exactly the drift that ruling protects
  against. VL has no cross-module dead-code elimination, so an unoptimized module carries all
  of `std:str` and `std:fmt` for one i32 rendering; binaryen's DCE at `-O3` removes almost all
  of it.

## `std:idtable`

- **Admitted by the owner's collections Q4 ruling (2026-09-25)**: "The dense int-keyed table is
  a named, consumer-chosen type" (DECISIONS.md, "A collection's stated cost is contract"). The
  consumer is plumb, which hand-rolls ten of these: seven from `~/plumb/src/render.vl:313`
  (`texsT`, `bufsT`, `viewsT`, …), `ctxs` and `shaderBinds` later in that file, and `socks` in
  `src/win32.vl`, each a
  `(T | null)[]` grown by `push(null)`, deleted by storing `null`, never iterated.
- **Its own module**, not a section of `std:array`: `std:array` is helpers over `T[]`, and this is
  a type with its own methods whose names (`get`, `set`, `has`, `delete`) would read as list
  methods there. The names are the built-in map's, so switching a `{[i32]: V}` to an
  `IdTable<V>` changes the type and the constructor and nothing else, unless the program
  enumerates keys: `for k in m` and `m.keys()` become `t.ids()`, named differently on purpose
  because the order differs (ascending, not insertion). The methods resolve through the type
  with only `IdTable` imported, so the header's import line names nothing else and a caller's
  own `get` is untouched; importing `get` explicitly does not shadow `m.get(k)` or `xs.get(i)`
  either (`idtable-scalar-values.vl`). `length` is the COUNT of ids
  present, as a map's is, not the highest id + 1. The brackets duplicate `get`/`set` for the
  same map parity; `std:buffer`'s views set the precedent.
- **Over `(V | null)[]`, as asked**, which is plumb's own spelling. Building it found four
  compiler rows, all closed in the same PR: D2525 (a generic `(V | null)[]` refused outright),
  D2526 (the method spelling `t.set(…)` refused as a widened write), D2527 (`IdTable<Tex>()`
  from another module: "unknown type"), D2528 (an applied generic record with a nullable-record
  list field). D2525's boundary still refuses, loudly, a `V` that is a `string`, `boolean`,
  string literal union, function type, union of records or generic record application; the
  header names each, and D2525 says why.
- **`set` pushes one shared `null`**, made once per call. A `null` literal pushed into a boxed
  `(i32 | null)[]` allocates a box per push: plumb's hand-rolled `push(null)` loop measured 3×
  slower than a map at a million ids with `i32` values, and the shared value brings `IdTable<i32>`
  to parity with the map. `delete` still stores a fresh `null`, one allocation per call.
- **Measured 2026-09-25** (`docs/guide/costs.md`, `-O`, `vl run`): on plumb's pattern (ascending
  ids 7 apart, deletes 2,000 behind, 32 lookups per insert), a record value runs 6.6 ns per
  operation against the map's 10.6 and the hand-rolled table's 6.2–6.8; an `i32` value
  11.3–13.7 against the map's 13.4–19.2. The three programs are `bench/collections/id-table/`.
- **A negative id traps in `set`** (plumb silently ignored it): a dropped write is a silent loss,
  and `std:array.filled` traps on a negative length for the same reason. Reads answer `null`.

## `std:utf16`

- **Admitted by clause (a) of `std-design.md` D2**: UTF-16 is the text ABI of the Win32, JS
  and JVM hosts, and `std:utf8` stops at bytes. plumb (PL-038, `~/plumb/docs/vl-issues.md`)
  clears the speculative exclusion rather than admitting it: its `unitsStr`/`strUnits`/`nameLen`
  in `src/win32.vl` are `decodeUtf16Lossy`/`encodeUtf16`/`utf16Length` by hand, the first built
  by per-character string concatenation. Its own module rather than a section of `std:utf8`,
  so a caller wanting one encoding does not import the other; the two decoders share no input
  type, so `std:utf8`'s one-decoder rule is kept.
- **The names mirror `std:utf8`** (`encodeUtf16`/`decodeUtf16`/`decodeUtf16Lossy`/
  `utf16Length`, `Utf16Error { at, unit, msg }`) rather than the asked-for `toUtf16`/
  `fromUtf16`: a flat namespace makes the module name part of every export name, and the two
  modules read as one family. `decodeUtf16At` is not here — `decodeUtf8At` has a record-block
  consumer and this module does not yet.
- **`i32[]`, not a unit type.** VL has no `u16`; `u8` is a storage type only. Out-of-range
  elements (negative, or above 0xFFFF) are a decode error, not a silent truncation, because an
  astral code point handed in as ONE element is the likeliest caller bug.
- **Encode reads the string exactly as `for cp in s` does.** A string can hold malformed
  UTF-8 only through `slice` (the core's wrap, `std:utf8` above); such bytes encode as U+FFFD,
  one per ill-formed BYTE, the same answer the language's own iteration gives — not one per
  maximal subpart as `decodeUtf8Lossy` does (a 3-byte cut of U+1F600 is three U+FFFD here,
  one there). Agreeing with `for cp in s` is the chosen contract. `encodeUtf16`
  therefore never fails and needs no error arm; the lossiness is confined to input that no
  well-formed string contains, and the export comment names it.
- **Strict decode rejects lone surrogates**, like `decodeUtf8` rejects the surrogate block —
  there is no WTF-16 pass-through. A caller that must round-trip arbitrary Windows names
  (which may hold lone surrogates) keeps the units; this module converts TEXT.
- **One pass each way.** Encode pushes onto one list; decode collects code points and makes
  ONE `fromCodePoints` call, as `std:utf8` does, so neither side concatenates strings. Measured
  2026-09-25 at ~8–12 ms per MB either direction (`vl run`, 10 repetitions over a 1 MB mixed
  ASCII/BMP/astral string).

## `std:base64`

- **`b64Char`/`b64Val` are a ladder rather than a table** because they invert each other
  exactly, and two tables that must agree is one more thing to get wrong. `std:json`'s
  `namedEscape`/`simpleEscape` pair follows the same rule.
- **`u8[]` is outside the generic surface** — not a `T[]`, so no `map`/`indexOf`/`sorted`;
  the loops are written out for that. `encodeBase64` fills ONE code-point buffer and calls
  `fromCodePoints` once, because `out = out + c` is O(n²).
- **The failure channel is `u8[] | Base64Error`, not `u8[] | null`.** A blob is
  machine-produced, so an offset locates a truncated transfer or a stray newline, and the
  four kinds call for different fixes — the "failure with information the caller needs" case
  `error-handling-design.md` spends `T | E` on, where `parseF64` answers `f64 | null` because
  a float literal has one way to be wrong. `kind` keeps the type structurally DISTINCT from
  `ParseError` as well.

## `std:bytes`

- **Which clause admits it — and it is NOT a "consumer clause", because there is no such
  clause.** `docs/internals/std-design.md` D2 admits on **(a) what the language story needs
  to be complete without third parties**, and excludes "anything speculative *without* a
  consumer in the tree" — so a consumer CLEARS the exclusion, it never admits. Clause (a)
  admits this on its own: `std:fs`'s `readFile`/`readFileRange` HAND the caller a `u8[]`
  and std then offered no way to read a number out of one. glean — VL's first external
  consumer, a WC3 replay/dump toolset — clears the speculative exclusion by reimplementing
  the shape in **21 of its 150 `.vl` files** (measured 2026-09-05), 13 of them through a
  private `le32`/`u32` helper and 8 of those through a private `le64`. `compiler/driver.vl:823`
  and `compiler/cli.vl:529` write the same loops, but **no compiler module imports any std
  module** — they are evidence that the shape is idiomatic, not in-tree consumers.
- **Why no `u32le`, and why the 32-bit read returns `i32`.** The reason is *one read per
  width*: at 64 there is nowhere wider to put an unsigned value, and at 32 the widening is
  a cast the caller can spell. (An earlier draft of this module gave the 64-bit reason at
  32 as well — "there is nowhere wider" — which is simply false there, and the export's own
  comment prescribes the wider place.) `std:buffer` made the same call with
  `loadI32`/`loadI64` and no unsigned twin, and declining is the reversible direction: with
  no deprecation story a name can be added later and never removed.
- **The consumer measurement that was cited for this is REFUTED, and the refutation is the
  better argument for the doc.** The claim was "every one of the 21 files binds the word to
  an `i32`, so nobody wanted an unsigned read". True about the binding, false as evidence:
  **five of them** — `reg-scan.vl:14`, `reg-bounds.vl:12`, `rtti-name.vl:13`,
  `rtti-vtable.vl:27`, `rtti-vtable-ra.vl:27` — end their helper with `& 0xffffffff`,
  which at `i32` is a NO-OP (run against `00 00 00 80` it still prints `-2147483648`).
  They wanted the unsigned read and could not spell it, then re-cast at the use site.
  That is why `i32le`'s doc comment says to widen FIRST and that masking the i32 alone
  does nothing — the failure is one five files in the sample have already hit.
- **Why BOTH signednesses at 16 bits, and why all four `be` twins.** Two bytes fit an `i32`
  two ways and the caller must choose; four and eight fill their return type, so there is
  one answer. Same split `std:buffer`'s `loadI16`/`loadU16` pair documents. **Neither rests
  on a counted site**: glean has zero 16-bit reads over a `u8[]` and zero big-endian
  assembly sites. They rest on clause (a) — a std that reads a `u16` but not an `i16` forces
  `(b.u16le(o) << 16) >> 16` on every caller, and byte order is a two-valued axis of which
  half is not a story. Recorded here as chosen rather than drifted.
- **Why the names do not reuse `load*`.** Not taste: VL has no namespace import and a UFCS
  call resolves only names in scope, so a file reading both a `Buf` and a `u8[]` must import
  both sets into one scope, and a module that both imports and declares a name is a hard
  parse error. Two `loadI32`s did not compile UNALIASED when this was decided. (Since
  receiver overloading, O1, a `u8[]` and a `Buf` receiver differ in kind and the two would
  coexist; the distinct names stand, since renaming a shipped std export has no deprecation
  path.)
- **`u8[]` is outside the generic surface** — not a `T[]`, so `std:array`'s helpers do not
  reach it; the loops are written out here, as `std:base64` and `std:utf8` write theirs.
- **Why nothing bounds-checks.** A read is one array index and the engine already checks it,
  so the trap is the list's own `out of bounds array access`. `std:buffer`'s `storeBytes` and
  `loadBytes` DO check because linear memory would not catch it; `fill`/`copyFrom` do not,
  for the same reason as here. A short read answering `0` was rejected outright: that is a
  wrong number rather than a failure.
- **Why no `put*` and no `f32le`.** The consumer's tree writes bytes at two sites and they
  disagree about the shape — `out[at] = …` into an existing array vs `bytes.push(…)` onto a
  growing one — so a store family would be guessing which one std blesses. A float needs no
  export at all: `f32fromBits(b.i32le(off))` composes the existing bitcast intrinsic with the
  integer read, and `tests/vl_std_bytes_test.ts` pins that composition so it cannot rot.
- **What the suite grades against.** `DataView`, the platform's own byte reader, not a second
  shift ladder written in TypeScript to agree with the VL one.
- **`zeroBytes`, the one constructor (D3620, owner ruling 2026-10-04).** sunpa SP-030 and
  the `u8[]` half of SP-007/D3539: `filled(n, 0)` cannot make a `u8[]` because `u8` is a
  storage type and a type parameter never binds it, so the spelling was `n` pushes. The
  ruling chose a std export over a generic rule (D3539's option B) or nothing (C). It lives
  here, not in `std:array`, because `std:array` is generic and its header says no export
  applies to a `u8[]`; here is where `u8[]`-specific code already is. The lowering is one
  `__array_new_default__`, as `std:buffer.loadBytes` allocates; at `n = 4,000,000` it burns
  4.0M wasmtime fuel (the engine charges the zeroing per element) against 140.6M for the
  push loop. A negative `n` traps by name, matching `filled`, rather than answering an empty
  list: a negative length is a caller bug, and silently clamping it is the lossy shape
  `std-api-review.md` §2 is critical of. Zero only, no fill byte: no consumer asked for one,
  and a fill byte would be an `i32` the store truncates silently. A non-zero fill is
  `zeroBytes` plus a loop until a consumer needs more.

## `std:seed`

Kept only to prove the `std:` resolution plumbing end to end — both resolvers, the Rust
host's std-dir mapping, the CLI's `fsRead` wrap, the LSP's embedded map. It can be retired
once any real module stands in for all of those.

## `std:math`

Slice 1 of `docs/internals/std-math-design.md` — `hypot`, `atan2` and `PI` at both widths,
the module's first landing. The design's §C determinism contract is the spine: every op is
pure VL over the opcode intrinsics (`sqrt`, `abs`) and `+ - * /`, no host `Math` call, so the
only cross-host variance is IEEE-754 itself.

- **Superseded (sunpa SP-013, 2026-10-03).** Slice 1's `atan2` was a degree-8 minimax
  polynomial in `r*r` on the first octant, good to 1.36e-8 (f64) / 2.58e-7 (f32) absolute,
  that dropped the sign of a zero `y`; its `hypot` was the naive `sqrt(x*x + y*y)`, which
  overflows past ~1.3e154 (f64) / ~1.8e19 (f32). Both were replaced by the 1-ulp versions
  described under SP-013 below, which CHANGED THESE EXPORTS' VALUES: `atan2F64(0.3, 0.7)` was
  `0.4048917884765582` and is `0.40489178628508343`, `atan2F64(0.0, -0.0)` was `0` and is
  `PI`, `atan2F64(-0.0, -1.0)` was `PI` and is `-PI` (so the documented range went from
  `(-PI, PI]` to `[-PI, PI]`), and `hypotF64(1e200, 1e200)` was infinity and is
  `1.414213562373095e200`.
  `tests/cases/math/atan2-quadrants.vl` and `hypot.vl` still hold; their bound-style
  assertions are within the new contract.

### `sinF64`/`cosF64`/`sinF32`/`cosF32` (D3476, sunpa SP-002)

- **Reduction.** `reducePio2` returns `q mod 4` and leaves `x - q·π/2` in `[-π/4, π/4]` as the
  unevaluated sum `redHi + redLo` (two private module globals, written then read straight
  back by the caller; no result depends on an earlier call). Below `2^20·π/2` (≈1.647e6) it
  is Cody–Waite with π/2 in three 33-bit parts plus tails, the second and third rounds run
  only when the first cancelled more than 16 / 49 bits (fdlibm's shape; relative error of the
  reduced argument ≤ 2^-70 over 200k probes). Above it is an integer Payne–Hanek: the
  53-bit significand times a 192-bit window of 2/π taken from a 21-word table (one word of
  leading zeros, so the window may start before the binary point), product kept mod 2^192
  in 32-bit columns of i64, top two bits the quadrant, the 190 below the fraction, rounded
  to nearest, normalised with `clz`, turned into a double-double, and multiplied by π/2 in
  double-double (Dekker). Accurate to ~2^-100 relative for every finite double, including
  `6381956970095103·2^797`, the double closest to a multiple of π/2.
- **Kernels.** Degree-6-in-`x²` minimax polynomials for `sin` (relative error 2^-57.1) and
  `cos` (2^-62.1) on `[0, (π/4)²]`, from a Remez exchange in mpmath
  (`scripts/std-math/trig-remez.py sin64|cos64`), fed through fdlibm's tail-carrying kernel
  shapes so `redLo` is honoured. The f32 pair uses degree-4 kernels (2^-36.8 / 2^-33.1,
  `sin32|cos32`) evaluated in f64 on `redHi` alone, then one f64→f32 rounding.
- **The f32 pair evaluates in f64, a deliberate departure from std-math-design §C.4.** That
  clause rules out "compute in f64, cast down" because a cast-down function differs from one
  that rounds like the caller's f32 pipeline. For sin/cos there is no f32 pipeline to match
  (WGSL's `sin` is driver-defined, and sunsuz's peer confirmed no shader twin), while f32
  Cody–Waite cannot reach large arguments at all and f32 Horner would cost accuracy. The
  result is one rounding from a value good to ~2^-33, which is within 0.5014 f32 ulp, and
  wasm runs f64 arithmetic at f32 speed. The signature is f32 in and out, so no caller
  widens; what §C.4 protects (determinism, a published bound) holds.
- **Special values.** `|x| < 2^-26` (f64) / `2^-12` (f32) returns `x` from sin (this keeps
  `-0.0` and subnormals exact) and `1` from cos. NaN and ±∞ return the constant quiet NaN
  `0x7FF8000000000000` / `0x7FC00000` rather than `x - x`, because a NaN produced by
  arithmetic has an engine-chosen sign bit in wasm, and the contract is bits.
- **Exact-constant trap.** Under the exact-constant ruling a `const` initialised from other
  literal-valued consts is computed exactly, so Veltkamp's split written as
  `const c = 134217729.0 * P1; const hi = c - (c - P1)` folds to `hi = P1, lo = 0` and the
  double-double product silently loses its low half (it cost 0.7 ulp in the Payne–Hanek
  range before it was caught). The split halves of π/2 are therefore literals. Any rounding
  trick on constants in this module must be precomputed the same way.
- **Measured** (`scripts/std-math/trig-check.sh`, 2.88M points: 1M uniform in `[-1e6, 1e6]`
  at each width, 200k random bit patterns, near-multiples of π/2 for `k ≤ 20000` and random
  `k < 2^50` with their ±1-ulp neighbours, and specials; graded by mpmath). Max error:
  `sinF64` 0.772 ulp, `cosF64` 0.761 ulp, `sinF32`/`cosF32` 0.5014 ulp, against a published
  bound of 1 ulp. `scripts/std-math/trig-f32-exhaustive.vl` runs all 2,139,095,040
  non-negative finite f32 against the f64 pair (~150 s at `-O3`): worst 0.50148 ulp for both,
  and 396,590 (`sinF32`) / 408,475 (`cosF32`) results, ~0.02%, are not the correctly rounded
  f32, so the f32 bound is exhaustive rather than sampled.
- **Determinism.** The grid's transcript is byte-identical between wasmtime (`vl run`) and
  V8 (Deno), at `-O0` and at `-O3`, on every result bit; `trig-check.sh` fails otherwise.
  The fixtures pin exact values, so the corpus oracle (V8) and the native suites (wasmtime)
  each re-check them.
- **Cost.** One call, measured inside wasm at load ~20: 2.8 ns for `|x| ≤ 0.3`, 5.5–6 ns for
  `|x| ≤ 5000` under wasmtime and 7.9–9 ns under V8, against 17.6–18.4 ns for a JS loop over
  V8's `Math.sin`/`Math.cos`. The Payne–Hanek path is only taken above ≈1.6e6.
- **No `sinCosF64` (std-api-review, 2026-10-02: do not add).** Both values share one
  reduction, so a fused export would save ~2 ns of ~6, and nothing below π/4 where there is
  no reduction. It needs a two-value return: VL has no tuples, and a `{ sin, cos }` record
  return would make that record type permanent surface and lean on a multi-value lowering
  not yet verified as shipped. No consumer asked. Deferred until one measures the cost of
  the second reduction.
- **`redHi`/`redLo` assume per-instance module globals.** Each write is read back at once by
  the same call, so no result depends on an earlier call; a future threading model that
  SHARED module globals across instances would make this a race, and `reducePio2` would
  then need a real two-value return.

### `expF64`/`expF32`/`logF64`/`logF32`/`powF64`/`powF32` (sunpa SP-005)

- **What admits them.** sunpa's world generator calls `exp` in about twenty places and `pow`
  once, and carried its own `exp`/`ln`/`pow` in `src/worldgen/noise.vl`; the design's §E
  table already named `exp` and `pow`. `log` is exported rather than kept private (design §H
  O2 recommended private) because sunpa asked for it by name and `pow` needs it anyway, so
  the extra surface is one name over code that has to exist. `log2`, `log10`, `exp2`,
  `expm1` and `log1p` are not exported: nobody asked, and the header says so.
- **`exp`.** `x = k·ln2/32 + r`, `|r| ≤ ln2/64`, with `k·ln2/32` split so the high product
  is exact for every `|k| < 2^16`. `e^r - 1 = r + r²·Q(r)`, Q a degree-4 minimax fit (2^-63
  absolute). `2^(j/32)` comes from a 32-entry double-double table, so the result is
  `T_hi + (T_lo + T_hi·(e^r - 1))` with one rounding of note, then scaled by `2^(k>>5)`. A
  subnormal result adds 1 before the final rounding, so that rounding lands on the subnormal
  grid instead of rounding twice; `2^1024` is reached as `2^1023·2`.
- **`log`.** `x = 2^k·z`, `z ∈ [0.7109375, 1.421875)`, split into 32 buckets by z's top
  significand bits, bucket 18 centred on 1.0. Each bucket stores `1/c` rounded to 21
  significant bits, so `z·(1/c) - 1` is EXACT as `(zh·ic - 1) + zl·ic` with z split at 32
  bits: no FMA, no Dekker. `|r| ≤ 2^-6`; `log1p(r) = r - r²/2 + r³·P(r)`, P a degree-7
  minimax fit (2^-71 relative to r), with `r²/2` kept exact through a 21-bit split and every
  two-sum error carried. The result is a double-double good to ~2^-68 relative, written to
  the module globals `lgHi`/`lgLo` (the `redHi`/`redLo` pattern: written, then read straight
  back by the same call). Bucket 18 has `1/c = 1` and `-ln c = 0`, so `log` stays relative
  near `x = 1` where the result is tiny.
- **`pow`.** `y·(lgHi + lgLo)` as a double-double (Dekker's product), then `exp` of it with
  the low part folded into `r`. With `|y·log x| ≤ 746` that keeps the argument's absolute
  error near 2^-62, about 0.002 ulp of the result. Integer exponents take the same path: the
  pre-rounding error is a few hundredths of an ulp, so any exact result that is a double
  comes back exact (the grid checks every `a^b` for `|a| ≤ 40`, `|b| ≤ 80`). The edge cases
  are IEEE 754 / C99 Annex F `pow`, checked before any arithmetic. **Deviation from JS**:
  `Math.pow(1, NaN)`, `Math.pow(±1, ±Infinity)` are NaN in JS and 1.0 here. Likewise
  `atan2F64(-tiny, +large)` (a quotient that underflows) is `-0.0` here, as C99 has it
  (`atan2(-y, x) = -atan2(y, x)`), where V8's `Math.atan2` gives `+0.0`.
- **The f32 trio evaluates in f64 and rounds once**, as `sinF32`/`cosF32` do (§C.4's
  deliberate departure, same reason: no f32 pipeline to match, and one rounding from a value
  good to ~2^-41 gives 0.5000x f32 ulp). `expF32` and `logF32` use lighter kernels on the
  same tables (degree-2 Q, degree-3 P, no double-double); `powF32` is `logKernelF32` then
  `expKernelF32` in f64, whose ~2^-36 argument error is invisible at f32. The NaN `powWith`
  returns is mapped to the f32 quiet NaN explicitly, because a demoted NaN's bits are the
  engine's choice.
- **Constants and coefficients** come from `scripts/std-math/explog-tables.py` (mpmath; the
  Remez exchange is the trig script's). Every literal is the script's `repr`, so no constant
  is built from another (the exact-constant trap in the trig notes above does not arise).
- **Measured** (`scripts/std-math/math-check.sh`, 12,535,598 points over every function in
  this landing, graded by mpmath at 256 bits; for these three: uniform sweeps over each function's whole finite range, the unit interval, tiny
  arguments, subnormal results, random bit patterns, `log` within 1e-6 of 1, `pow` with `x`
  within 1e-9 of 1 and `|y|` up to 1e12, every small integer power, and every pair of 39
  edge values). Max error: `expF64` 0.5265 ulp, `logF64` 0.5000, `powF64` 0.5284 (0.5043 in
  the subnormals); `expF32`/`logF32`/`powF32` 0.5000. Every edge case matched, every exact
  power exact. `scripts/std-math/math-f32-exhaustive.vl` runs every f32 `expF32` and
  `logF32` compute (~4.3e9; ~12 min with the arc functions, at `-O3`): worst 0.5000024 ulp for `expF32`, 0.5 for
  `logF32`; 218 and 2 results differ from the f64 function rounded to f32.
- **Determinism.** The grid's transcript is byte-identical between wasmtime and V8 at `-O0`
  and `-O3` on every result; `math-check.sh` fails otherwise. The three fixtures
  (`tests/cases/math/exp-log-pow*.vl`) pin values the grader confirmed correctly rounded.
- **Cost** (wasmtime fuel per call, ~1 unit per instruction, load-independent; argument
  ranges `exp` [-10, 10], `log` [0.01, 100], `pow` x ∈ [0.1, 10], y ∈ [-5, 5]):

  | call | `-O0` | `-O3` |
  | --- | --- | --- |
  | `expF64` | 161 | 109 |
  | `expF32` | 122 | 79 |
  | `logF64` | 318 | 210 |
  | `logF32` | 128 | 74 |
  | `powF64` | 592 | 428 |
  | `powF32` | 314 | 214 |
  | sunpa `exp` (Taylor-13, no table) | 138 | 105 |
  | sunpa `ln` (atanh series) | 124 | 93 |
  | sunpa `pow` (`exp(y·ln x)`) | 266 | 201 |
  | naive 25-term Taylor `exp`, no reduction | 518 | 469 |

  sunpa's versions graded on the same grader: `exp` 1.05 ulp, `ln` 2.21, `pow` 1,498 ulp
  (the plain `exp(y·ln x)` amplifies `ln`'s rounding by `|y·ln x|`). `logF64` pays ~2× for
  its double-double, which `powF64` needs; a single-double `logF64` would save ~100 fuel at
  ~0.52 ulp and was not worth a second code path.
- **Size** (this landing together with SP-013 below). The module's source goes from 13,004
  to 33,818 bytes. An unoptimised (`-O0`) program that imports anything from `std:math`
  emits the whole module, so it grows from 4,175 to 12,913 bytes (the exp/log tables are 160
  f64 constants); under `-O3` only what is called survives (`powF64` alone: 2,710 bytes). The
  seed does not change: the compiler does not import std.

### `atan2`, `atan`, `asin`, `acos` and a scaled `hypot` at 1 ulp (sunpa SP-013)

- **Why.** sunpa's retargeting tool computes `atan2(|a×b|, a·b)` and writes f32 output; the
  slice-1 polynomial's ~1e-8 error flipped those bits, so it carried fdlibm's `atan`,
  `atan2`, `acos` and V8's scaled `hypot` in `src/tools/libm.vl`. The SP-013 ask is the
  sin/cos contract for all of them, plus `atan`/`asin`/`acos`.
- **One core.** `atanParts(t, tl)` is atan of a double-double `t ∈ [0, 1]`: reduced to
  `|u| ≤ 7/16` by `atan(t) = atan(c) + atan((t - c)/(1 + c·t))`, `c ∈ {1/2, 1}` (fdlibm's
  breakpoints), the reduced quotient kept as a double-double by `divParts` (the quotient's
  rounding error recovered with a Dekker product), then `u + u³·P(u²)`, P a degree-10
  minimax fit (`scripts/std-math/arc-tables.py`, 2^-56.8 relative; the floor is the
  rounding of P's own coefficients). `arcParts(n, d)` is the angle of `(d, n)` in `[0, π]`:
  the smaller of `n`/`|d|` over the larger, then `π - a` or `π/2 ± a` added in
  double-double. Every public f64 function is a thin edge-case layer over it: `atan2`
  scales both arguments by one power of 2 into `[2^-62, 4)` (an exponent gap over 60 is
  answered directly: `y/x`, `π` or `π/2`), `atan(x)` is `atanParts(x)` or `π/2 -
  atan(1/x)`, and `asin`/`acos` are `arcParts` over `(x, sqrt(1 - x²))` with `1 - x²`
  exact (Dekker square) and the root corrected by one Newton step, so neither loses
  accuracy near ±1. Results land in the module globals `atHi`/`atLo` (the `redHi` pattern).
- **`hypot`** squares both arguments exactly (Dekker), sums them as a double-double, and
  corrects the rounded root with one Newton step whose `r·r` is exact. Outside `[1e-135,
  1e135]` both arguments are first scaled by one power of 2, so nothing overflows or
  underflows before the result does; `hypotF64(x, y)` is infinity only when the length is.
  Correctly rounded on every normal result graded; a subnormal result is scaled back from
  the tiny path and so rounds twice, which an independent 2.8M-point review measured at up
  to 0.7496 ulp (this grid's worst was 0.5019 over 250,012 subnormal results). It differs
  from V8's Kahan-summed `hypot` in the last bit sometimes; V8's is not correctly rounded
  either.
- **Edge cases are IEEE 754 / C99 Annex F**, in both `atan2`s: a zero `y` keeps its sign,
  `x = -0` gives `±π`, two infinities give `±π/4` or `±3π/4`; `hypot(±inf, NaN)` is
  infinity. Slice 1 returned `0` for `atan2(0, -0)`; that was the documented deviation and
  it is gone.
- **The f32 functions evaluate in f64 and round once** (the sin/cos departure from §C.4,
  same reason), on a degree-6 kernel (`atanKernelF32`, 2^-38 relative) without
  double-doubles; `asinF32`/`acosF32` form `1 - x·x` in f64, exact enough at f32;
  `hypotF32` is `sqrt(x·x + y·y)` in f64, where neither square can overflow.
- **Measured** (`scripts/std-math/math-check.sh`, mpmath at 256 bits; the same run as
  exp/log/pow above): `atanF64` 0.6149 ulp, `asinF64` 0.6477, `acosF64` 0.6531,
  `atan2F64` 0.6468, `hypotF64` 0.5000 (0.7496 for subnormal results); every f32 one 0.5000. The
  exhaustive f32 run (`math-f32-exhaustive.vl`) covers every `atanF32`, `asinF32`,
  `acosF32` input: worst 0.50004 ulp, and 615 / 509 / 179 results differ from the f64 twin
  rounded. The f64 arc functions are within 1 ulp, not correctly rounded: 0.1–0.4% of
  results are the other neighbour, so they will differ from V8's (now correctly rounded)
  `Math.atan2`/`Math.acos` on that fraction, as they do from fdlibm.
- **Cost** (fuel per call; the slice-1 numbers are what these replace):

  | call | `-O0` | `-O3` |
  | --- | --- | --- |
  | `atan2F64` | 459 | 346 |
  | slice-1 `atan2F64` (polynomial) | 100 | 80 |
  | sunpa's fdlibm `atan2` | 272 | 227 |
  | `atan2F32` | 156 | 117 |
  | `atanF64` / fdlibm `atan` | 273 / 135 | 225 / 115 |
  | `atanF32` | 99 | 73 |
  | `asinF64` / `asinF32` | 399 / 112 | 333 / 89 |
  | `acosF64` / fdlibm `acos` | 424 / 99 | 346 / 82 |
  | `acosF32` | 110 | 85 |
  | `hypotF64` | 196 | 166 |
  | slice-1 naive `hypotF64` | 13 | 11 |
  | sunpa's V8 `hypot2` (array-based) | 180 | 145 |
  | `hypotF32` | 44 | 39 |

  The f64 arc functions pay 1.5–4× fdlibm for their double-double, which is what holds them
  to ~0.65 ulp at every graded argument. fdlibm's own bound was not measured here.

## `std:simd`

Slice S3 of `docs/internals/simd-design.md` — the `F32x4` surface over the `__…_f32x4__` /
`__…_v128__` intrinsics, the `std:buffer` shape.

- **`v128` is spellable.** A brand needs a base the checker can resolve, so `v128` joined
  `primTyOfName`/`builtinTyNames`. §E allows a program its own `new v128` brands; O9 is
  honoured at the API — no `std:simd` export takes or returns a bare `v128`. An `as`
  between two v128s (brand or not) is an identity re-brand, as between two `new i32` brands.
- **Operators on a non-object.** #3003 dispatched binary operators only on an object left
  operand; a `new v128` brand has no arithmetic of its own, so `tyIsV128Brand` admits it at
  both the declaration gate (`binOpDeadSelf`) and the site (`checkBinary`). A `new i32`
  brand is deliberately not admitted: its `+` is the language's own.
- **`reduceAddF32x4` order.** Two shuffles: `s = v + v.zwxy`, `t = s + s.yxwz`, lane 0 of `t`
  is `(x + z) + (y + w)`. Documented in the export because a scalar oracle has to copy it.
- **`cross`** is `a.yzxw * b.zxyw - a.zxyw * b.yzxw` with lane 3 then replaced by `0.0`; the
  raw lane 3 would be `aw*bw - aw*bw`, which is NaN for an infinite or NaN `w`.
- **`dot`/`normalize` read all four lanes** (vec4 semantics). A vec3 is "padded" with `w = 0`,
  which makes the four-lane and three-lane answers equal; O7's "ignored" is only literally
  true of `cross`. Flagged to the owner with D1980.
- **Unsuffixed methods own their names.** `dot`/`cross`/`normalize` (O7) are ordinary
  functions, so a later `F64x2` must use `dotF64x2`. A caller module with its own `dot` loses
  the no-import spelling (D1984); the header documents the aliased-import workaround.
- **Containers are refused in the checker, including at a generic pin** (D1981): the direct
  site, an annotation, and a generic body's `[x, x]` re-asked at the call that binds `T`.
- **Lane read-back** (D1980, closed; `property-access-design.md` §E3, F3(a), F4(b)).
  `lane(i)` / `withLane(i, x)` take `i: Lane4` (`0 | 1 | 2 | 3`) and are a four-arm `==`
  ladder, each arm passing a LITERAL to the intrinsic, so the intrinsic's literal-lane check
  holds inside std and no compiler line was needed. A literal argument folds to one
  `f32x4.extract_lane N` / `replace_lane N` at `-O`/`-O3` (`tests/vl_simd_lane_codegen_test.ts`);
  a runtime `Lane4` keeps all four arms; a plain `i32` is refused (`expected Lane4, got i32`).
  At `-O0` a literal read is a call plus up to three compares. Unsuffixed because D1984 landed:
  a caller's own `lane` for another `self` type steps aside (`f32x4-lanes-own-names.vl`).
  `.x/.y/.z/.w` are getters v1 (`export get`), one intrinsic each, inside the body contract.
- **What grades it.** `tests/cases/simd/f32x4-std-surface.vl` (every op, lane order, NaN and
  -0.0), `f32x4-geometry.vl`, `f32x4-kernel-vs-scalar.vl` (bit-identical to scalar),
  `f32x4-positions.vl`, `f32x4-lanes.vl`, and the `error-*` refusals.

## `std:buffer` over a shared memory (2026-09-24)

- The shared allocator is inline in `Buffer`, `bufferMark` and `bufferRelease` under
  `if __memory_shared__() { … }`, which the compiler folds per build (`foldMemShared`). It is
  inline, and the header size is a literal `8`, because the compiler emits every private
  function and every top-level `const` of an imported module whether or not a build uses it:
  a helper or a `const` used only by the shared path would change every default build's bytes.
- `bumpOff` means two things: bytes handed out from the heap base in an unshared build, and
  where this instance's latest `Buf` ended (from heap base + 8) in a shared one.
- `memory.grow(0)` rather than `memory.size` after a refused grow, and before believing the
  header's page is absent: V8's per-instance `memory.size` can lag another instance's growth.
- The shared `bufferRelease` returns, not traps, on a mark past the pointer: another instance's
  release can legitimately rewind below it.
- Protocol and rationale: DECISIONS.md §"std:buffer's allocator over a shared memory";
  layout: `buffer-design.md` §N.
