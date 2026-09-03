# Emitter section notes

Long-form rationale and measurements moved out of `compiler/emit_sections.vl` by
the 2026-09-02 comment trim (the 12-line comment-block budget). Each section is
the block's text as it stood in the file; the code keeps the invariant, the WHY,
and a pointer here. Nothing in this file is graded by a gate — a claim that needs
grading belongs in `silent-class-inventory.md` as a row with a repro.

**One measurement in the archived text below is STALE, and is kept only because the
move is verbatim.** The `$fnsig`-key section's parenthetical says "this `>` is the
only angle bracket in `emit_sections.vl`, and `driver.vl`'s two `<` are the only
ones there". The first half still holds (one `'>'` char literal, 2026-09-02); the
second does not — `compiler/driver.vl` carries no `<` character or string literal at
all. The trimmed comment in `compiler/emit_sections.vl` does not repeat the census.

## the parameter valtype ladder and D426's `is` vs `contains`

Moved from `compiler/emit_sections.vl` (the 40-line block at line 613, as it stood at 2026-09-02).

```text
i32, `boolean` (which rides in an i32, 0/1 — encoded as the SAME 0x7f
valtype), the declared struct type, a NULLABLE struct (`S | null`), an
array (`i32[]`), or `string` (the SAME `array i32` of code points) are
allowed; anything else fails.
(`collectA` already validated every array annotation is i32[].)
THE FLOOR SAID "IS" WHERE IT MEANT "CONTAINS", and that one word is the whole
of D426. Every rung below asks about a CONSTRUCTOR — is this an array, a
struct, a map, a scalar — and each of them answers YES about a constructor
over an unsubstituted type parameter. A BARE `T` param is rejected (it matches
no rung and falls to the message below, measured at every argument rep), while
`a: T[]` is a `TyArray` OVER one, so `nodeTyIsArrayish` claimed it and the
param was lowered at the i32 default: `call_indirect (type $N)` with
`(structref i32 i32)` where the values are `(ref $list)`. `vl check` rc 0 and
the engine refuses the module. Same word one layer down that D421's
`noteBinCstr` and D422's `nodeTyIsTyVar` each needed.

WHO REACHES THIS — AND IT IS ALMOST NOBODY NOW. Read the paragraph above as
history. A monomorphized INSTANCE has had its parameter annotations rewritten to
the pinned names (`monoInstantiate` → `synthTypeRef`); what did NOT was a LAMBDA
declared inside a generic body, because `collectFns` lifts it before
`monomorphize` runs and one lifted function then served every instance. **That is
built now**: `monoCloneLambdaSubst` / `monoPinBodyLambdas` instantiate the lambda
per pin with the substituted annotations and `monomorphize`'s prune stubs the
template, so the 68 cells of `scripts/silent-sweep/d426/lamgrid.py` that this
floor used to refuse all RUN (2026-08-30, D426's second close).

WHAT STILL LANDS HERE is the case the substitution cannot serve: a type parameter
NO call site binds (`function opT<T, U>(a: T[])` with a `(x: U[]) => …` lambda).
`monoSubstAnn` has no spelling for `U`, the clone declines, and the prune's
`monoLamShared` ledger keeps the template rather than stubbing a function the
instance body still calls — so this floor is what the program gets, loudly, and
that is the honest answer. `tests/cases/generics/error-lambda-param-unbound-typaram.vl`
is the pin; the accept set is `lambda-param-type-param-runs.vl` beside it.

`nodeTyHasRepTyVar`, NOT `nodeTyHasTyVar`, and the difference is 12 running
cells. A `T` under a `=>` does not decide the parameter's valtype — a closure
param is the fat pointer at every instantiation — so the wide predicate refused
`(x: (T) => T) => x` and every sibling of it, all of which run correctly today.
The narrow predicate's own header carries the measurement, including why the
exemption hides no silent class.
```

## B102 — the five scalar rungs stay on the softened NAME

Moved from `compiler/emit_sections.vl` (the 36-line block at line 696, as it stood at 2026-09-02).

```text
accepted — a `K | null` NICHE param is the i32 atom with the spare `-1` = null (kind 0).
THE FIVE SCALAR RUNGS BELOW STAY ON THE NAME — MEASURED DECLINE (B102).

`nodeTyPrimName(p.parType)` is the twin and reads cleanly, but substituting it for
the five `ty.tyName != "<prim>"` comparisons moves 20 corpus rows. The failures are
`closures/closure-numeric-litunion-param-pin*.vl`: a NUMERIC literal-union param
renders as `f64` after canon softening, so the spelling accepts it here, while the
arena sees a `TyUnion` of `TyLit`s and rejects — turning a lowerable param into
"only i32, i64, f64, f32, boolean, struct, union, array, or string parameters are
supported".

The softened name is the RIGHT answer at this position: a numeric litunion param IS
lowered as its base scalar. That is the same verdict `paramString` and `letIsF64`
reached, and the third time a PARAM-position rung has wanted canon's answer rather
than the type's.

(That note once read "the ladder is string-based at every rung anyway". No longer:
the scalar rungs read the arena (#1605), the string rung does (#1606), the union
rung does with a measured two-file remainder (#1607), and the struct rung does with
none at all (#1608), the array rung does (#1609), and the union and variant rungs
do (#1610). The ladder reads no rendered type at all now; the only spelling left
is `paramScalarName`'s fallback for a node the checker never recorded, measured at
ZERO corpus uses and kept because removing it turns that unmeasured class into
hard rejects rather than into an arena answer.)

B110 SETTLED WHY, and it is the whole ladder rather than these five. Every rung
above is named by its LOWERING (`(ref null $S)`, kind 15/16/18, the 0x7e valtype,
the i32 sentinel) and the reject says "supported" — this asks what CELL the param
takes, never what type it is. That is why a param-position rung keeps wanting
canon's softened name: the softening IS the lowering.

The blocker is one line in `vtKindOfType`: it ends in a bare `"i32"`, so it is
TOTAL and has no "none" to report. It cannot decide a reject, which is why this
ladder re-enumerates the supported set by spelling instead of consulting the
strangler seam. `annRepKindOf` already answers `VKind | null` — threading that
nullable answer through to here leaves the spellings nothing to decide.
```

## the union rung, and the remainder that dissolved from upstream

Moved from `compiler/emit_sections.vl` (the 15-line block at line 756, as it stood at 2026-09-02).

```text
THE ARENA, AND NOTHING ELSE. `isUName` tested a registry keyed by the
union's SPELLING; #1607 replaced it with `nodeTyIsUnionish` plus a
spelling-tree read for a measured two-file remainder (`Cat | Dog`,
`A | B` — same-shape unions the arena collapses).

That remainder is GONE, and not because anything was done to this rung.
#1608 put the STRUCT rung above on the arena, and a same-shape union
collapses to a `TyObj` — so the struct rung now claims both files before
this one is reached. Measured: `annSpelledUnion` answers TRUE on zero
corpus files, and deleting it leaves both fixtures running correctly
(`cat dog`, `1 1`) with 0 of 1947 rows moved.

Fourth rung in this ladder to dissolve from upstream rather than yield to
direct attack, after `nameIsArray`'s double duty, `variantIndexOf`, and
the scalar rungs' litunion case.
```

