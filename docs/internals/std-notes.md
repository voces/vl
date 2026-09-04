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

- **`sorted`'s body is `sort`'s, copied, and that is a compiler limitation.** It should
  read `const out = …copy…; sort(out, less); return out` and cannot: a GENERIC function
  cannot pass its own generic-typed function parameter to another generic function. The
  direct call, the UFCS call, a forwarding local and a re-wrapping lambda were all
  refused. `tests/cases/std/array-sort-agrees.vl` is the differential fixture that keeps
  the two copies honest; the only intended differences are the leading copy and the
  tail, where `sorted` returns whichever buffer holds the answer.
  `tests/cases/std/error-generic-closure-forward.vl` pins the refusal itself.
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
- **Not done, deliberately:** no `sortUnstable`, no `sortBy`/`sortedBy`, no default
  ordering `xs.sort()` (`<` is defined for the scalars and `string` but not for a struct
  or a union, and VL has no overloading to express that), no `binarySearch`/`lowerBound`
  (excluded by name in `perf-workstream.md` §6.2), and no adaptivity.

## `std:buffer`

- The design record is `docs/internals/buffer-design.md`; the module implements §C's
  sequencing item S5, with O1 = (c) — `Buffer` is std VL, not a compiler-known type.
- **Bounds: none, by design (§A4).** An access past the end of the memory traps in the
  ENGINE, and that trap is the memory-safety proof; a VL-level check would only make it
  quieter. The typed views are the one exception, and §J3 is why the check is at
  construction rather than per access.
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
  another process.
- **Not here, and why:** no path manipulation (a future `std:fs/path`); no open handles,
  seeking, streaming or partial reads; no metadata beyond file-or-directory; no mkdir,
  remove, rename or symlink inspection — each is a floor intrinsic that does not exist,
  and a std wrapper for a syscall VL cannot make is a name that fails at emit.

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

## `std:seed`

Kept only to prove the `std:` resolution plumbing end to end — both resolvers, the Rust
host's std-dir mapping, the CLI's `fsRead` wrap, the LSP's embedded map. It can be retired
once any real module stands in for all of those.