## promoMark — a hole costs population, never soundness

Moved from `compiler/emit_sections.vl` (the 13-line block at line 1131, as it stood at 2026-09-02).

```text
Mark every arena node reachable from the TOP-LEVEL REGION — the top-level statement
list and the top-level initializers — into `marks`, WITHOUT descending into a nested
`FuncDecl`. That stop is a semantic requirement, not an optimization: a lambda
literal written at top level is LIFTED to its own wasm function, and its body still
addresses the binding as a module cell.

A node shape this ladder does not know leaves its descendants UNMARKED, and an
unmarked mention refuses the promotion — so a hole here costs POPULATION, never
soundness. That asymmetry is why reachability is computed in this direction rather
than the obvious one (walk each function body looking for the name): the flat arena
scan it pairs with in `computeGlobalPromotion` is exhaustive by construction, so a
hole in THIS walk can only move the answer to the conservative side. A hole in a
function-body walk would move it to the unsound side.
```

## globalPromotable — clauses P2 and P3

Moved from `compiler/emit_sections.vl` (the 18-line block at line 1249, as it stood at 2026-09-02).

```text
THE CHEAP HALF of the safety predicate — the two clauses that read only this
binding's own declaration. The reachability clause is applied by
`computeGlobalPromotion`, which is the only caller.

  P2  The cell kind is a plain numeric scalar (`i32`/`i64`/`f64`/`f32`). For exactly
      these, `fbValtypeNullable(ck, cs)` and `fbValtype(ck, cs)` are the same byte, so
      a start-fn local is a drop-in for the cell — and they are precisely the kinds
      `emitIdentNode`'s non-const `ref.as_non_null` recovery already excludes, so no
      read-side path changes shape. A REF cell is a NULLABLE global but would be a
      non-null local; reconciling those two valtypes is a different change and is
      deliberately not attempted here. Note the i32 kind also carries the
      literal-union, `K | null` and `boolean | null` NICHE encodings, and promoting
      them is storage-correct precisely because promotion moves the VALUE and not the
      BINDING: the row stays in `globalStmts`, so `globalCellKind`, `letIsLitUnion`,
      `letIsNulBoolAnn` and every other classifier keep answering about the same
      `LetDecl` and keep answering the same thing.
  P3  The binding has an initializer. `emitGlobalSection` already rejects one without,
      and a promoted binding's slot has no other way to acquire a value.
```

## computeGlobalPromotion — clauses P1 and P4

Moved from `compiler/emit_sections.vl` (the 26-line block at line 1281, as it stood at 2026-09-02).

```text
Decide, for every top-level binding, whether it lives in a cell or a start-function
local, and re-densify the cell indices around the ones that leave. Runs ONCE, at the
top of `emitModule` — after every pass that mutates the arena (monomorphization
clones nodes, and a clone that mentions a name has to be seen by the scan below) and
before the first section that reads a global index.

THE SAFETY PREDICATE is P1 here plus P2/P3 in `globalPromotable` plus P4 below:

  P1  There IS a top-level statement list. A binding in a pure-library module has
      nothing to be faster for, and the clause additionally guarantees `hasStart` is
      already 1 — so promotion can never MINT a start function for a module that had
      none, and can never grow one.
  P4  Every `Ident` node in the arena that spells this binding's name is inside the
      top-level region. This is the clause that rules out a named function body
      reading it, a lifted lambda capturing it, a monomorphized clone mentioning it,
      and any mention reached by a path this file does not model. It is deliberately
      NAME-keyed and not binding-keyed: a function with its own local of the same
      name vetoes a promotion it did not need to veto, which costs population and
      nothing else.

P4 subsumes the export question rather than testing it separately. An `export let`
produces no export entry at all (`exportSlotOfTarget` matches `FuncDecl`s only), the
name section has no global-name subsection, and a VL program runs BY INSTANTIATION —
the start section IS the top level, with nothing before it and nothing after it. So
the start function's frame is the whole observable lifetime of a binding no other
function names.
```

## the union global cell is always the box

Moved from `compiler/emit_sections.vl` (the 19-line block at line 1885, as it stood at 2026-09-02).

```text
A UNION cell (kind 4) coerces a raw init value into the box
(`let w: string | i32 = n` boxes the i32 read) — a union-valued
init (a union-returning call) passes through unchanged.

THE BOX-TYPED POSITION. A union global's cell is ALWAYS the box
(`globalCellKind` has no kind-8 raw-variant cell, unlike `buildLocals`), so a
CONCRETE-VARIANT init — `const b: A | B = mkB()`, `mkB` returning the arm `B` —
must be boxed here exactly as a call argument / return / array element is:
`emitUnionBoxArg` boxes a variant ref and defers every other shape (object
literal, passthrough union, scalar atom) to `emitUnionCoerce`. Plain
`emitUnionCoerce` RAW-PASSES a struct-typed init whose heap type is already
deduped with the arm's variant struct, storing a `(ref $variant)` into the
`(ref null $uBox)` cell — invalid wasm, `vl check` clean before `--codegen`
validated the module (#1678). The same three lines inside a `function` ran,
because a union-annotated LOCAL with a variant init binds the RAW variant
(kind 8) and so needs no box; only the global cell disagreed with its store.
The heap-dedup gate is why a MIXED union (`{w:i32} | i32`) escaped: its arm's
variant struct is a distinct heap type, so `emitUnionCoerce`'s twin-rebox arm
already boxed it (`unions/call-struct-arm-into-variant-box-local.vl`).
```

## the module-scope twin of the union-box map-read arm

Moved from `compiler/emit_sections.vl` (the 18-line block at line 1910, as it stood at 2026-09-02).

```text
THE MODULE-SCOPE TWIN of `emitLetDeclStmt`'s union-box map-read arm, and the
one arm of that ladder this one never grew. A bare top-level `const t = m[k]`
over a UNION-valued map (mv kind 2 — a value union, a struct union, a numeric
literal union, and every `T | null` scalar, all of which rep as the shared
`{tag, payload}` box) must lower its MISS as the NULL-TAGGED BOX, because the
consuming `!= null` / `is` / `match` / `??` is a TAG COMPARE that recovers the
box with `ref.as_non_null` first.

Without this arm the init fell through to `emitExpr` -> `emitMapGet`, whose
miss arm yields "the rep's empty value" — a BARE `ref.null`. The module is
VALID and `vl check` is rc 0; the program LOADS, prints every line before the
read, and then traps `null reference` on the recover. The same binding inside
a `function` has always lowered correctly, which is what made this invisible:
the storage class of the executing body is the only thing that differs.

Measured on the scope-crossed grid (`scripts/silent-sweep/gen.py --scopes`):
38 of 8,550 paired coordinates, all `scope=mod`, all on a MISSING key, all
`wasm trap: null reference`; the function-scope twin of every one is correct.
```

## __str_hash__ — the memo, the zero sentinel and the unroll

Moved from `compiler/emit_sections.vl` (the 38-line block at line 2147, as it stood at 2026-09-02).

```text
`__str_hash__(s) -> i32`: the masked non-negative FNV-1a hash of a string —
`h = 2166136261; for c in s { h = (h ^ c) * 16777619 }; h & 0x7fffffff`. The
32-bit wasm `i32.mul` wraps exactly as the host's hash does. Params: s(0).
Locals: h(1), i(2), n(3), lim(4), back(5).

STAGE 3 — THE CACHE. The walk runs at most ONCE per header. The answer is memoised in
the header's mutable `$hash` field (field 3): the prologue returns it when it is
non-zero, the epilogue stores it. Sound because the hash is a pure function of
`{backing, start, len}` and all three are immutable — the write cannot change any
observable value, which is why one mutable field in an immutable string is a memo and
not state (`java.lang.String.hash`, exactly).

THE ZERO SENTINEL. `0` means "not computed yet", so a string whose hash genuinely IS 0
re-walks on every call — Java's tradeoff, taken here for the same reason (a second flag
field would cost a whole word to save one value's worth of work). The probability is
**1 in 2^31**, not 2^32: the returned value is masked to `& 0x7fffffff`, so the codomain
is the 2^31 non-negative i32s and exactly one of them is the sentinel. ~4.7e-10 per
distinct string; the compiler's ~600k-string self-compile expects 0.0003 of them.

The walk is UNROLLED FOUR WIDE, then a scalar remainder loop finishes the tail —
the same shape `__str_eq__` uses, and `lim = n - 4` is likewise a SUBTRACTION so
a maximal-length string cannot overflow the gate (`n` is an `array.len`, while
`i + 4` could wrap). For `n < 4` the limit goes negative, `i > lim` is true at
`i = 0`, and every element is answered by the remainder loop, so short strings
skip the wide block entirely instead of paying a wasted test.

FNV is a SERIAL dependency chain — each `i32.mul` waits on the previous `h` — so
the unroll cannot overlap the arithmetic; what it removes is the per-element loop
control, and `n` is hoisted because a reference local lives in a stack-map slot,
making `local.get 0; array.len` a memory LOAD on every iteration rather than a
loop-invariant the engine can hoist. Measured on a 1k-entry / 8M-lookup probe at
46-char keys: 2.13 → 1.10 ns per code point, which is ~3 cycles/point and hence
the `i32.mul` latency floor. Widening to eight is measurably WORSE (more code,
same chain), and no further unroll can help — the loop is now
dependency-bound, not overhead-bound. That floor is also what bounds any
hash-CACHING scheme, and the bound has been measured rather than argued: replacing
this walk with a constant-time one is worth 1.88x per lookup at ~97-char keys, 1.33x
at ~33, and NOTHING at ~9 — the length a real key usually is.
```

## __str_eq__ — the eight-wide unroll and the ref.eq fast path

Moved from `compiler/emit_sections.vl` (the 51-line block at line 2274, as it stood at 2026-09-02).

```text
`__str_eq__(a, b) -> i32`: element-wise string value-equality — 0 if the lengths
differ or any code point differs, else 1. Params: a(0), b(1). Locals: n(2), i(3),
lim(4).

The element walk is UNROLLED EIGHT WIDE over an xor/or accumulator, then a
scalar remainder loop finishes the tail. Eight `a[i+k] ^ b[i+k]` values are
or-ed together and tested ONCE, so a full block costs one branch instead of
eight; the accumulator lives entirely on the wasm value stack and needs no
local. WasmGC has no instruction that compares more than one array element at a
time, so this is the whole of the available win — it removes branch and
loop-control overhead, not loads.

`lim = n - 8` is the last index at which a full block still fits, and the gate
is `i > lim`, which is why it is computed as a SUBTRACTION rather than as
`i + 8 > n`: `n` is an `array.len` and cannot overflow the subtraction, while
`i + 8` on a maximal-length string could. For `n < 8` the limit goes negative,
`i > lim` is true at `i = 0`, and every element is answered by the remainder
loop — so the short strings that dominate real programs skip the wide loop
entirely rather than paying a wasted test. Because the block runs only when
`i <= n - 8`, every index it touches is `< n`; the unroll cannot read past the
end of either operand.

IDENTITY FAST PATH (`ref.eq`) — the twelve bytes that pay for themselves. A
string is `(array (mut i32))`, hence an `eqref`, so the two operands can be
compared BY REFERENCE before anything is read. Same reference ⇒ equal, always:
there is no aliasing case where an array is unequal to itself, and a length-0
string already answered 1 down the slow path. So this is a pure short-circuit,
not a semantic change — every input that reached `1` still reaches `1`, and
every input that reached `0` still walks (distinct references fall through).

It pays because the string-literal POOL (`emit_state.vl`'s `gStrPoolTexts` /
`gStrPoolIx`, consumed by `emitStr`) interns every distinct string LITERAL in
the program as ONE immutable module global: a literal occurrence
lowers to `global.get`, so the SAME `"IDENT"` in twelve source files is one
object. Every compare of a pooled literal against a value that came FROM that
literal — `tok.kind == "IDENT"`, a rep-tree tag, a canonical type spelling —
is therefore reference-identical and now costs `ref.eq` instead of a walk over
up to N code points. Measured on a self-compile: `__str_eq__` 424.7 → 360.1
samples/run (−15.2%) and the whole compile −3.8% (perf-program.md §10).

The NULL corner is stated rather than left to be discovered, and it was
MEASURED rather than argued: `ref.eq(null, null)` would answer 1 where the old
body reached `array.len` on a null and TRAPPED. It is unreachable — a
`string | null` operand is unwrapped BEFORE the call, so `a == b` with both
null traps upstream of this helper. Both compilers run the probe (two null
`string | null` values compared with `==`) to the same `wasm trap: null
reference` at the same address; a reachable corner would have printed `EQ`.
The two element reads of `__str_eq__`, written as a PAIR so they cannot drift: `a[i + k]`
is `aBack[i + k]` (the cursor is already in A's backing coordinates) and `b[i + k]` is
`bBack[i + k + d]`. Frame: aBack(5), bBack(6), i(3), d(7). Used by both the eight-wide
block and the scalar remainder, so all four spellings of the read come from these two.
```

## __utf8_enc__ — why fromCodePoints must encode

Moved from `compiler/emit_sections.vl` (the 16-line block at line 2836, as it stood at 2026-09-02).

```text
`__utf8_enc__(back, start, len) -> (ref str)` — UTF-8-encode `len` i32 CODE POINTS read
from `back[start ..]` into a fresh, exact-fit string.

This is what `fromCodePoints` STOPS being: it was one `array.copy`, and `strings-design.md`
§Migration called that "the largest semantic change in the bucket". `fromCodePoints`'s
contract is fixed by its name — each i32 is a code point — so under UTF-8 storage it has to
encode, and a caller that fills its buffer with `s[i]` (now a byte) double-encodes. That is
the §Builders defect the `std:str` audit found in shipped code, and it is why the repaired
builders feed themselves by `for cp in s` instead.

TWO PASSES, because a WasmGC array is fixed-length: pass 1 sums the widths to size the
backing, pass 2 writes. Both read through `fbUtf8EncRead`, so they cannot disagree about
what a code point is or which of them sanitizes.

Params: back(0) `(ref $aTypeIdx)`, start(1), len(2). Locals: n(3), i(4), cp(5), out(6)
`(ref $sBackIdx)`, w(7).
```

## __utf8_cplen__ drives the decoder rather than counting lead bytes

Moved from `compiler/emit_sections.vl` (the 14-line block at line 2978, as it stood at 2026-09-02).

```text
`__utf8_cplen__(s) -> i32` — the CODE POINT count of a string view, O(n) and named so
(§Codepoints: "operations whose cost depends on the data get a name, not a subscript").

IT DRIVES `__utf8_dec__` RATHER THAN COUNTING NON-CONTINUATION BYTES, and the difference
is only visible on malformed input — which is exactly why it matters. The cheap count
says `"é→".slice(1, 4)` (the bytes `A9 E2 86`) holds ONE code point, because only `E2` is
a lead byte; the decode says THREE, because a stray continuation byte and a truncated
sequence each yield their own U+FFFD. `for cp in s` iterates three times, so the cheap
count would make `cpLen()` disagree with the loop it is supposed to measure — a second
answer to one question, which is this emitter's signature defect wearing a different hat.
Sharing the decoder makes the two unconditionally equal, at the cost of a call per code
point on a function that is already O(n) and already named for its cost.

Params: s(0). Locals: back(1) `(ref null $sBackIdx)`, i(2), end(3), n(4).
```

## __str_bytes__ copies, and the design doc said it would not

Moved from `compiler/emit_sections.vl` (the 18-line block at line 3043, as it stood at 2026-09-02).

```text
`__str_bytes__(s) -> (ref $bl8TypeIdx)` — `s.bytes()`, the `u8[]` view of a string's UTF-8
storage (§Byte view). One `array.copy` of the VIEW's byte range into an exact-fit packed
backing, wrapped in the ordinary `{backing, len, cap}` list struct.

IT COPIES, AND `strings-design.md` §Byte view SAYS IT WOULD NOT. That claim assumed the
`u8[]` wrapper could alias `$backing`/`$start`/`$len` directly; it cannot, because a `u8[]`
wrapper has NO `start` field — `xs[i]` is `backing[i]`, full stop — so a view whose `start`
is non-zero has no wrapper spelling at all. Making one exist means giving `u8[]` a slice
header too, i.e. the same migration this stage just performed, on a second type. That is a
separate change with its own gates, and pretending otherwise here would mean a `bytes()`
that is zero-copy on `s` and silently wrong on `s.slice(1)`. Filed, not done.

What it still buys over the four lines of VL that would do the same thing is that this is
ONE `array.copy` — a memcpy the engine lowers to `memmove` — where a VL loop is one
`array.get_u` + one `array.set` per byte. That is the property that keeps it a core
intrinsic under OQ-3's rule rather than a `std:str` function.

Params: s(0). Locals: out(1), a NON-NULL `(ref $ba8TypeIdx)` set before every read.
```

## the index-capacity power-of-two invariant, and __map_probe__

Moved from `compiler/emit_sections.vl` (the 27-line block at line 3096, as it stood at 2026-09-02).

```text
THE INDEX-CAPACITY POWER-OF-TWO INVARIANT, which both probe helpers and the
rehash rely on to wrap with `i32.and` instead of `i32.rem_u` (a hardware
divide on every probe and every collision step). The `index` array's length is
a power of two at every point in a map's life, from its only three producers:
  · `emitMapNew` allocates it at INITIAL_CAP*2 = 16;
  · `__map_resize__` (`emitMapResizeFnCode`) replaces it with `2 * len(index)`;
  · `emitMapCompact` rebuilds it at `cap = 16; while cap < 2*size { cap *= 2 }`.
There is exactly one `struct.new` of a map struct and exactly two writes to its
`index` field, so this list is the whole population — a fourth producer that
did not preserve the invariant would silently corrupt every probe, so add one
only together with a `mask = cap - 1` that is still `cap - 1` for it.

`__map_probe__(keyHash, index, hashes, live, keysBacking, key) -> i32`: linear-probe
(wrapping) from the key's hash to the slot holding either the matching key's entry or
a free (0) slot — the shared core of every map op. The stored per-entry hash gates the
string compare, and a tombstoned entry (`live[entry-1] == 0`) probes past (a marker,
not a hit) — see `emitMapProbe`'s caller-side contract. Returns the PROBE SLOT; the
caller re-reads `index[slot]` for the entry.

The hash arrives as a PARAM rather than being walked here, because an appending
`m[k] = v` has to store that same hash into `hashes[]` right after the probe: computing
it once at the call site is the difference between one `__str_hash__` walk per insert
and two. It leads the operand list so the call site can emit it FIRST, on an empty
operand stack — hashing after the four backing `struct.get`s would leave four GC refs
live across the `__str_hash__` call, which the engine must spill and reload per probe.
Params: keyHash(0), index(1), hashes(2), live(3), keysBack(4), key(5).
Locals: mask(6), slot(7), entry(8).
```

## __map_probe_i32__ — the deliberate hashing asymmetry

Moved from `compiler/emit_sections.vl` (the 13-line block at line 3197, as it stood at 2026-09-02).

```text
`__map_probe_i32__(index, hashes, live, keysBacking, key) -> i32`: the i32-KEYED
twin of `__map_probe__`, line for line, with three substitutions — the key is hashed
by the integer mix (`fbI32HashMix`) instead of `__str_hash__`, the stored-hash gate
falls through to an `i32.eq` on the key instead of a call into `__str_eq__`, and the
mix stays INSIDE this helper where the string hash is passed in. That last one is the
deliberate asymmetry: the string hash is a call over an O(len) walk, so hoisting it to
the call site saves a whole second walk on an appending insert, while the i32 mix is
eight inline instructions — hoisting it would copy them into every probe site to save
one insert-only mix. Everything else (the wrapping linear probe, the free-slot break,
the tombstone skip, the entry+1 encoding) is IDENTICAL, which is what lets both key
kinds share `__map_resize__`, the rehash and the compaction. Params: index(0),
hashes(1), live(2), keysBack(3), key(4). Locals: mask(5), keyHash(6), slot(7),
entry(8).
```

## emitNameSection — the name-section layout

Moved from `compiler/emit_sections.vl` (the 14-line block at line 3386, as it stood at 2026-09-02).

```text
Emit the wasm "name" custom section (section id 0, name "name") so a wasmtime
trap backtrace shows real function names instead of `<wasm function N>`. GATED
on `gEmitNames` — a no-op when off, so the default emit path (goldens +
fixpoints) is byte-identical. `n` is the user-function count (`fnStmts.length`)
and `gImports` the imported-function count (0 or 4); the imports occupy wasm
indices 0..gImports-1 (the print family), the user functions gImports..gImports+n-1.

Layout (per the WebAssembly name-section appendix):
  section: id 0, ULEB(size), wName("name"), <subsections>
  module-name  subsection (id 0): ULEB(size), wName("vl")
  function-name subsection (id 1): ULEB(size), namemap
    namemap = ULEB(count), then count * { ULEB(funcidx), wName(name) }
  indices MUST be strictly increasing — we emit imports (0..3) then user
  functions in their natural index order, so the sequence is already sorted.
```

## the start-function model for non-const global initializers

Moved from `compiler/emit_sections.vl` (the 14-line block at line 3579, as it stood at 2026-09-02).

```text
── Start-function model (non-const module-global initializers) ──────────────
A module global whose initializer is NOT a WasmGC constant expression (a member
access like `curBuf = W.bytes`, a reference to another global, a call, …) cannot
be emitted inline in the global section. Its cell is zero-initialized there
(nullable `ref.null` / `i32.const 0`) and a SINGLE synthetic start function — the
LAST function index, so no user index shifts — runs every such init via
`global.set` before any other code. Count them up front; the count drives one
extra `()->()` functype, one extra function-section + code-section entry, and the
start section (id 8). When zero (the case for EVERY golden), nothing below
changes, so the module stays byte-identical.
Decide the storage class of every top-level binding BEFORE any section reads a
global index — the counts, the cell indices and the start-fn frame all derive from
it. It runs here rather than as an emit PASS because it must see the arena every
pass left behind, monomorphization clones included.
```

## the fs functypes fold into nPrintTypes

Moved from `compiler/emit_sections.vl` (the 14-line block at line 3709, as it stood at 2026-09-02).

```text
ONE standalone functype per USED fs import, folded into `nPrintTypes` rather than
threaded as a seventh parameter. That is the whole reason the fs functypes sit
immediately after the print ones instead of at the very end of the section: every
index downstream — the `__log__` decoder's functype (`+ nPrintTypes`), `helpTyBase`,
the export-wrapper block, and the rectype COUNT — is already expressed in terms of
this number, so they all absorb the fs types with no arithmetic of their own. A
seventh parameter would have had to reach four call sites and each would have been a
place for the two to drift.

One per USED import, not one per distinct SHAPE: `__fs_read__` and `__fs_list__`
share a signature and get two structurally identical rectypes. Duplicate functypes
are valid wasm and cost ~5 bytes; sharing them would make slot k's functype index
depend on which OTHER slots the program uses, which is precisely the coupling the
append-only slot order exists to avoid.
```

## D1080 — a declarations-only module is a module

Moved from `compiler/emit_sections.vl` (the 14-line block at line 3885, as it stood at 2026-09-02).

```text
A MODULE WITH NO FUNCTIONS AND NO START STATEMENTS IS A MODULE (D1080). This pass used
to refuse one, and the refusal was about the ENTRY POSITION and nothing else: the
identical file IMPORTED by a program that uses its types compiles and runs today, so the
compiler already agrees a declarations-only module is legal — it just could not be the
one named on the command line. `export type Point = { x: i32, y: i32 }` is `vl check`
rc 0, and a `loud emit reject` on a check-clean program is a clause-2 violation by
construction.

An empty wasm module is valid wasm, and every section this emitter writes is already
gated on having something to write: the function / code / export / element sections all
loop over lists that are simply empty here, and the start section is written only when
there is a start function. So the pass has nothing left to enforce — it stays as a ROW
in the table (the ordering edge `collectFns` declares is still real) and enforces
nothing.
```

## scanPrintUse — "any print" is a property, not a spelling

Moved from `compiler/emit_sections.vl` (the 15-line block at line 3901, as it stood at 2026-09-02).

```text
Detect `print(...)` / memory-intrinsic use anywhere in the program: any print
pulls in the 4-import print family (imports shift every local function's wasm
index, so this is decided up front; a print-free program emits no import
section at all). Scans the WHOLE arena, so it must run after every pass that
mints nodes (monomorphization instances, synthesized annotations).

"any print" is the PROPERTY, not the spelling `print(`: the reservation must
cover every construct the emitter lowers to a `__print_*__` import, whichever
name the author wrote. Three do — `print(...)`, `__log__(...)` (its decoder
prints through `__print_i32__`) and `__trap__(<string>)` (its reason streams
through `__print_char__`/`__print_str_flush__`). A construct that streams but
is missing here is not a wrong number, it is a module with no import section
whose streaming calls resolve to USER function indices: invalid wasm that
`vl check` passes. Grep `fbCall(0)`..`fbCall(4)` and `emitPrintStrExpr` in
`wasmEmit.vl` before adding a fourth.
```

## the filesystem floor — why the reservation happens in this scan

Moved from `compiler/emit_sections.vl` (the 21-line block at line 4002, as it stood at 2026-09-02).

```text
THE FILESYSTEM FLOOR. Unlike every memory intrinsic above, these are host
IMPORTS, so a use here reserves a wasm function index — which is exactly why
the reservation has to happen in this scan and not at the call site: an extra
import shifts every user function's index, and the count cannot be discovered
mid-emit (`gImports`' own header says so).

`gImports = 4` pulls in the whole print family, the same thing `__log__` and
`__trap__(<string>)` above do. The fs imports are appended AFTER it rather
than replacing it: `emitImportSection` writes the four print entries
unconditionally whenever `gImports > 0`, and every host already provides them,
so reusing that reservation costs a file-touching program four unused import
entries and costs a file-free program nothing at all. Splitting the print
family's own gate would be the alternative and it would rewrite the one
section whose bytes 2,089 corpus goldens pin.

`ba8Used` is forced for any slot whose signature mentions `u8[]`, because the
packed heap-type pair must exist for the import's FUNCTYPE to name it. The
annotation scan that normally sets it sees only what the program SPELLS, and
`__fs_errno__() != 0` next to a bare `__fs_read__(p)` in statement position
spells no `u8[]` anywhere. This pass runs after every node-minting pass and
before `mAssignTypeIndices`, which is the window in which forcing it is legal.
```

## __trap__(<string>) reserves the print family

Moved from `compiler/emit_sections.vl` (the 17-line block at line 4044, as it stood at 2026-09-02).

```text
`__trap__("reason")` streams its message through the SAME
`__print_char__` / `__print_str_flush__` pair `print(<string>)` uses
(`wasmEmit.emitPrintStrExpr`), so it pulls in the 4-import print family
exactly as a `print(...)` call does. It had no arm here, and the whole
defect is that a MESSAGE-carrying trap was the only thing keeping a
program's import section alive: `__trap__("boom")` as the only statement
reserved nothing, the module got no import section at all, and the two
streaming calls landed on USER function indices — invalid wasm with
`vl check` rc 0 (measured on 367ab8d: a 351-byte module, "type mismatch:
expected (ref $type), found i32"). The sibling classifier in
`emit_classify.exprHasStrOp` had ALREADY been taught `__trap__(<string>)`
for the string-op scratch frame; this is the other half of that set.

Arity-gated on purpose: the BARE `__trap__()` lowers to `unreachable`
alone and streams nothing, so reserving for it would put four unused
imports and ~118 bytes into every bare-abort module that is already
correct. `> 1` argument is the emitter's own loud reject, unchanged.
```

## the spelling tree answers where the checker recorded no type

Moved from `compiler/emit_sections.vl` (the 14-line block at line 4113, as it stood at 2026-09-02).

```text
NO RECORDED TYPE — the parser's SPELLING TREE answers instead of the rendering.
`tsMentionsAnyName` walks the annotation the author actually wrote and compares each
leaf WHOLE. That is the difference that matters: the `strContains` test this replaces
scanned the rendered name for a SUBSTRING, so a field named `f64mode` or a type named
`Bf64` matched it. Every node reaching this branch has a spelling tree (20 corpus
files, 20 with a tree), so nothing is lost by preferring it.

HONEST ABOUT THE EVIDENCE: the corpus cannot tell these two readers apart. Neutering
this branch outright — answering nothing at all — also leaves every corpus file
byte-identical, because for all 20 the flags are already implied by another node in
the same program. So this rests on the whole-leaf/substring difference being correct,
not on a measured signal, and the substring's false positives were harmless anyway
(the scan over-approximates by design). It is a smaller claim than the ladder's
conversions and is recorded as one.
```

## the sid-keyed table reset, and why the string predecessors' sites were not enough

Moved from `compiler/emit_sections.vl` (the 18-line block at line 4276, as it stood at 2026-09-02).

```text
── the SID-KEYED TABLE reset — paired with `symbols.sidReset` at every site ────
The driver calls this beside every `sidReset()`, i.e. at every `P.nodes = []`.
It exists as ONE function so the pairing is one line at each of the seven sites
rather than six, and so the enumeration of sid-keyed tables has a single home.

**WHY IT IS NOT ENOUGH TO RESET THESE WHERE THEIR STRING PREDECESSORS WERE.**
`globalIndexBySid` is rebuilt by `collectFns`, `fnIndexBySid` by `buildFnMap`,
and both run INSIDE `emitProgram` — so between one program's end and the next
program's collect pass there is a window in which the rows are stale. That
window is old (it is the same one `resetLitAtoms`' header describes for
`startStmts`), and with STRING keys it was almost always harmless: program N+1
had to reuse a SPELLING to collide. A SID-keyed dense array collides on a
NUMBER, and the space is dense from 0, so the collision is close to certain.

Measured: without this call the wasm harness — one `WebAssembly.Instance` over
the whole corpus — failed 18 cases with `array element access out of bounds`
(a stale `globalIndexBySid` row indexing an emptied `globalStmts`), and every one
of those cases passed in isolation. That harness is this hazard's witness.
```

## the arena-index sidecar reset — a stale index TRAPS

Moved from `compiler/emit_sections.vl` (the 17-line block at line 4324, as it stood at 2026-09-02).

```text
── the ARENA-INDEX SIDECAR reset (method note 7) ───────────────────────────
Every column below holds indices into the checker's `T.tys`, which a fresh
program rebuilds from scratch. Each ALSO has its own reset inside the collect
pass that clears the NAME column it parallels — but those passes run in order
(collectU, collectS, collectA), so a query issued by an EARLIER pass would read
program N-1's rows. `slotCanonId` then dereferences one into program N's
re-minted arena and TRAPS ("array element access out of bounds"): a stale index
traps where a stale NAME is merely wrong text. Only reachable when one compiler
instance lowers several programs — the test/batch drivers.

So they are emptied HERE, ahead of every pass: the pre-collect window then reads
UNCOVERED and every consumer keeps its name path, exactly as it does for the
first program an instance ever compiles. Each name column's own reset stays where
it has always been — the pass named in brackets below. An uncovered union-member
row makes `unionMemberTysOf` false, so its consumer falls back to the member-NAME
scan; and a member SET id names a union ROW plus a mask over that row's members,
so `msPoolReset`'s generation bump is what retires an id outliving its program.
```

## pass table ordering edges

Moved from `compiler/emit_sections.vl` (the 56-line block at line 4418, as it stood at 2026-09-02).

```text
The ordered pass table — see the pass-manager block comment above
`passDoneHas` for the row grammar. WHY each ordering edge holds:
 · collectU first, so `collectS` knows whether the program's structs are
   union variants vs a single direct struct; then the struct shapes, the
   arena arrays, the function list (FuncDecls only), and the name→index
   map. Forward references and recursion resolve because every name is
   mapped before any body is emitted.
 · dispatchRewrite (UFCS `self`-methods, operator overloads, index traps)
   resolves `o.f(args)` / `a op b` / `o[k]` into the plain-call forms the
   lowerings AND the monomorphizer handle — before mono, so a rewritten
   call instantiates per receiver shape.
 · captureBoxRewrite boxes captured-MUTATION locals as shared length-1
   arrays — before mono, so instances inherit the rewrite.
 · synthRetAnnots pins a bound lambda's UNION return annotation from its
   annotated closure type — before mono (an instance is cloned with
   `nret = fnRet`, so the return must be pinned first or it emits a
   single-arm `$fnsig` result the call-site `ref.cast` rejects), and
   before the shape passes, so the union's box + variants intern for the
   return. THE `collectU` EDGE IS STILL REQUIRED, but no longer for the reason this line
   used to give: arm 1 read the union registry (`isUName`) and now asks the rung instead.
   The edge survives via `resolveShapeToNominal`, which the two whole-span-shape arms call
   and which reads `uVariants`. Stated so a later slice does not read arm 1's conversion as
   licence to drop the edge.
 · synthNulListRetAnns pins a NAMED un-annotated function's inferred
   NULLABLE-LIST return (`T[] | null`) to the annotation the user did not
   write — before mono for `synthRetAnnots`' reason exactly (an instance is
   cloned with `nret = fnRet`), and after `computeRetInference` because the
   kind it overrides is the one that pass stamps.
 · synthDstPinAnns pins an un-annotated object-literal local from the
   ANNOTATION of the destination it is delivered to — before mono, because a
   hand-written generic between the literal and its destination is cloned off
   the row the un-annotated literal resolved to, and the instance's signature
   is then already wrong when `collectLocals` gets its late second run.
 · monomorphize clones a concretely-annotated instance per distinct call
   shape — BEFORE signatures and types are collected.
 · the `#2` rows re-scan what monomorphization's late-minted annotations
   invalidated (see `runEmitPass`).
 · synthParamAnnots fills an un-annotated CALLBACK param's annotation from
   the checker's recorded type — after mono (an instance's pinned params
   are in place), before the `$fnsig` / map-filter collection that reads
   param valtypes.
 · collectMapFilterUse flips `fnValUsed` + forces the RESULT list's types;
   the `$fnsig` set (collectCloSigs) is collected after it and after
   collectFnValUse — both need the re-inferred return kinds.
 · scanPrintUse / checkFnParams read the FINAL arena; capCacheBuild
   snapshots capture lists only once the AST and `fnStmts` are final —
   after every mutating pass.
 · synthCaptureEmptyListAnns writes the `synthEmptyListAnn` / `synthNullableAnn`
   annotation onto a CAPTURED binding before `emitModule` — the env-struct half of
   `synthGlobalEmptyListAnns`' argument, and last because it needs both the
   interned rows (`collectA#2`) and the final capture lists (`capCacheBuild`).
 · capNarrowBuild banks the narrowing active at each closure's DECLARATION
   site and must precede computeRetInference, which types a closure whose
   return is a narrowed captured read; its `#2` row re-banks because
   monomorphization renumbers `fnStmts` and every record is keyed by
   position.
```

## the `$fnsig` key's `>` is not a type-name grammar

Moved from `compiler/emit_sections.vl` (the 20-line block at line 4681, as it stood at 2026-09-02).

```text
NOT A TYPE-NAME GRAMMAR (D-CLASSGRAM census note; DECLINED by D-MODGENLT, which
owned this file and re-derived the census structurally: this `>` is the only angle
bracket in `emit_sections.vl`, and `driver.vl`'s two `<` are the only ones there).
The `>` below is the `$fnsig` KEY's param/result SEPARATOR — a character in the ABI
token alphabet `repSigTokOfKind`/`repKindOfSigTok` own, on a string the compiler
MINTED token by token, not a rendered type. It is the same call #1223 declined twice
(`sigParamCoerceKind`, `sigKeyRetTokIx`), and routing it to the generic-application
`<`-scan would be a category error, not a dedup: that home scans for `<`, which this
alphabet never emits.

It is not routable to the ABI family's own last-`>` home (`emit_classify`'s
`sigKeyRetTokIx`) either, on THREE counts: that home is un-exported; its SPAN rule is
the LAST `>` where this walk wants the FIRST; and its contract returns the position
just PAST the marker, or -1 for a result-less key, where both passes below need the
marker's own index as their `key[0..gi)` param bound. The two readings are
indistinguishable on today's corpus (measured: 0/1508 files change when this scan is
switched to last-`>`) — which is exactly what makes the merge a SILENT behaviour
change rather than a safe one, since nothing would catch a future two-`>` key.

Locate the result marker `>` (no param/index token contains it).
```

## emitOneFuncType is called twice per exported function

Moved from `compiler/emit_sections.vl` (the 14-line block at line 4756, as it stood at 2026-09-02).

```text
Type section (id 1): all WasmGC types in ONE recursion group, followed by the
standalone print/(log) functypes — the rec-group count excludes those. The inline
comments below carry the per-type framing.
ONE function's `0x60` functype, written to the type payload: the param valtypes then
the result valtype. `withEnv` decides the hidden leading `structref` (see below); every
other byte is the same either way, which is the whole reason this is a function.

#1265 — IT IS CALLED TWICE PER EXPORTED FUNCTION, and the second call is what makes an
export wrapper possible: `emitTypeSection`'s main loop passes `fnValUsed` (the real,
env-leading signature the module calls internally), and the wrapper tail below passes
FALSE for the clean, env-free ABI signature the same function is PUBLISHED under. The
two must not drift — the result-type dispatch alone is a dozen branches over void /
closure / inferred / annotated returns, with per-kind slot resolution for structs, ref
lists, maps and variants — so they are one function, not a copy.
```

## buildStructSupers — representatives only, longest prefix

Moved from `compiler/emit_sections.vl` (the 13-line block at line 4941, as it stood at 2026-09-02).

```text
Build `sSuper` / `sSubbed`: every REPRESENTATIVE struct row takes as its declared
supertype the LONGEST proper-prefix representative row in the module, or -1.

REPRESENTATIVES ONLY, on both ends. A twin (`sTwin[i] < i`) shares an earlier row's heap
index and is SKIPPED by the type section, so it has no form of its own to carry a `sub`
and must not be named as a parent either — its representative is.

LONGEST, so the chain is transitively closed: a row's other required prefixes are
prefixes of its longest one, and that row takes them in turn.

PATTERN 4 — A KEY THAT NEED NOT SEE THE PAIR. Both ends of every edge derive from the
rows' own canonical field lists; nothing consults a heap INDEX, so this runs before or
after any other mint without changing its answer.
```

## the string header — three immutable fields plus a mutable memo

Moved from `compiler/emit_sections.vl` (the 23-line block at line 5151, as it stood at 2026-09-02).

```text
THE STRING HEADER ($sTypeIdx) — Stage 2b, plus Stage 3's `$hash`. A `string` VALUE is
this struct, a VIEW over the backing above:
`{ backing: (ref $sBackIdx), start: i32, len: i32, hash: i32 }`. Field indices are
fixed by this order: backing=0, start=1, len=2, hash=3.

THE FIRST THREE FIELDS ARE IMMUTABLE, which is the representation-level statement of
§Mutability — strings are immutable, so a view can alias its parent's backing with no
invalidation risk and `slice` needs no defensive copy.

`$hash` IS MUTABLE, AND THAT DOES NOT WEAKEN ANY OF THAT. It is a MEMO, not state:
the cached `__str_hash__` of the view's bytes, which is a PURE FUNCTION of fields
that can never change. `0` means "not computed yet"; the only write anyone ever makes
stores exactly the value a fresh walk would have returned, so no observable value can
differ before and after it, and two readers racing on it would write the same bits.
This is `java.lang.String.hash` exactly — the one mutable field in an immutable
object — and the §Header/§Bytes aliasing arguments are untouched by it: a slice
aliasing its parent's BACKING still sees bytes nobody can write, and a `$hash` write
on the parent is invisible to the child (each header memoises its OWN range, so a
slice's hash rightly differs from its parent's).

The 4th field is FREE in memory: `{ref,i32,i32}` and `{ref,i32,i32,i32}` are the same
size under all three collectors — the field lands in padding the third already forced
(`string-rep-measurements.md` §1.2/§1.3 Table B, re-measured for this stage).
```

## the tail functypes, in emit order

Moved from `compiler/emit_sections.vl` (the 18-line block at line 5501, as it stood at 2026-09-02).

```text
── the TAIL functypes, in emit order ───────────────────────────────────────
Everything from here down is APPENDED after the user functypes, each group after
the last, so no earlier functype index ever shifts and the Phase-G assert stays
untouched. Each is a `0x60` func rectype; the indices run:
  start fn `()->()`     `typeOffset + n`         (only when hasStart)
  print `(i32)->()`     +1   shared by __print_i32__ / __print_bool__ / _char__
  print `()->()`        +1   __print_str_flush__
  `(i64)->()` then `(f64)->()` then `(f32)->()`  one per WIDE scalar the program
                             prints, in that order (Slices 1 / 3 / 5)
  `(i32,i32)->()`       `typeOffset + n + hasStart + nPrintTypes`  the __log__ decoder
  the helper functypes  + memFn + <helper order>  (see `emitFunctionSection`)

The PRINT functypes are STANDALONE rectypes, outside the rec group whose count was
written above: a strict-GC host (wasmtime) refuses to match a rec-group-member
functype — which carries nominal rec-group identity — against a host-provided
function, so `__print_i32__` & co. would fail to instantiate. A HELPER functype may
still reference an earlier rec-group type (`$aTypeIdx` / `$mkArrIdx`): a later
rectype referencing an earlier type index is always valid.
```

## the filesystem functypes are derived from the slot tables

Moved from `compiler/emit_sections.vl` (the 26-line block at line 5551, as it stood at 2026-09-02).

```text
── the filesystem functypes ────────────────────────────────────────────────
One `0x60` rectype per USED fs slot, in slot order, appended after the print family
so no earlier functype index moves. STANDALONE, outside the rec group, for exactly
the reason stated above for the print family: wasmtime will not match a
rec-group-member functype against a host-provided function.

These are the FIRST imports whose signature names a rec-group HEAP type — the `u8[]`
wrapper `$bl8TypeIdx`. That direction is fine and is the asymmetry worth naming: a
later rectype may REFERENCE an earlier type index freely; what wasmtime refuses is
for the functype ITSELF to carry rec-group identity. So `(ref $bl8) -> (ref $bl8)`
as a standalone rectype instantiates, while the same shape inside the rec group
would not.

The wrapper ref is NON-NULL (`0x64`), matching `fbValtype`'s `"u8list"` arm — that is
what a `u8[]` param/result is everywhere else in the module, so a call site needs no
conversion in either direction. It also makes the error contract structural: a
failing call cannot answer null because the type forbids it, so it answers an EMPTY
`u8[]` and `__fs_errno__()` carries the reason.
DERIVED FROM THE SLOT TABLES, not re-spelled here. An earlier draft of this loop
hardcoded the shapes as slot NUMBERS (`if fsty == 1 { two u8[] params }`), which made
this a fourth place a signature lives — beside the checker's `declare`, the call
lowering's operand spine and the host's registration — and the one place a new
syscall would be forgotten, because nothing here would fail if it were. Reading
`fsIntrinsicArity` for the param count and `fsArgIsU8List` for each position's type
means the functype is derived from the SAME tables the call site pushes operands
from, so a declared type and the stack shape offered to it cannot disagree.
```

## #1265 — the export entries that need an ABI wrapper

Moved from `compiler/emit_sections.vl` (the 20-line block at line 6127, as it stood at 2026-09-02).

```text
#1265 — THE EXPORT ENTRIES THAT NEED AN ABI WRAPPER, parallel to `exportPublicNames`,
and EMPTY unless the module uses a function value.

When `fnValUsed`, every function in the module carries a hidden leading `structref env`
param (`envSlotShift` — a whole-module decision, so it applies to functions that are
never taken as values and to modules whose only function value is an unrelated lambda
or a `.map` callback). That param is an INTERNAL calling convention, but the export
section published the target function DIRECTLY, so it leaked into the module's ABI:
`export function f(a: i32): i32` in a file that also writes `const g = f` — or merely
`xs.map(...)` anywhere — published `f` as `(structref, i32) -> i32`. An importer calling
`f(1)` gets a boundary TypeError ("type incompatibility when transforming from/to JS");
one that knows to pass `(null, 1)` gets the right answer. Measured, both.

So each export entry gets a thin forwarding wrapper carrying the CLEAN signature, and
the export names the wrapper. Gated on `fnValUsed` because a module without function
values has no env param to hide, and must stay byte-identical.

Per ENTRY rather than per slot: two public names may alias one function
(`export { id, id as identity }`), and one wrapper each is a few bytes against having to
dedup slots that the parallel-array invariant above would then lose.
```

## P0.2 — exporting the linear memory

Moved from `compiler/emit_sections.vl` (the 17-line block at line 6193, as it stood at 2026-09-02).

```text
P0.2 — EXPORT THE LINEAR MEMORY (`buffer-design.md` §C5, ruling O4(i)).

The memory is exported under the universal name `memory`, automatically, and
gated on the memory EXISTING at all: `memUsed` is the same flag that decides
whether section 5 is emitted, so a program that never touches linear memory is
byte-identical to before — no new section, no new entry, no new name.

Why automatic rather than a `--export-memory` flag: an unused memory is not
emitted, so there is nothing to opt out OF, and a flag here would be the first
`vl build` option that changes the emitted ABI. Why `memory`: it is what a host
reaches for (`instance.exports.memory.buffer`) and the convention every wasm
toolchain follows.

The collision is real and is rejected LOUDLY. Wasm export names must be unique,
so a user `export function memory()` in a memory-using program would otherwise
build an invalid module. It is a rare and mechanically fixable reject (rename the
function), which is the trade O4(i) makes.
```

## paramScalarName / paramScalarIs — the arena is primary

Moved from `compiler/emit_sections.vl` (the 16-line block at line 6309, as it stood at 2026-09-02).

```text
The scalar name of the param annotation at `tyNodeIx`, taken from the ARENA where the
checker recorded a `TyPrim` and from the spelling only where it did not.

The arena is primary and the spelling is the documented remainder, not a second opinion:
`nodeTyPrimName` answers "" both for "not a prim" and for "no recorded type", and the
second case is real here — a param annotation inside a generic ORIGINAL has no recorded
arena type at all (measured: 13 of 391 annotation nodes, 11 of them naming a type
PARAMETER). Those nodes keep the spelling until the checker records them.

Numeric literal unions do NOT arrive here: the rung above accepts them from the arena
first, which is the whole reason these five comparisons could move off `ty.tyName`.
The DECISION form of `paramScalarName`. Same three rungs, but the arena rung compares
`PrimName` ATOMS (`tyPrimNameOf` hands back the atom; `nodeTyPrimName` declares `string`
and so WIDENS it — B260's shape, five times per parameter here). Only the spelling
fallback, which is 13 of 391 param nodes and every one a type PARAMETER the checker never
recorded, still compares text.
```
