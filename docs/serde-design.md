# VL serialization design — a survey, three plans, and where snapshot actually belongs

> Status: ~~**SURVEY + PROPOSAL — nothing here is decided or built.**~~ ~~**SURVEY + PROPOSAL,
> with STAGE 0 BUILT and FIVE OF SEVEN OPEN QUESTIONS ANSWERED (2026-09-01).**~~
> **SURVEY + PROPOSAL, with STAGE 0 BUILT, TWO RULING ROUNDS DONE, and SEVEN OF ELEVEN OPEN
> QUESTIONS ANSWERED (2026-09-01).** Stage 0's
> prerequisites shipped (`std:fmt`'s f64 arm + `parseF64`, the lexer's scientific notation,
> `std:base64`) and colored `print` Stage C0 shipped; the owner ruled OQ-1 (no builtin),
> OQ-5 (both forms, resolved as one per format), ~~OQ-6 (refuse newtypes, deferred)~~
> **OQ-6 (REVERSED the same day — newtypes accepted transparently, decision F)** and OQ-7
> (untagged JSON, since narrowed by decision C), and gave the shaping arguments for
> OQ-2/3/4. The critique round added and ruled OQ-8 (unknown fields), OQ-9 (`i64` on the
> wire) and OQ-10 (VLB shape fingerprint), and opened OQ-11 (reference identity as a keyable
> concept) as a LANGUAGE question — since RULED YES (identity ruling 2026-09-01: the seen-set
> is an `IdentitySet<T>`, `docs/identity-design.md` §0). Stages 1–3 — `std:json`, the
> derive, the JSON rendering — are still unbuilt; **stage 1 is unblocked and scheduled**. Written 2026-08-31 at
> the owner's ask: *"vl does not have a native serialization/deserialization format. This
> is fine, as I think it requires a think. JSON is a bit annoying in that it does not
> distinguish arrays from sets. It obviously also doesn't match different numeric types,
> chars vs strings vs enums, etc. What do other languages do? Is there a standard? …
> interesting in terms of IO with the host in the future, message passing, or 'pausing' an
> execution environment and restoring (but could always do that at the byte level I
> guess)."*
>
> Every claim about today's compiler marked **(RUN)** was executed against the current
> seed; the probe programs are inlined in the appendix so re-running them is
> a paste, not a paraphrase. Claims sourced from a design doc cite the doc. Claims about
> external formats are from spec knowledge, written without web access — where a detail is
> uncertain it says so rather than inventing.
>
> **REFRESHED 2026-09-01.** Every `(RUN)` claim was re-executed against that day's seed,
> because the day moved four of them and a citation is a measurement with a date on it
> (CLAUDE.md). A claim carrying `(RUN 2026-09-01)` was re-measured and holds; a claim that
> moved is struck through with a dated replacement beside it. **Four facts moved**: fact 1
> (restated against the now-RULED constraints direction), fact 4 (width subtyping RUNS at a
> sorted-name prefix), fact 5 (three mechanisms, one of them a COMPILER TRAP), and
> fact 6 (wholesale — VL renders and parses floats now, in VL). Everything in
> §Survey is unchanged: nothing measured today bears on what CBOR or borsh do.
>
> **Probes must pass `VL_STD=$PWD/std`.** The host resolves `std:` from the *binary's*
> checkout and every agent worktree symlinks `scripts/vl-host/target` to the main repo's, so
> a probe run without it measures the wrong `std` while the Deno gates stay honest
> (CLAUDE.md). Every measurement in this refresh was taken with it set.
>
> **CRITIQUED 2026-09-01 by a three-lens panel, and fact 5 is refuted.** Three independent
> critiques — language consistency (`docs/internals/serde-critique-consistency.md`),
> cross-language comparison (`serde-critique-crosslang.md`), performance
> (`serde-critique-perf.md`) — and a coordinator's synthesis with every load-bearing claim
> re-run (`serde-critique-synthesis.md`). The architecture survives all three lenses; what
> fails is narrower: **the JSON value tree RUNS today** (six arms including `null`, as of
> #2244 — §Approach 1's premise that the self-reference forces a pull lexer is false and the
> section wants re-deriving with a POSITION axis); the OQ list is missing the
> **unknown-field policy**, which decides OQ-7's ambiguity predicate; the cycle seen-set is
> O(n²) and unpriced; and two clause-2 refusals (`u8[]` struct field — D1008; ref-keyed
> `Map`) sit on the plan's own critical path. ~~**Seven decisions (A–G) await the owner** in
> the synthesis; nothing below has been rewritten to anticipate them.~~ **RULED 2026-09-01 —
> see the next paragraph. The rulings ARE applied below.**
>
> **RULED 2026-09-01 — all seven (A–G), every recommendation adopted as stated.** The owner
> read the synthesis's §"Decisions that are the owner's" and answered: *"Recommendations all
> sound reasonable to me."* One clause each, with where each landed in this document:
> **(A)** reject unknown fields, exact case-sensitive field matching, reject duplicate keys,
> always emit `"f": null` for a `T | null` field — new **OQ-8**;
> **(B)** `i64` is ALWAYS a JSON number, never a decimal string — new **OQ-9**, and the old
> rule is struck where this document stated it;
> **(C)** untagged arms must be distinguishable by FIRST TOKEN or by REQUIRED KEY SET —
> OQ-7, amended;
> **(D)** build the static acyclic-shape predicate, keep the depth cap as the floor, add the
> timing probe; reference-identity keys are a SEPARATE language question (new
> **OQ-11**, since RULED yes) and `serializeUnchecked` stays deferred — §Cycles;
> **(E)** the VLB header carries an 8-byte shape fingerprint over wire-relevant structure —
> new **OQ-10**;
> **(F)** OQ-6 is REVERSED — newtypes are accepted transparently, erased to their base at
> emit, brand kept by the checker;
> **(G)** stage 1 is a real `Json` VALUE TREE plus a parser and a renderer, not a
> token-at-a-time pull lexer with hand codecs — §Recommendation.
>
> **Nothing in this ruling pass was re-measured.** Every fact it leans on is cited to the
> synthesis's §Verification (re-run against master `c0484fa9`, and the `null`-arm lines again
> on `969df4df`/#2244), so no claim below acquired a new `(RUN)` date from this edit.
> §Approach 1 and the appendix are being re-derived separately with a POSITION axis (decision
> G's second half) and are not touched here.

---

## The question, split into its three real questions

"A serialization format" is three different asks wearing one name, and they pull in
different directions:

- **(a) Host IO / config / interop** — human-readable pressure, hand-editable files,
  talking to programs that are not VL. Wants text, tolerance, evolution.
- **(b) Message passing between VL instances** — the concurrency model already ruled
  (`docs/internals/concurrency-design.md` §1) puts CPU parallelism on *separate instances
  + message passing*, because **WasmGC references cannot cross threads**. So every
  cross-instance message is bytes or linear memory by construction; serialization is on
  that feature's critical path, not adjacent to it. Wants speed, type fidelity,
  determinism; evolution pressure is low when both ends are the same build.
- **(c) Pausing an execution environment and restoring it** — wants completeness. §Snapshot
  argues this is not a serialization-format question at all for VL, and that "could always
  do that at the byte level" is mostly *false* for a WasmGC language — the one part of VL
  that is byte-snapshottable is the linear-memory `Buffer` tier, and webcraft already
  exploits exactly that, deliberately.

The owner's JSON complaints are correct and measurable against VL's own inventory, so the
survey below grades every format against that inventory rather than in the abstract.

---

## Ground truth: VL's inventory, as measured

What a format must carry. Primitives: `i32`, `i64`, `f32`, `f64`, `boolean`, `string`,
`u8` (storage-only — an element read comes back as an `i32` in 0–255, and a computed
store truncates to the low 8 bits: storing 300 reads back 44 **(RUN 2026-09-01)**; an
out-of-range *literal* is a compile error **(RUN 2026-09-01)**), plus `void`, `null`,
`never`. There
is **no char type** — `'a'` is an `i32` code point (97, comparable with a byte read of
`"a"[0]` **(RUN 2026-09-01)**) — and enums are **literal unions** (`"file" | "dir"`).
Collections: `T[]` (growable, insertion-ordered), `u8[]` (packed bytes), maps
`{[string]: V}` and `{[i32]: V}` (both work; `.keys()` yields **insertion order**
**(RUN 2026-09-01)**), and `Set` — which *exists today*, spelled `{[T]: boolean}` +
`Set()`, with `.add/.has/.delete/.length/.values()` and fixture-pinned insertion order
(`tests/cases/sets/basics.vl`). Structs are **structural**; unions include literal unions,
null niches, and variants, with three runtime encodings and a global tag registry keyed on
the field-name shape (`docs/guide/unions.md`). `u8[] | null` **now has a niche and runs**
(D979, `scripts/capability-probes/u8-list-nullable-return.vl` grades `RUNS`
**(RUN 2026-09-01)**) — so the `T | null` error shape is available at every element type a
codec cares about, including packed bytes. One caveat measured the same day and worth
carrying into stage 1: the *filed* spelling runs, and a nearby one — the same annotated
return delivering an ARRAY LITERAL (`return [1, 2, 3]`) — is `vl check` rc 0 followed by
invalid wasm (`expected (ref null $type), found (ref $type)`) **(RUN 2026-09-01)**. Not
this doc's defect to fix, but a std codec should not discover it by shipping it.

Facts that constrain the design, each verified this session:

1. **There is no shape-generic code in userland, and the ruled constraints direction does
   not create one.** `function getR<T>(x: T): f64 { return x.r }` is still a type error
   **(RUN 2026-09-01)**. The *old* sentence here — "VL has no bounded polymorphism" — is
   now the wrong argument, and the conclusion has to be re-derived rather than inherited:
   ~~no bounded polymorphism~~ **bounds are RULED** (`docs/constraints-design.md`,
   owner questions 2026-09-01), and expression-semantics method bounds are coming. That
   doc's own measurement is that the implicit operator constraint already SHIPS —
   `function dbl<T>(x: T): T { x + x }` runs at `i32`/`f64`/`string` and refuses `boolean`
   at the call site — so "a generic body may demand something of `T`" is not hypothetical.

   **The conclusion survives, for a different reason.** A bound grants **calls** on a
   generic receiver; it does not grant **field enumeration**. `{toString(self): string}`
   as a bound tells a body it may *call* `toString`; nothing in that family lets a body ask
   `T` for its field NAMES, iterate them, or construct a `T` from parts — and enumeration is
   exactly what a codec needs. (Constraints-design's own survey makes the point: the
   relatives are C++20 concepts and Go interfaces, neither of which is a reflection
   mechanism; Rust needs `#[derive]` *beside* its traits for precisely this reason, and Swift
   needs compiler synthesis beside `Codable`.) So a codec that works "for any struct" is
   still not expressible in `std/*.vl` even after bounds land. Either every type gets
   hand-written codec code, or the **compiler** walks the shape. There is no third road —
   and a bound is what makes the derive's *output* pleasant to call, not a substitute for it.
2. **The compiler already walks shapes and generates per-shape machinery.** Union boxing
   (`coerceUnion`), struct-union `==`, shared-field dispatch, the per-shape variant-tag
   registry, per-key-type map hashing — all are emitter-generated per monomorphized shape.
   A derive is one more resident of that neighborhood, not a new kind of thing. (And the
   neighborhood's known defect shape — a per-rep ladder with a missing arm,
   `docs/internals/per-rep-ladder-audit.md` — is the honest risk line for it.)
3. **Structural struct spellings share a canonical field order already.** The emitter
   sorts fields by name per shape (`docs/guide/unions.md` — shared-field reads exist
   *because* "fields are sorted by name per shape"). So a positional encoding keyed on
   sorted-name order is spelling-independent: two aliases of one shape agree on it by
   construction. Structural typing does **not** force field-name-keyed encoding — it
   actually makes positional *safer* than in nominal languages, where declaration order
   varies per alias. **Independently confirmed 2026-09-01 by fact 4's move**: width
   subtyping succeeds or fails on the *sorted* prefix and is unmoved by reversing the
   declaration order, which is the sorted canon being load-bearing at the wasm type level
   rather than only in a doc. Union members are order-insensitive the same way: `type A =
   i32 | string` and `type B = string | i32` are freely interchangeable at every position
   **(RUN 2026-09-01)** — which is the measured reason OQ-2 cannot use declaration order.
4. ~~**Distinct field lists are unrelated wasm types.** A `{code, msg}` value flowing into a
   `{msg}` parameter is check-valid and codegen-rejected …~~ **MOVED 2026-09-01 — width
   subtyping RUNS, at exactly one shape, and the shape is fact 3's sorted order.**
   `{code: i32, msg: string}` → `{code: i32}` runs and prints `1`; the SAME pair with the
   retained field changed to `msg` still refuses at check with the old sentence, and
   reversing the source's *declaration* order (`{msg, code}` → `{code}`) still runs — all
   three **(RUN 2026-09-01)**. So the rule is not declaration order and not "unrelated types":
   **a wide value flows into a narrow one iff the narrow field list is a PREFIX of the wide
   one's SORTED field order**, which is WasmGC struct subtyping showing through, and fact 3's
   sorted-name canon showing up a second time as the thing that decides it.
   `scripts/capability-probes/width-subtyping.vl` is that probe and now grades `RUNS`.

   For a decoder the practical rule is little changed and is now *narrower than it looks*:
   construct at the destination shape, **unless** the destination is a sorted prefix of what
   you hold. Nothing in the derive should lean on the exception — a positional VLB decoder
   builds at the destination anyway — but a hand codec (Approach 1) may, and the
   *diagnostics* budget shrinks accordingly.
5. ~~**The idiomatic JSON value tree is not emittable today.**~~ **STILL not emittable
   2026-09-01 — the doc's own probes reproduce verbatim — but the gate moved, and it is
   THREE mechanisms, not one. One of them is a COMPILER TRAP on a `vl check`-clean program,
   which the original phrasing hid completely.** The original probes are unchanged:
   `type Json = null | boolean | f64 | string | Json[] | {[string]: Json}` declares and
   accepts `const s: Json = "hello"` (runs); `is string` over it still dies at emit with
   *"no interned arm representation (deferred value-union composition)"*; `is Json[]` is
   still refused at CHECK as *"not a variant"*, and still is when routed through a named
   alias `type JsonArr = Json[]` **(RUN 2026-09-01)**.

   **The factorial grid.** 28 cells, varying `null` presence × array arm (none / concrete
   `i32[]` / self-referential `T[]`) × map arm (none / concrete `{[string]: i32}` /
   self-referential `{[string]: T}`) × test (`is string` / `is T[]` / `is {[string]: T}`),
   base arm `string` throughout. Outcome classes kept distinct and never merged into
   "fails". **RUNS 12 · check-refuse 6 · emit-refuse 5 · COMPILER TRAP 7.**
   **CORRECTED SAME DAY (D985): the with-`null` `is string` cells graded emit-refuse
   above are actually CHECK-CLEAN INVALID WASM** — `vl check` prints "Checked 1 file, no
   errors" and the build fails at `wasm[0]::function[4]` — measured twice by the
   compile-goal session, once against an origin/master-built compiler, both container
   kinds. This grid's harness classified by STDERR SHAPE, which cannot tell "emit
   refused" from "emit succeeded and produced garbage": **run the module** before
   trusting an outcome class. Grade any fix on `is string` (the silent face), not only
   `is <arm>` (the loud one).

   | null | array arm | map arm | `is string` | `is <the self arm>` |
   | --- | --- | --- | --- | --- |
   | — | — | — | **RUNS** | n/a |
   | — | `i32[]` | — | **RUNS** | n/a |
   | — | — | `{[string]: i32}` | **RUNS** | n/a |
   | — | `T[]` | — | **RUNS** | **RUNS** |
   | — | `T[]` | `{[string]: i32}` | **RUNS** | **RUNS** |
   | — | — | `{[string]: T}` | **compiler trap** | **compiler trap** |
   | — | `i32[]` | `{[string]: T}` | **compiler trap** | **compiler trap** |
   | — | `T[]` | `{[string]: T}` | **compiler trap** | **compiler trap** (both tests) |
   | `null` | — / `i32[]` | — / `{[string]: i32}` | **RUNS** (4 cells) | n/a |
   | `null` | `T[]` | any | emit-refuse | check-refuse |
   | `null` | any | `{[string]: T}` | emit-refuse | check-refuse |

   **THE STANDING ROOT (2026-09-01, late — #2221/#2223, both merged, family still OPEN
   on D984).** The real skip was found with a discriminating probe (`unNames` holds `[J]`
   for `boolean | string | J[]` and `[]` for `null | string | J[]`, narrowing correct in
   BOTH): a `null` arm normalises into the nullable niche, `isTransparentAlias` then
   calls the whole declaration a transparent alias, and the union is never REGISTERED —
   D982's "not a variant" and D985's silent unboxing loss are both downstream of a
   declaration that was skipped, not of any use-site logic. #2221 gated the predicate —
   and SHIPPED A `runs → not-runs`: the un-gating removed a MASK over an unrelated
   unbounded recursion (registering a self-referential MAP arm walks
   `registerInlineUnion → registerMapValUnion → registerInlineUnion` by name, no depth
   bound), so the two DECLARATIONS that had merely worked — this doc's own `Json`
   spelling among them — began trapping the compiler. Caught after merge (eleven gates
   stayed green: no fixture had ever used the spelling, because until then it was an
   uninteresting program that worked), fixed in #2223: array arms stay un-transparent
   (the D982/D985 soundness half holds), MAP arms stay transparent until D984's
   recursion is bounded, and **D984 is the blocking item for the whole family, not a
   sibling of it** — it was the thing the mask was over. Both recovered declarations
   are refutation pins in `tests/cases/types/` so re-lifting the map clause trips a
   fixture instead of shipping. The 28-cell grid gets re-run when the family closes.

   Two instrument rules this family earned, for the appendix and for anyone probing it:
   (1) **"why doesn't X know it's a union" — ask `unNames` FIRST**: a use site losing a
   property can mean the DECLARATION was skipped, not that the use-site logic is wrong;
   the narrowing/unboxing audit that preceded this find was time spent downstream of a
   registration that never happened. (2) **When you change a predicate that gates
   behaviour, test the programs taking the OTHER branch** — a two-column A/B over the
   predicate's own domain, graded against a compiler built from the commit BEFORE the
   change, never against memory of what used to work. #2221 tested everything it meant
   to fix and nothing the predicate had been protecting.

   **The "one mechanism, empty variant table" explanation was filed and RETRACTED the
   same day (#2213)** — the table is empty for the WORKING spelling too, by design
   (interning is gated on `isStructAtom`, so `string`/`boolean`/`J[]` never intern in
   ANY spelling), and the probe that suggested otherwise was taken under an
   experimental patch while its "control" was a stale overwritten witness file — two
   instrument traps this repo has names for, self-reported. **What is MEASURED and
   stands: three separate walls, one silent** — D985 check-clean invalid wasm at both
   container kinds, D982's loud check refusal, D984's compiler trap. The check-side
   cause of the loud one is understood (`assignableGo` bails on a `TyNullable` source
   above the union arm) with a one-line fix deliberately NOT shipped — it would convert
   a loud refusal into a silent-adjacent emit refusal, the order CLAUDE.md forbids. The
   EMIT-side cause is open, with one negative fact to steer the next probe: the
   "`is` names a type that is not a union variant" refusal path is NOT reached for any
   of the three spellings on master — the non-struct-arm lowering goes somewhere else.
   D984 has opposite null polarity to D982 (a `null` arm masks the trap), so neither
   witness can see the other.

   **Mechanism 1 — the `null` + self-referential-CONTAINER refusal (filed D982).** With a
   `null` arm, a self-referential arm makes `is string` an emit refusal and `is <that arm>`
   a check refusal (`'T[]' is not a variant of string | T[] | null`). The grid's contribution
   is that **this is not array-specific**: the map arm produces the identical pattern, in the
   same cells, with the array arm absent. D982's scope is *self-referential container arm +
   null*, and its fix should be graded on both container kinds.

   **Mechanism 2 — a COMPILER TRAP, and it is a different defect in every axis.** A union
   with a **directly self-referential MAP arm and NO `null` arm** makes the compiler recurse
   unboundedly at emit: `vl check` returns 0, `vl run` and `vl build` both die with
   `wasm trap: call stack exhausted` and a backtrace of three compiler frames repeating
   (`1823 / 1799 / 2400`). Per CLAUDE.md a new compiler trap is veto-class, so this is worth
   a row of its own. Its ablation, one ingredient per line **(RUN 2026-09-01)**:

   | program | outcome | reads |
   | --- | --- | --- |
   | `type T = string \| {[string]: T}` + `print("ok")` | **compiler trap** | the DECLARATION alone is enough — no `is`, no binding |
   | `type T = string \| T[]` + a binding | **RUNS** | the ARRAY arm does not trap; the map arm is the ingredient |
   | `type T = {[string]: T}` (recursive map, NOT a union) | clean emit refusal (`unsupported map value type …`) | the UNION is required |
   | `type T = string \| null \| {[string]: T}` | **RUNS** | **a `null` arm MASKS the trap** |
   | `type T = string \| {[i32]: T}` | **compiler trap** | the key type is not the ingredient |
   | `type A = string \| {[string]: B}` / `type B = string \| A[]` | **RUNS** | MUTUAL recursion does not trap — direct self-reference is required |

   Four ingredients, all necessary: a union, a directly self-referential map arm, no `null`
   arm, and nothing else. The masking line is why this document never hit it: the `Json`
   type it has probed since 2026-08-31 carries `null`, so it lands in mechanism 1 and refuses
   loudly. Delete the `null` and the same shape kills the compiler.

   **Mechanism 3 — recursion routed through a struct arm** (`JArr = {items: Json[]}`) is a
   third message again, `only i32[] arrays and struct/union element arrays are supported`
   **(RUN 2026-09-01)** — so the nominal-tree workaround moves the refusal rather than
   removing it.

   **The controls that make self-reference the discriminating ingredient**, unchanged:
   `U[]` where `U = i32 | string` runs, including `is string` on an element; a struct arm in
   a non-recursive union behind a struct field runs; recursive *struct* types were and remain
   fine (`Tree` with `kids: Tree[]` **(RUN 2026-09-01)**); and a genuine reference CYCLE
   builds and traverses — see §Cycles, whose own filed prerequisite this closes.

   **What that does to Approach 1's shape.** Less than it looks, and it is worth saying so
   plainly rather than letting a narrowed refusal read as a green light. A `std:json` v1
   still cannot be value-tree-shaped, because the tree's defining feature IS the
   self-reference; the pull-lexer plan stands unchanged and is now measured end to end
   (§Approach 1's sketch round-trips today). What the grid changes is the *estimate and the
   risk shape*: the array half of the tree already works without `null`
   (`type R = string | R[]` runs, `is R[]` included), so the remaining work is two named
   defects at named sites rather than "the union rep layer" — but one of them is a compiler
   trap, so a `std:json` author experimenting with tree spellings can lose a build to it, and
   should keep a `null` arm in every recursive-map spelling until it closes.
6. ~~**VL cannot render or read a float.**~~ **WHOLESALE STALE — REWRITTEN 2026-09-01. VL
   renders and parses floats, in VL.** Every clause of the old fact moved on the same day:

   - **`toString` is not a builtin at all any more.** It is `std:fmt`'s export, reached by
     `import { toString } from "std:fmt"`; the ambient builtin is retired and its name
     transferred (owner ruling, `DECISIONS.md`; the measurement trail is `std/fmt.vl`'s
     header). An unimported `toString(5)` now refuses with a note naming the import line
     **(RUN 2026-09-01)**. ~~accepts only `i32 | boolean`~~ its domain is
     **`i32 | i64 | boolean | f64`** — a strict superset of what the builtin served.
   - **The shortest-round-trip renderer is IN VL.** `toString(0.1 + 0.2)` returns the string
     `0.30000000000000004` **(RUN 2026-09-01)** — the same characters `print` gives, because
     both claim ECMA-262 `Number::toString`, radix 10, which is a spec rather than a
     preference. Burger–Dybvig over exact big integers, table-free; ~25 µs a rendering.
   - **`parseF64(self: string): f64 | null` is its correctly-rounded inverse.** Clinger's
     fast path over an exact num/den fallback with ties-to-even, graded **205,844 of
     205,844** against `Number(s)` including adversarial midpoints. `parseF64("1e300")`
     answers `1e+300` **(RUN 2026-09-01)**. Range is not a parse failure: overflow answers
     ±Infinity, underflow ±0, and `null` means only "not a number in the grammar".
   - ~~the lexer cannot read `1e300` back~~ **the asymmetry is CLOSED (#2173).** `1e300`,
     `1.5e-7` and `2E+10` all lex, and print `1e+300` / `1.5e-7` / `20000000000`
     **(RUN 2026-09-01)**. VL's own float rendering is re-parseable as VL source.
   - ~~`-0.0` prints as `0` — the sign of zero does not survive today's print path~~
     **it is not a print-path defect, it is ECMA-262's own rule**, and `toString(-0.0)` is
     `"0"` too **(RUN 2026-09-01)**. −0 does not survive a TEXT round trip in either
     direction, in VL or in JS. That is the standing reason VLB encodes float BITS.
   - **`NaN` and `Infinity` remain reachable and print as those words (RUN 2026-09-01)** —
     unchanged, and still un-spellable in JSON.
   - **A filed cross-host divergence, pinned by bit pattern.** The Rust host's `print` is
     *not* exactly JS `String(v)`: it re-formats digits from Rust's `{:e}`, which breaks an
     exact decimal tie AWAY from even where the spec breaks it TO even — 14 of 50,000
     pseudo-random doubles, smallest witness bits `4835952189745799117` (exactly
     2023347301156851.25, printed `…851.2` by the spec/V8/`std:fmt` and `…851.3` by the Rust
     host). `std:fmt` follows the spec; `tests/vl_std_float_text_test.ts` pins the
     divergence so a host fix flips it loudly. **A text format inherits this bug until the
     host is fixed; a bits format never had it** — a second argument for VLB's float rule.
   - **`f32` renders as its widened f64** — `toString(x)` and `x.toString()` over an
     `f32 = 0.1` both give `0.10000000149011612` **(RUN 2026-09-01)**; the emit hole
     `std/fmt.vl`'s header records (`union atom has no value box`) has since closed
     (`scripts/capability-probes/f32-into-f64-union-arm.vl` grades `RUNS`). A true
     shortest-for-f32 rendering (`0.1`) is still owed and is a different computation — see
     stage 0's remainder.
   - **String assembly is no longer the pain it was.** `"v=" + 0.1` is still
     `operator '+' is not defined for string and f64` **(RUN 2026-09-01)**, but **template
     literals exist** and their holes bind absolutely to the canonical stringifier:
     `"f64=\{x} i32=\{n} i64=\{i} bool=\{b}"` renders all four widths with no import and
     no concat **(RUN 2026-09-01)**. A PLAIN string is enough — `\{…}` is one hole syntax
     across both quoted forms since 2026-09-01, and backticks add multiline and nothing
     else, so the JSON spellings below need no delimiter change and their bare braces stay
     data. Anywhere below that reasons about hand-built strings
     being quadratic or awkward, interpolation is now the spelling — and the absolute binding
     (`DECISIONS.md`, "A template literal's stringifier is bound ABSOLUTELY") is the precedent
     OQ-1 leans on.
7. **i64 is a real 64-bit integer end to end.** `9007199254740993` (2^53 + 1) prints
   exactly **(RUN 2026-09-01)** — so any format that funnels numbers through an f64, JSON
   first among them, is lossy for VL by measurement, not by hypothesis.
8. **The linear tier is the other half of the estate.** `std:buffer` (Buf, views,
   mark/release), exported memory, `flat` types with checker-folded layouts, and the
   **ruled** sub-byte widths (`u1`…`u7`, `u8/i8/u16/i16` — ROADMAP: *"a wire format spells
   itself"*, with "a real decoder" named as the forcing customer for generated accessors).
   And webcraft's requirement doc places every byte of authoritative sim state in linear
   memory *specifically* "so that snapshot/rollback/hash are memcpy-class"
   (`docs/webcraft-requirements.md` P0.1). The repo has already voted once on where
   byte-level snapshot lives. §Flat types below is this fact at length, because it is the
   half a reader skims.

---

## Flat types: what the linear lane already gives, and where the two lanes divide

*Added 2026-09-01 at the owner's ask: "was there consideration for flat types?" The answer
is yes, twice — fact 8 and Approach 3 — but split across the document in a way that read as
an aside. It is not an aside; it is one of the two lanes, and the older one.*

**What `flat` already gives, today, with no serde work at all.** A `flat type` declares a
layout rather than a shape: declared field order **is** the byte layout, offsets are the
running sum of declared widths, and the compiler inserts nothing (`ROADMAP.md` P1.2,
`docs/internals/flat-records-design.md`). The offsets are **checker-folded constants** —
`Packet.size`, `Packet.x` — so a `flat` declaration emits byte-identically to the same
declaration without it, and `T.size`/`T.<field>` fold for a type PARAMETER too, once per
monomorphized instance (#1329). Measured on today's seed **(RUN 2026-09-01)**:
`flat type Packet = { id: i32, kind: i32, x: f64, y: f64 }` gives `Packet.size` 24 and
`Packet.x` 8, and storing into `Buffer(Packet.size * 4)` at `i * Packet.size + Packet.y`
reads back exactly — the Approach 3 sketch below runs. So for a program that already holds
its state in bytes, "serialization" is `Buffer` + `memcpy`, and it is finished.

**What the ruled sub-byte widths add.** `flat` accepts only `i32`/`i64`/`f32`/`f64` and
nests today, "so a byte field costs four bytes and `flat` cannot express a C struct
containing a `uint8_t` — which is the job it exists for". The ruling (owner, 2026-08-22)
adds byte-multiple widths (`u8`/`i8`/`u16`/`i16`) and sub-byte ones (`u1`…`u7`), plus
`boolean` at one bit, so that — the ROADMAP's own sentence — **"a wire format spells
itself"**: `flat type Header = { ver: u1, ext: u1, kind: u6 }` is ONE byte and
self-documenting where today it is a `u8` plus a comment. The compiler folds the layout
(`Header.kind`, `Header.kind_shift`, `Header.kind_mask`); the USER writes the shift
(owner: *"100% accept shift/mask to read/write"*), so it needs no emitter change. Two rules
ride with it: a field may not straddle a byte boundary, and bits pack MSB-first, matching
how RFC-style specs number them. Generated accessors (`h.kind` doing the shift for you) are
deliberately NOT taken, with **"a real decoder"** named as the forcing customer that would
reopen them. A `std:json`/VLB program is not that customer — both are VL-native formats
whose layout the compiler already owns — so this doc does not ask for them.

**How the two lanes divide the estate.** They are not competing designs; they serve
disjoint constituencies and the split is already ruled elsewhere:

| | **GC tier — the derive (Approach 2)** | **linear tier — `flat` + `Buffer` (Approach 3)** |
| --- | --- | --- |
| what lives here | ordinary VL values: structs, arrays, maps, sets, unions, strings | authoritative sim state, foreign wire formats, anything hashed or rolled back |
| who decides layout | the compiler, per monomorphized shape (fact 3's sorted names) | **the author**, per declared field order |
| the serialization act | encode COPIES the value into bytes; decode MATERIALIZES a fresh value | there is none — the bytes already are the value |
| zero-copy | never promised, ever (a WasmGC value cannot alias bytes) | this IS zero-copy; views read in place |
| snapshot/rollback | application-level, `serialize<T>` over a root state type | memcpy-class, which is exactly why webcraft P0.1 put state here |
| foreign formats | no | yes — `flat` is VL's IDL for *other people's* layouts |
| evolution | schema-implicit; §Approach 2 prices it | whatever the foreign spec says |
| ergonomics | one call, no ceremony | explicit shifts, explicit offsets, explicit copies |

The dividing question is not performance, it is **who owns the layout**. If an external
document owns it (a PNG header, an IP packet, another engine's save file), the layout is an
input and `flat` is the tool — a derive cannot help, because the format is not derivable
from a VL type. If VL owns it (a message between two VL instances, a config file, a state
snapshot), the type IS the schema and the derive is the tool. Webcraft's P0.1 ruling is the
worked instance of the first case; the concurrency model's cross-instance messaging is the
worked instance of the second.

**The one bridge question, unresolved and presented as a choice.** *Does the derive ever
emit INTO a flat layout — a `toFlat<T>(v: T, buf: Buf, at: i32)` — or are the lanes
permanently separate?* The two positions, with costs, and no ruling here:

- **Position A: permanently separate.** `serialize<T>` produces `u8[]` and nothing else;
  a program that wants bytes in linear memory copies them there. *For:* one wire format
  (VLB) instead of two, so one set of fixtures, one canonical-order rule, one evolution
  story. The GC-tier walk never has to answer `flat`'s questions (alignment, straddling,
  bit order, no-implicit-padding), which are answered by a DIFFERENT rulebook — `flat` says
  declared order is layout, the derive says sorted order is layout, and a bridge would have
  to pick one and break the other's promise. *Against:* the copy is real. A program that
  builds a GC value and wants it in a `Buf` pays `u8[]` → `Buf` for nothing, and "keep it in
  the tier built for it" is advice that costs a rewrite when the value came from elsewhere.
- **Position B: one bridge function, `toFlat<T>`, restricted to the shapes `flat` already
  accepts.** *For:* the restriction makes it cheap and honest — for a scalar-only,
  fixed-size, non-nullable, non-container `T`, encode is a straight-line sequence of stores
  and the two rulebooks agree because there is nothing to disagree about (no strings, no
  variable-length anything, no maps). It is the smallest possible bridge and it is exactly
  the shape a "message header" wants. *Against:* the restricted domain is a cliff, not a
  gradient — add one `string` field and the answer changes from "a store sequence" to "not
  expressible", and a user cannot see the cliff from the call site. It also creates a second
  wire format with its own ordering rule (declared, not sorted), so OQ-2/OQ-5's answers stop
  being one answer. And per std-review discipline it is speculative until a consumer names
  it: nothing in the tree wants it today.

**A third framing worth recording, because it may dissolve the question.** If `flat` gains
generated accessors one day (deliberately deferred, forcing customer "a real decoder"), then
a `flat` record already reads and writes like a struct, and "emit into a flat layout" becomes
"assign to a flat record" — a language feature, not a serde feature. On that path the answer
to the bridge question is *neither* A nor B: the derive stays GC-only forever, and the
ergonomic gap closes from the `flat` side instead.

---

## Survey: the formats

**Is there a standard?** No — there is a settled *landscape*. Four stable niches
(human-readable schemaless: JSON; standards-track binary schemaless: CBOR; schema-first
interchange: protobuf; zero-copy: FlatBuffers/Cap'n Proto), plus per-language canonical
binary codecs (borsh, bincode) where determinism matters more than interop. The axis that
actually sorts them is **where the schema lives**: in the bytes (self-describing), in a
separate IDL file, or in the *program's own types*. VL's position — structural types,
monomorphization, no reflection — points hard at the third cell, which is the one JSON
and CBOR don't occupy and borsh does.

**JSON** (RFC 8259). One number type, in practice an f64: VL's `i64` is lossy above 2^53
(measured above), `i32` vs `f64` is not distinguishable on the wire (`1` decodes as
either), `f32` has no width of its own, and `NaN`/`Infinity` — reachable VL values
**(RUN 2026-09-01)** — have no spelling at all. No bytes type (`u8[]` needs base64 —
~~and VL has no base64 today~~ **`std:base64` shipped 2026-09-01**, so this is now a
policy choice rather than a missing piece), no set (the owner's complaint — and VL
*has* sets), object key order
carries no meaning (VL map order is observable), duplicate-key behavior unspecified.
What transfers: ubiquity for use case (a) is unbeatable, and *type-directed* decoding
(the program's type tells the decoder that this array is a set, this string an i64)
recovers most of what the format loses — the lossiness is fatal only when the reader has
no schema, and a VL decoder always has one: the type.

**CBOR** (RFC 8949). The standards-track answer to "typed JSON": distinct integer and
byte-string/text-string major types, 64-bit integers natively, float16/32/64 all
first-class, a tag system (bignums, timestamps; a *set* tag — 258 — exists in the IANA
tag registry, though not in the core RFC), a self-description tag, and — the part worth
stealing — **§4.2 deterministic encoding rules** (shortest forms, definite lengths,
bytewise-sorted map keys) as a *named spec section*, not an implementation accident. What
transfers: if VL ever wants a self-describing binary for foreign interop, CBOR is the one
to emit rather than inventing one; and "determinism is a spec section" is the right
posture regardless of format.

**MessagePack.** JSON's data model plus bytes, 64-bit ints, and f32/f64 distinction, in a
compact pre-standard binary; ext types bolt on application-specific tags. Widely
implemented, weaker spec discipline than CBOR, no set, no evolution story beyond
map-keyed convention. What transfers: essentially nothing CBOR doesn't also offer with an
RFC behind it — if the self-describing-binary niche is wanted, prefer CBOR.

**Protobuf.** The schema lives in a `.proto` file; the wire carries field *numbers*, not
names — compact, and the **evolution story is the whole point**: add fields freely, never
reuse a number, unknown fields are preserved (restored in later proto3 releases after an
early proto3 misstep of dropping them). Costs: an IDL and codegen toolchain beside the
language; no self-description; and deterministic bytes are explicitly *not* guaranteed
across implementations. Two details transfer directly: the canonical **JSON mapping
encodes int64 as a decimal string** — ~~the right answer to VL's i64-in-JSON problem~~
**NOT VL's answer, RULED 2026-09-01 (decision B, OQ-9): VL writes `i64` as a JSON NUMBER.**
Protobuf's mapping is still the right *description* of what protobuf does; it is a rule for a
reader whose number type is a double, and VL's reader is type-directed and exact. What
transfers unchanged is the other detail —
"the wire carries numbers, the schema carries names" is the template for any future
schema-carrying VL mode. The IDL itself does not transfer: VL's types are already a
schema language, and a second one beside it would be exactly the duplicated-functionality
smell `std-api-review.md` exists to catch.

**FlatBuffers / Cap'n Proto.** Zero-copy: the "decode" is generated accessors chasing
offsets inside the buffer; nothing is materialized. Both need an IDL + codegen; both pay
with awkward construction APIs and (FlatBuffers) a verifier pass before trusting foreign
bytes. What transfers to VL is the *layer*, not the format: accessor-reads-over-bytes is
precisely VL's linear tier — `Buffer` + `flat` types with checker-folded offsets — and a
GC-heap value can never alias a byte buffer anyway (a VL struct *is* a WasmGC struct; the
rep layer offers no way to overlay it on bytes). Zero-copy in VL means *staying in the
linear tier*, which the language already supports on purpose (§Approach 3), not a GC
serde feature.

**borsh / bincode.** Schema-implicit: the *type* is the schema, the wire is positional —
little-endian fixed-width scalars, u32 length prefixes, `Option` as a presence byte,
enums as a variant index + payload. borsh (NEAR) is the interesting one because it is
**specified as canonical**: one value, one byte string — map entries ordered by key, and
(as I recall the spec, stated with that hedge) NaN payloads refused outright to keep
hashing sound. bincode is the same idea as a Rust-only convenience, config-dependent and
unspecified across languages. Neither has any evolution story: add a field and old bytes
are garbage. What transfers: **this is the natural wire for a monomorphizing language
with structural types** — VL's derive can emit exactly this class of format with zero
bytes of wire schema — and borsh's "canonical or refuse" posture matches this repo's
determinism culture. The missing evolution story is real and is priced in §Approach 2.

**Amazon Ion.** JSON superset with typed nulls, arbitrary-precision ints/decimals,
timestamps, symbols, annotations, blobs, and — the distinctive part — dual text/binary
forms of one data model, with symbol tables amortizing repeated field names in binary.
What transfers: the *dual-form* idea (one model, a text rendering for humans and a binary
one for machines) is the right target shape for VL's derive — same shape walk, two
renderings — even though Ion itself (decimals, timestamps, symbol tables) is far richer
than VL's inventory wants.

## Survey: the language-side architectures

**Rust serde.** Two traits (`Serialize`/`Deserialize`) meet a fixed ~29-slot abstract
data model; formats implement `Serializer`/`Deserializer`; `#[derive]` generates
visitor-based code per type, and **monomorphization fuses type × format into straight-line
code with zero runtime metadata** — the fastest architecture in this survey, paying in
compile time and code size. The mapping onto VL is close but not exact: VL monomorphizes
per call shape already (`docs/internals/monomorphization-design.md`), so the *fusion* is
free — but serde's middle layer is a *trait*, and VL has none. The format-agnostic seam
in VL must be either a record of function values (real indirect calls at runtime — the
cost serde exists to avoid) or a **compiler-chosen seam**: one shape walk in the emitter
with N renderings selected at compile time. §Approach 2 takes the second.

**Swift Codable.** Protocols + compiler synthesis (since Swift 4): keyed/unkeyed/
single-value *containers* abstract the format; the synthesized `CodingKeys` enum is a
per-type field-name schema; errors are thrown. Ergonomics are the best in class —
`struct S: Codable` and done — performance is not (protocol witnesses, runtime
containers), and customization falls off a cliff (hand-implement everything). What
transfers: the *zero-annotation default* — in VL the derive should need no per-field
ceremony at all, because structural types leave nothing to annotate.

**Kotlin serialization.** A compiler plugin generates a `KSerializer` per `@Serializable`
class *plus a `SerialDescriptor`* — a runtime-introspectable schema object that formats
consume. The distinctive move: the derive emits **data about the type**, not just code,
which is what lets one generated artifact serve JSON, CBOR and protobuf. What transfers:
if VL ever wants a self-describing or schema-carrying mode, the derive emitting a schema
*value* (a VL constant) is the mechanism — cheaper and more honest than runtime
reflection, and exactly the checker-folded-constant pattern `flat` layouts already use.

**Go.** `encoding/json` is runtime reflection + struct tags — the anti-model for VL
(reflection doesn't exist here, and tags are a stringly schema bolted onto the type
system's side). `gob` has one idea worth keeping: a **self-describing stream** transmits
each type's wire description once per connection — a schema *handshake* — which is the
cheap insurance for use case (b) the day two VL builds talk to each other
(§Approach 2, evolution).

**Synthesis.** Everywhere the type system is strong, the winning move is the same:
**derive codecs from the types at compile time**; runtime reflection appears only where
the type system is too weak to carry the schema (Go, Java). VL is at the strong extreme —
monomorphized, structural, reflection-free, no bounded generics in userland — so the
derive is not merely natural for VL, it is the *only* mechanism that can produce
shape-generic codecs at all (fact 1 above). The open choices are the wire format(s) and
where the format-agnostic seam sits, not the mechanism.

---

## The design space, cut three ways

Three concrete approaches. They are not mutually exclusive — the recommendation
(§Recommendation) sequences all three — but each is judged standalone first.

### Approach 1 — `std:json`: hand-written codecs, no compiler change

> **RE-DERIVED 2026-09-01 from a POSITION matrix** (appendix, round 3). The premise this
> section rested on is refuted; every claim below was executed against a self-refreshed seed.

**Mechanism.** ~~an escaping writer over a `u8[]` builder … and a **pull lexer** handing typed
tokens (`nextString()`, `nextNumber()`, `expect('{')` …) rather than a parsed value tree —
because the idiomatic `Json` union tree is not emittable today (fact 5); the gate narrowed to
self-reference but the tree's defining feature IS the self-reference, so the pull-lexer plan is
unchanged~~ **— refuted 2026-09-01. The value tree BUILDS, and the pull lexer was never a
forced move.**

`type Json = null | boolean | f64 | string | Json[] | { [string]: Json }` is delivered,
narrowed and read back at **8 of the 10 positions measured, over all six arms** — **51 of 60
cells RUN (RUN 2026-09-01)**. Fact 5's 28-cell grid held POSITION fixed at module `const`;
`scripts/capability-probes/` held it fixed at *parameter*; that is the whole reason the two
instruments disagreed, and #2244 removed the one arm (`null`) the parameter position still
refused. Adding POSITION as the axis is CLAUDE.md's own prescription ("a capability gap has a
position matrix"), and it is what neither instrument had.

So stage 1 is the shape the owner ruled (decision G, `docs/internals/serde-critique-synthesis.md`):
**a `Json` value tree, a recursive-descent parser over a `string`, and a renderer.** A
token-level pull API is still worth exporting — it is the schemaless escape hatch for a
document too large or too foreign to materialise — but it is a *second* entry point, not the
shape the module is forced into. Per-type codecs sit **above** the tree as ordinary functions
(`circleFromJson(v: Json): Circle | JsonError`), which is what makes them composable at all
(see "the tax", below). Errors follow `std:fs`'s ruled shape — `T | JsonError` with a
`{ at: i32, msg: string }`-class struct — and the module is still the second measurement of
the `as`-propagation boilerplate, the way `std:fs` was the first.

**The whole module round-trips today.** 171 lines of ordinary VL — escaping renderer,
recursive-descent parser, `\"` / `\\` / `\n` escapes both ways, `parseF64` for numbers —
parse and render `{"a":[1,null,"x"],"b":true,"c":{"deep":2.5}}` **byte-identically**, plus
`[]`, `{}`, `null`, `[1e3,-2.5,0]` → `[1000,-2.5,0]` **(RUN 2026-09-01**, whole program inlined
in the appendix**)**. On a generated 1,049-byte document it is semantically equal to the input,
preserves key order, is idempotent under a second render, and is 1,001 bytes because VL's
shortest-round-trip `f64` writes `0` where Python writes `0.0`. Cost: `vl build` of the module
**0.067 s** → a 22,729-byte wasm; the marginal parse+render of that 1 KB document is
**~0.24 ms** (min-of-7 wall, 1 / 100 / 1000 iterations: 0.178 / 0.208 / 0.424 s, against
0.015 s for `print(1)`). No workaround was needed that is not named below.

**The position matrix.** Six arms × ten delivery positions; each cell prints a value proving
the arm round-tripped (`arr:2.5`, `map:k=2.5`, …), never merely that it compiled.

| position | null | boolean | f64 | string | `Json[]` | `{[string]: Json}` |
| --- | --- | --- | --- | --- | --- | --- |
| module `const` | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| parameter (`is`-narrowed) | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| return, annotated | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| return, INFERRED | check | check | check | check | check | check |
| struct field | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| array element | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| map value read (`m[k]`) | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| closure capture | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| array literal → `Json`, bare | RUNS | RUNS | RUNS | **SILENT** | emit | emit |
| array literal → `Json[]`, annotated | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |

**RUNS 51 · check-refuse 6 · emit-refuse 2 · check-clean invalid wasm 1 · trap 0.**

The nine non-RUNS cells are two rows, and both are the same shape: **an annotation is what pins
the rep, and the un-annotated spelling is where the residue lives** (CLAUDE.md's D962/D969
rule — "a fixture that annotates every destination cannot see the missing-annotation defect").
Annotating the array literal `Json[]` moves the whole bottom row to RUNS; annotating the return
moves the whole `ret_inf` row to RUNS.

**Residues that constrain the implementation.** Filed and unfiled, each with the spelling that
gets past it. None is a design rule; every one is a clause-1 or clause-2 violation.

| residue | verbatim | spelling that runs |
| --- | --- | --- |
| **D1009** — `Json \| null` ↛ `Json` | `argument 1: expected Json, got Json \| null` | bind the map read, narrow on `== null`, then call |
| **D1010** — null-bearing literal | `cannot assign (f64 \| string \| null)[] to 'c' of type Json` | `const arr: Json[] = [1.0, null, "x"]` |
| **NEW (a)** — inferred union return | `'g' infers the union return type Json — type-valid, but an inferred return of this shape is not yet supported by codegen; annotate the return type` | annotate every parser function `: Json` |
| **NEW (b)** — bare `[…]` of strings at a `Json` destination | check rc 0, then `type mismatch: expected (ref $type), found (ref $type)` — **check-clean invalid wasm** | `const a: Json[] = ["x"]` |
| **NEW (c)** — bare NESTED `[…]` at a `Json` destination | `emitProgram: array value does not match any array member of the union (leaf-scalar widening across a nested array is unsupported)` — at binding, argument *and* map-write | annotate the literal `Json[]` |
| **NEW (d)** — bare `[…]` holding a map | `emitProgram: a union arm that is an array-of-map is not yet supported — use a named element type` | annotate the literal `Json[]` |
| **NEW (e)** — `const e = v[0]` on a narrowed array arm, when the union also has a self-referential MAP arm | `emitProgram: map op receiver is not a map` | `for e in v { … }`, or hand `v[i]` straight to a call |
| **NEW (f)** — `print` of a local re-bound from an `is`-narrowed REF arm | check rc 0, then `type mismatch: expected i32, found (ref $type)` — **check-clean invalid wasm**; sibling of the closed D968 | print the narrowed value directly, or annotate the rebind |
| **NEW (g)** — an `is` narrowing on a struct-FIELD or ARRAY-ELEMENT receiver | four messages, one mechanism: `unsupported for-in iterable` · `narrowed union field atom has no value box` · `index access but array type not collected` · `callee is not a function name` | hoist the read into a local **before** the `if` |

Two of these bear on the *design*, not just the implementation. (g) is why a recursive walker
must hoist before it narrows — which is the natural spelling anyway, so the cost is a sentence
in the module header. And (b)/(c)/(d) together say the same thing as D1010: **the un-annotated
array literal is the one delivery position the tree does not carry**, so `std:json`'s parser
builds every array through an annotated `let a: Json[] = []` and pushes into it. Dropping that
one annotation from the working parser is check-clean invalid wasm (measured).

**The per-type tax is smaller than the old sketch made it look.** The struck text below argued
"one hand-written line per field, per type, forever". That was an artifact of a sketch with no
abstraction (the cross-language critique's F10 steelman: Elm and Gleam decoders are combinators,
not scaffolding). Over a value tree the combinators are ordinary functions and they run:
`field(v, "r")`, `num(…)`, `str(…)`, composed into `decodeCircle(v: Json): Circle`, prints
`2.5/c1` **(RUN 2026-09-01)** — and a first-class `const dec: (Json) => f64 = num` runs too.
What is still refused is only the *alias* `type Dec<T> = (Json) => T`
(`unknown type 'T' within '(Json)=>T' in union 'Dec<T>'`), which costs the combinator style
nothing today because the inline spelling works. The residual tax is real but it is per-TYPE,
not per-FIELD-per-type, and it is the boilerplate stage 2 deletes.

**Type fidelity.** Only as good as the hand code, and the format caps it: ~~`i64` must go as a
decimal string by convention (protobuf's JSON mapping)~~ **REVERSED by owner ruling B
(2026-09-01): `i64` is ALWAYS a JSON number.** VL's reader is type-directed and therefore exact,
`i64 | string` stays derivable (the string rule made it ambiguous), and a human config reads `3`
rather than `"3"`; a JavaScript consumer loses precision above 2^53 and is told so in the
module header. The reader side needs `parseI64`/`parseI32` in `std:fmt` — landing separately;
today `parseF64` is the only number path and it funnels `9007199254740993` to `…992`. `f32`
needs shortest-for-f32 rendering (`0.1` — note the f64-shortest rendering of a widened f32 is
the unreadable `0.10000000149011612`, which is what `toString` over an `f32` gives today
**(RUN 2026-09-01)**), `NaN`/`Infinity` must be an encode-time *error* (a silent `null` is
the quiet lie this repo rejects elsewhere), `u8[]` needs base64 —
~~not in std today~~ **`std:base64` SHIPPED 2026-09-01**; `encodeBase64([104,105,33])` is
`"aGkh"` and decodes back to 3 bytes **(RUN 2026-09-01)** — sets and i32-keyed maps
round-trip only because the hand-written decoder knows the target type. Closures:
unspellable in hand code anyway — refusal by omission.

**Prerequisites** ~~, measured missing~~ **— MET, 2026-09-01.** The old text called
`f64`/`f32` ↔ string "the *only* hard part of this whole approach" and measured it absent.
It is present: `std:fmt`'s `toString` f64 arm and `parseF64` (fact 6), the lexer's
scientific-notation fix (#2173), and `std:base64`. **The remaining halves are `f32` ↔ string
and `parseI64`/`parseI32`** — the `f32` pair is the same Burger–Dybvig core with
24-bit-significand boundaries plus f32-nearest rounding on the way in, not a wrapper over the
f64 pair (`std/fmt.vl`'s header argues this at length). A v1 that renders `f32` as its widened
f64 is honest-but-ugly and round-trips correctly; it just prints `0.10000000149011612` where a
reader expects `0.1`.

~~**The sketch below RUNS on today's seed**, which is the strongest form this claim has had:
Approach 1 is no longer an estimate.~~ **Superseded 2026-09-01: the whole module runs, not a
spine of it. The flat-record sketch is kept because its `decode` body is the boilerplate
measurement stage 2 exists to delete — but read it as the SCHEMA layer sitting on top of the
value tree, not as the parser.**

```vl
// MEASURED, not illustrative: this round-trips on the 2026-09-01 seed.
// Appendix ROUND 2's probe `a1b.vl` is the whole program; this is its spine.
// (The value-tree parser+renderer this section now recommends is in ROUND 3.)
import { toString, parseF64 } from "std:fmt"

type Config = { name: string, ratio: f64, retries: i32 }
type Lex    = { src: string, pos: i32 }

function at(lx: Lex): i32 { if lx.pos < lx.src.length { lx.src[lx.pos] } else { 0 } }
function eat(lx: Lex, ch: i32): boolean {
  while at(lx) == ' ' || at(lx) == '\n' { lx.pos = lx.pos + 1 }
  if at(lx) == ch { lx.pos = lx.pos + 1; true } else { false }
}
function str(lx: Lex): string | null {          // one token, typed
  if !eat(lx, '"') { return null }
  const s = lx.pos
  while lx.pos < lx.src.length && at(lx) != '"' { lx.pos = lx.pos + 1 }
  const out = lx.src.slice(s, lx.pos)
  lx.pos = lx.pos + 1
  out
}
function num(lx: Lex): f64 | null { /* … slice to ',' or '}', then */ parseF64(/* … */) }

function encode(c: Config): string {            // a template, not concat
  `{"name":"\{c.name}","ratio":\{toString(c.ratio)},"retries":\{toString(c.retries)}}`
}
function decode(src: string): Config | null {   // built AT the destination shape
  const lx: Lex = { src: src, pos: 0 }
  if !eat(lx, '{') { return null }
  // … key, ':', value, ',' … one hand-written line per field, per type, forever
  { name: name, ratio: ratio, retries: retries as i32 }
}
```

Two things the sketch shows that prose did not. **The template literal carries the whole
writer** — no `u8[]` builder, no quadratic concat, and holes render `f64`/`i64` directly —
so the `fromCodePoints`-once idiom is an optimisation rather than a necessity. (The appendix's
value-tree renderer uses `out = out + …` for legibility and is quadratic at document scale;
`join`-not-`+=` is the ruled fix and belongs in the module header.) And **`decode`'s body is
the schema tax**: three fields, one hand-written key/colon/value/comma sequence each, and it
does not tolerate reordering, absence, or unknown keys until someone writes that too — ~~that
is the boilerplate stage 2 exists to delete~~ **it is the boilerplate stage 2 deletes, and the
combinator measurement above is the honest size of it: per-type, not per-field-per-type.**

**Fit.** (a) host IO/config: good — this is the approach's whole constituency. (b)
message passing: poor — slow, text, and every message type hand-coded twice. (c)
pause/restore: no.

**Evolution.** Manual and therefore flexible: a hand decoder tolerates missing fields via
`T | null` and unknown fields by skipping tokens — and with a value tree, unknown fields
survive a round trip *for free*, which the pull-lexer plan could not offer. **Determinism:**
achievable (VL maps iterate in insertion order — the appendix's 1 KB round trip preserves key
order, measured) but not a property anyone enforces; it lives in each hand codec.
**Security:** hand-written decoders are the classic bug surface, and the value tree moves the
choke point to ONE parser: depth limits, length caps, strict UTF-8 (`std:utf8`'s strict
default) and duplicate-key policy are centralizable there, where the per-type decoders above
the tree only re-decide absence and excess.

**Honest summary.** ~~Cheap to start, unbounded to live with — the per-type tax is paid
forever, by hand, per format.~~ **Cheap to start and cheaper to live with than the pull-lexer
version was: the tree is one parser plus one renderer, and the tax that remains is per-type
schema code above it.** Its real value is (i) config files *now*, and (ii) being
the measurement instrument that tells the derive what boilerplate to delete —
the same role `std:fs` played for `as`. What it still cannot do is anything shape-generic:
`decodeCircle` is written by hand, and that is exactly what Approach 2 removes.

### Approach 2 — compiler-derived codecs per monomorphized shape (the deriving-Show cousin)

The interesting one, and the one VL's architecture is quietly optimized for.

**Mechanism.** A builtin pair — spelling open, sketched as
`serialize<T>(v: T): u8[]` / `deserialize<T>(bytes: u8[]): T | DecodeError` (and later
`toJson<T>` / `fromJson<T>`) — where the **checker** validates `T` against a closed
serializability predicate and the **emitter** generates one encoder and one decoder
function per distinct shape reachable from `T`, memoized in a registry keyed the way
variant tags already are (field-name-aware `structSig`). Recursion in the type
(`Tree` **(RUN 2026-09-01)**) becomes recursion in the generated functions. No runtime
metadata, no reflection, no wire schema: the monomorphized type *is* the schema, serde's
fusion without serde's trait layer. Generated code is ordinary emitted VL-level code over
the existing floor (`u8[]`, `array.copy`); no new intrinsics are required for the binary
form.

**What user code looks like — ILLUSTRATIVE, nothing here compiles today:**

```vl
// ILLUSTRATIVE — `serialize`/`deserialize` do not exist. Spelling is OQ-1.
import { serialize, deserialize } from "std:serde"

type Move = { player: i32, at: { x: f64, y: f64 }, note: string | null }

const bytes = serialize(m)                 // that is the entire encoder
const back  = deserialize<Move>(bytes)     // T | DecodeError, never a trap
if back is DecodeError { print(back.msg) } else { apply(back) }
```

**What the compiler generates, in prose.** The checker walks `Move` against the
serializability predicate and accepts (three shapes reachable: `Move`, `{x, y}`,
`string | null`). The emitter then generates, once per distinct shape and memoized in a
registry keyed the way variant tags already are, a pair of functions per shape. For `Move`
the encoder is: write `at` first, then `note`, then `player` — **sorted name order**, fact
3, so the two aliases of this shape agree by construction — where `at` recurses into the
`{x, y}` encoder (two f64 bit patterns, 16 bytes, no length prefix because the shape is
fixed-size and the emitter knows that statically), `note` writes a presence byte then a u32
length and the string's UTF-8 bytes verbatim, and `player` writes 4 little-endian bytes.
The decoder is the same walk in reverse, **constructing at the destination shape** —
`{x: readF64(), y: readF64()}` built directly, never widened-then-narrowed — with the
length prefix validated against remaining input *before* any allocation. Both functions are
straight-line ordinary emitted code; there is no visitor, no trait object, and nothing to
look up at runtime. A shape whose transitive fields hold no ref (here: `{x, y}`) also skips
the cycle seen-set entirely, decided at compile time (§Cycles).

**The wire (working name VLB), borsh-class and canonical by construction:**

- Scalars little-endian fixed width: `i32`/`f32` 4 bytes, `i64`/`f64` 8, `boolean` and
  `u8` 1. Floats are **bit patterns verbatim** — `-0.0`, NaN payloads and all — so the
  round trip is exact even where today's print path is not (fact 6). (Whether *computed*
  NaNs should be canonicalized at encode for cross-run determinism is OQ-3.)
- `string`: u32 byte length + UTF-8 bytes. VL strings *are* UTF-8 views
  (`docs/guide/strings-design.md`), so encode is one bulk copy — zero transcode.
- `T[]` and `u8[]`: u32 count + elements / raw bytes.
- Structs: fields **positional, in sorted-name order** — well-defined across spellings
  because the emitter already sorts fields by name per shape (fact 3). No field names on
  the wire.
- Maps: u32 count + key/value pairs **in insertion order**. Deliberately *not* sorted, and
  this is a considered deviation from borsh: VL map order is *observable* (`.keys()`
  **(RUN 2026-09-01)**), so order is part of the value, and sorting would make the round
  trip lossy
  — decode would hand back a map that iterates differently than the one encoded.
  Determinism is not sacrificed: the encoding is a pure function of the value, order
  included. Sets encode as what they structurally are — boolean-valued maps — which
  round-trips membership *and* insertion order. (A `canonical` sorted mode for
  content-addressing across differently-built equal maps is OQ-4, deferred until a
  consumer names it.)
- `T | null`: presence byte + payload (the runtime niche is a rep concern, not a wire
  concern). General unions: a u8 arm index + payload, indexed by the **declared member
  list of `T` at the call site** in a canonically-ordered form — *not* the runtime global
  tag registry, whose interning order is a per-build accident. The ordering rule needs
  care (canon is spelling-dependent — the destringify program's standing warning) and is
  OQ-2.
- Literal unions: **the literal value itself** (string bytes / the number), not a member
  index. An index is smaller, but a value survives member insertion and reordering, and
  matches the owner's unions-over-enums posture: `"file" | "dir"` means those strings,
  not 0 and 1. (Compactness returns for free if A16's enum rep ever lands, and a
  schema-carrying mode may index later; OQ-5.)
- **Refusals, loud and named (clause-2-honest):** closures/function types (a captured
  environment and code identity mean nothing outside the instance), `void`/`never`.
  A structural wrinkle to rule on: `Buf` is a *plain* structural alias `{base, length}`,
  indistinguishable from innocent data, so linear-memory *addresses* serialize as the
  meaningless integers they are — the derive cannot refuse them by shape. Newtypes (`new`)
  are visible to the checker though erased before emit; ~~a derive could refuse un-opted-in
  newtypes (they usually brand *provenance*, which does not survive a trip — `F32Base`)~~
  **RULED 2026-09-01 (OQ-6, reversed): a newtype is NOT refused — it serializes as its base,
  brand kept by the checker and erased at emit. The `Buf` wrinkle above is the one that
  survives, and it is the reason: the hazard belongs to the ADDRESS, and refusing brands
  caught the honest spellings while waving the address through.** —
  OQ-6.

**Type fidelity: exact, by construction.** Every width preserved, `i64` full-range, f32 ≠
f64, bytes ≠ text, sets ≠ arrays (as map-vs-array on the wire, and as the *type* on
decode), i32 keys ≠ string keys (the static key type selects the wire form) — the
owner's entire JSON complaint list, closed at once, because the schema is the type and
the type is not lossy about itself.

**Evolution.** Schema-implicit formats have none, and pretending otherwise is how bincode
bites people: add a field and old bytes are misread, not rejected. Priced honestly:
(i) v1 targets use case (b), where both ends are the same build and evolution pressure is
~zero; (ii) a 4-byte header (magic + format version) makes *format* changes loud;
(iii) *data* versioning is the user's union — `deserialize<ConfigV1 | ConfigV2>` is a
legal call and the arm index is the version tag, which makes migration an ordinary
`match` rather than a framework; (iv) a gob-style schema handshake (send the shape
description once per connection) is the eventual cross-build answer and needs the derive
to also emit a shape *description* — the Kotlin `SerialDescriptor` move, deferred.

**Determinism: yes, as a stated goal.** One value, one byte string — no reflection
ordering, insertion-order maps, fixed widths. This repo's culture (byte-identical
fixpoints, `cmp`-graded A/Bs, webcraft's byte-comparable TS twin) will use a canonical
encoding the day it exists; CBOR's lesson is to make it a spec section, and here it is
the *only* mode rather than an optional one.

**Security.** Decoding untrusted bytes is memory-safe by construction — no type names on
the wire, no gadget instantiation (the Java/pickle failure class is unreachable: decode
builds only the statically-requested type), every array access bounds-checked or
trapping. The remaining risks are resource-exhaustion and they get the standard answers,
generated *once* into every decoder rather than re-decided per type: a length prefix is
validated against remaining input before allocation (a u32 count is a claim, not a
budget), recursion depth capped (a wasm stack overflow is a trap — loud, but a DoS),
strings strict-UTF-8 via `std:utf8`, trailing bytes rejected, and errors as
`T | DecodeError` values (`error-handling-design.md`), never traps.

**Fit.** (b) message passing: exactly right — fast, exact, deterministic, same-build.
(a) host IO: as the *engine* under a JSON rendering (below), not as bytes humans edit.
(c) pause/restore: the honest 80% — see §Snapshot.

**The JSON bridge rides the same walk.** `toJson<T>`/`fromJson<T>` are a second rendering
of the same emitter shape-walk — the Ion lesson (one model, text and binary duals) and
the serde lesson (formats behind one seam), with the seam at compile time where VL can
afford it. Policy per the fidelity table in Approach 1: ~~i64 as decimal string~~ **i64 as a
JSON NUMBER (RULED 2026-09-01, decision B / OQ-9)**, f32
shortest-for-f32, NaN/Inf an encode error, `u8[]` base64, unions index-or-kind-tagged
(structural types have no *names* to tag with — serde's externally-tagged form needs an
identity VL structs don't have; OQ-7 picks between an arm-index wrapper and a
discriminant-field convention). This is what retires Approach 1's per-type hand code.

**Cost, sized honestly.** Checker: the serializability predicate + diagnostics — small,
`match`-exhaustiveness-class work. Emitter: the shape walk × two directions × two
renderings, landing in the same per-rep-ladder territory as `print`/union-`==` — the
known risk is a missing arm per rep family, and the mitigation is the one already
institutionalized: one shared walk (never per-format copies of the type dispatch), a
corpus fixture per rep family (niche, value-tagged, boxed, litunion, u8[], i32/string
maps, recursive), and the distilled-corpus gate. This is a mid-size compiler track on
the order of the litunion or map-narrowing efforts — weeks of agent time, not days — and
it is *deferrable per rendering* (binary first, JSON second).

### Approach 3 — the linear-tier lane: foreign formats and zero-copy stay on `Buffer`

Not a std codec at all, but the answer to two asks that keep being filed under "serde"
and belong elsewhere:

- **Foreign binary formats** (a PNG header, a network protocol, protobuf-if-ever): the
  ruled `flat`-type machinery is VL's IDL for *other people's* wire formats — declare the
  layout, the checker folds offsets/shifts/masks, the codec is explicit VL over
  `std:buffer`, and ROADMAP already names "a real decoder" as the forcing customer for
  generated accessors. Protobuf interop, if a consumer ever demands it, is a *library*
  built this way — not a std commitment, and not a reason to grow a VL IDL.
- **Zero-copy**: a WasmGC value cannot alias bytes (fact 8), so FlatBuffers-style
  zero-copy in VL *is* the linear tier: keep the data in a `Buf`, read through
  views/`flat` accessors, never materialize. Webcraft already lives there for exactly
  this reason. The design consequence for std serde is a refusal worth writing down:
  **derived codecs do not promise zero-copy, ever** — encode copies GC values into
  bytes, decode materializes GC values from bytes, and programs for which that copy is
  the bottleneck should hold their data in the tier built for it.

**What user code looks like — MEASURED, this runs on the 2026-09-01 seed** (appendix probe
`a3.vl`; the sub-byte widths in the comment are the RULED-not-built half):

```vl
import { Buffer, storeI32, storeF64, loadI32, loadF64 } from "std:buffer"

// Declared field order IS the layout. Offsets are checker-folded constants.
flat type Packet = { id: i32, kind: i32, x: f64, y: f64 }
//  once sub-byte widths land, a header spells itself the same way:
//  flat type Header = { ver: u1, ext: u1, kind: u6 }   // ONE byte

const buf = Buffer(Packet.size * 4)                     // Packet.size == 24

function put(i: i32, id: i32, kind: i32, x: f64, y: f64) {
  const at = i * Packet.size                            // Packet.x == 8
  storeI32(buf, at + Packet.id, id)
  storeI32(buf, at + Packet.kind, kind)
  storeF64(buf, at + Packet.x, x)
  storeF64(buf, at + Packet.y, y)
}

put(2, 7, 1, 1.5, -2.25)
print(loadI32(buf, 2 * Packet.size + Packet.id))        // 7
print(loadF64(buf, 2 * Packet.size + Packet.y))         // -2.25
```

There is no encode step and no decode step in that program, and that is the point: the
bytes already ARE the value. `Buffer` + `flat` is the whole serializer for this lane, and
what a derive would add is ergonomics the lane deliberately trades away for control over
the layout.

Fit: (a) niche, (b) viable today for Buffer-resident state (the one shape that could even
be *threaded* today, per concurrency-design's carve-out), (c) this **is** the
byte-snapshot lane — next section. Fidelity/evolution/security are whatever the foreign
spec says — that is the point of the lane. See §Flat types for how this lane and the
derive divide the estate, and for the one bridge question between them.

---

## Snapshot: which layer pause/restore belongs at

The owner's "could always do that at the byte level I guess" deserves a precise answer,
because for VL it is mostly *not* true, and the part that is true is already shipped.

**What byte-level snapshot can actually capture today.** The externalizable state of a
wasm instance is linear memory + mutable globals (+ table contents). That is what
Wizer-class pre-initializers snapshot into a new module's data segments, and it works —
*for linear-memory languages*. Engines can **pause** execution (wasmtime's epochs/fuel,
async yields) but offer no API to **externalize** a paused store: no wasmtime
instance-state serialize/restore exists (`Module::serialize` is compiled code, not
state), and none of it reaches the GC heap. (State of the world as known at writing; no
web access to re-verify — treat as an assumption to re-check before scheduling anything
on it.)

**What breaks for VL specifically.** Every VL value is a WasmGC heap object — structs,
arrays, the string headers *and* their backings, the union boxes, the closures. That heap
is engine-owned and not byte-addressable: it does not appear in linear memory, so a
memory snapshot of a VL instance captures the `Buffer` tier and *none of the program's
values*. Even if an engine someday exports a GC-heap image, three things still break,
which is why the brief's list is the right list: **interned/pooled strings** (literal
pool identity is per-instance; `ref.eq` fast paths — fine within one restored image,
meaningless merged across two), **host handles** (nothing in VL holds one today —
`std:fs` is whole-file, handleless, which is a *small honest mercy* of the current
surface — but the moment fds or sockets exist, no byte image can revive them), and
**function references** (table indices and heap-type indices are artifacts of one build:
a snapshot is only replayable into the *byte-identical* module, so byte-level snapshots
die at every compiler upgrade — precisely the evolution axis where a serde encoding
survives). Suspended stacks join the list the day the ruled stack-switching I/O model
lands: a paused fiber is engine-internal state with no externalization story at all.

**The verdict, in one sentence: snapshot belongs *below* the language or *above* it,
never at the serde layer.** Below: engine-level image of linear memory + globals — real
today, and VL already routes the state that wants it into that tier (webcraft's
"snapshot/rollback/hash are memcpy-class" is this, deliberately); a full-instance
GC-inclusive image is an engine feature VL should adopt if it ever ships, not emulate.
Above: **application-level pause** — the program designates a root state type and
`serialize<T>` walks it; closures and other non-values are *loud compile-time refusals*,
which converts "what silently didn't survive the snapshot" (the byte-level failure mode)
into "what the checker made you move out of your state type" (a design pressure, and a
healthy one). That is the honest 80% of "pause and restore": it survives compiler
upgrades, it is inspectable, and its boundary is checked. The dishonest 20% — resuming
mid-computation with live stacks and open handles — should be refused at this layer
explicitly rather than half-promised.

---

## Recommendation, and the staged path

**Recommendation: Approach 2 — compiler-derived codecs per monomorphized shape — is the
destination; a thin Approach 1 ships first as scaffolding and measurement; Approach 3 is
recognized as already-decided policy rather than new work. No VL IDL, no serde-layer
execution snapshot, no zero-copy promises in the GC tier.**

Staged, sized honestly:

- **Stage 0 — prerequisites, std-only, ~~no compiler change~~ ONE compiler change.**
  ~~`f64` ↔ string~~ **LANDED 2026-09-01, as `std:fmt` growth.** The "no compiler change"
  estimate was wrong by exactly one, and the miss is worth recording because it is the
  shape a std slice keeps hitting: `capScan`'s callee exemption asked two of the compiler's
  three intrinsic-name predicates, so a numeric-opcode intrinsic's NAME rode the capture
  list and `emitProgram: the numeric intrinsic 'f64bits' is mistaken for a captured
  variable here` fired for a call from an ordinary top-level function as soon as the
  program contained a function value ANYWHERE. `f64bits` has no substitute in pure VL, so
  the f64 arm was unusable beside a comparator lambda or `std:test` until that was fixed.
  Stage 1 should budget for the same kind of one-line-but-blocking gap rather than assume
  the std tier is closed. `toString` gained an **f64 arm** and `parseF64(self:
  string): f64 | null` is its inverse; the design, the correctness arguments and the
  measurements are in `std/fmt.vl`'s `f64 ↔ TEXT` header, and the grading is
  `tests/vl_std_float_text_test.ts`. Four decisions that bind the rest of this document:
  - **The style is ECMA-262 `Number::toString`, radix 10** — the rule the two hosts' print
    sinks already claim, so `print(x.toString())` and `print(x)` are the same characters, and
    a spec rather than a preference. Every JSON/text rendering below inherits it.
  - **The formatter is Burger–Dybvig over exact big integers, not Ryū.** No tables, no
    128-bit multiply (32-bit limbs inside an i64 leave room for every partial product), and
    a correctness argument short enough to re-derive; ~25 µs per rendering, ~22 µs for an
    exact-path parse, under 1 µs for a fast-path one. Ryū drops in behind the same
    signature if a consumer ever names a throughput requirement.
  - **The parser is correctly rounded at every halfway case** — Clinger's fast path over an
    exact num/den fallback with ties-to-even. Measured against `Number(s)` on 200,000
    random and 5,844 adversarial inputs (exact midpoints, ±1 decimal ulp, 900-zero
    truncated tails, the subnormal boundary): **205,844 of 205,844**.
  - **Range is not a parse failure**: overflow answers ±Infinity, underflow ±0, and `null`
    means only "not a number in the grammar". A JSON reader inherits that split.

  **Two things fact 6 said that are now measured differently.** `-0.0` printing as `0` is
  not a print-path defect, it is ECMA-262's own rule and `toString` reproduces it — so −0 does
  not survive a text round trip in EITHER direction, which is a reason stage 2's VLB
  encodes float BITS rather than text. And the Rust host's `print` is **not** exactly JS
  `String(v)`: it re-formats digits from Rust's `{:e}`, which breaks an exact decimal tie
  away from even where the spec breaks it to even — 14 of 50,000 pseudo-random doubles,
  smallest witness bits `4835952189745799117` (exactly 2023347301156851.25). The same VL
  program prints differently under the V8 and Rust hosts for those values. `std:fmt`
  follows the spec; the divergence is pinned by a test so a host fix flips it.

  **A THIRD thing fact 6 said, added 2026-09-01 in the same refresh: the builtin `toString`
  is GONE.** `toString` is `std:fmt`'s export and nothing else; an unimported call refuses
  with a note naming the import line **(RUN 2026-09-01)**. Everything below that spells
  `toString` means the imported one, and there is exactly one of it in the language.

  **`parseI64` / `parseI32` LANDED 2026-09-01**, closing the other half of stage 0's
  remainder — and they landed INDEPENDENTLY of decision B. Decision B was RULED the same
  day (OQ-9: `i64` is ALWAYS a JSON number; `docs/internals/serde-critique-synthesis.md`
  §"Decisions that are the owner's", DECISIONS.md), but the ruling is not what admitted
  these two: the recommendation's own clause did — needed "regardless … by every option", since until
  they landed the only text→number path was the `parseF64` funnel, which cannot be exact
  wherever the integer is not representable as a double
  (`parseF64("9223372036854775807")` is 2^63, printing as `9223372036854776000`). A
  decimal-string wire needs an exact integer READER even more than a numeric one does.
  Both answer `T | null`, both accept `"-"? digit+` and nothing else — a strict SUBSET of
  `parseF64`'s grammar, so a reader choosing between them chooses a TYPE and never a
  dialect — and both answer `null` rather than a wrap when the value does not fit. JSON's
  own `int` production (`-? (0 | [1-9] digit*)`) sits strictly inside this grammar, so an
  integer-shaped token needs no rewriting at the seam; a token carrying a `frac` or an
  `exp` is not an integer token and goes to `parseF64`.

  **STILL OPEN in stage 0.** `f32` ↔ string: an f32's shortest rendering is shorter than
  its widened f64's (`0.1` vs `0.10000000149011612`), so it is a different boundary
  computation and not a wrapper — the same Burger–Dybvig core with 24-bit significand
  parameters, plus the f32-nearest rounding on the way in. **Narrowed 2026-09-01**: an f32
  now REACHES the f64 arm and renders as its widened value (`toString(x)` and `x.toString()`
  over an `f32 = 0.1` both give `0.10000000149011612` **(RUN)**), because the emit hole
  `std/fmt.vl`'s header filed against this — `union atom has no value box` — has since
  closed and `scripts/capability-probes/f32-into-f64-union-arm.vl` grades `RUNS`. So the
  gap is no longer "an f32 cannot be rendered", it is "an f32 is rendered as the f64 it
  became", which is correct-but-ugly and round-trips. That is a v1-shippable state for
  stage 1's JSON; it is not a v1-shippable state for a `toJson<f32>` that claims fidelity.
  ~~Fix the lexer's inability to read scientific notation~~ **LANDED 2026-09-01**
  (#2173) — `1e3`/`1.5e-7`/`2E+10` end to end, correctly rounded, so VL's own float
  rendering is re-parseable as source.
  ~~`std:base64` (small)~~ **LANDED 2026-09-01** — RFC 4648 §4, standard alphabet, padded,
  `encodeBase64(self: u8[]): string` / `decodeBase64(self: string): u8[] | Base64Error`,
  strict about non-canonical trailing bits so decode-then-encode is an exact identity.
  ~~Note for stage 1 and stage 3: the error arm is a struct rather than `null` because
  `u8[] | null` **does not lower** on this compiler~~ — **`u8[] | null` LOWERS as of
  2026-09-01 (D979 built the niche); the capability probe grades `RUNS` (RUN 2026-09-01)**.
  The struct error arm was still the right call and should NOT be revisited: `Base64Error`
  carries the offending offset, which `null` cannot, and that was the module's own stated
  reason beside the lowering gap. Recorded here because the *stale* reason would otherwise
  read as the only one. One live caveat for stage 1: the filed spelling runs, but the same
  annotated `u8[] | null` return delivering an ARRAY LITERAL (`return [1, 2, 3]`) is `vl
  check` rc 0 followed by invalid wasm **(RUN 2026-09-01)** — build the list, then return
  the binding.
  Every export here is a `std:*` addition → `std-api-reviewer` per CLAUDE.md.
- **Stage 1 — `std:json` v1, std-only. RESHAPED 2026-09-01 (ruling G).**
  ~~Escaping writer + pull lexer + hand codecs for the types the repo itself needs
  (config-file class). Deliberately minimal: it is the boilerplate *measurement* for stage 2
  (the `std:fs`→`as` playbook) and the day-one config answer. Do not gold-plate; it is
  scheduled for partial retirement.~~
  **A real `Json` VALUE TREE, plus a parser and a renderer over it** — not a
  token-at-a-time pull lexer with per-type hand codecs. The premise that forced the lexer
  was fact 5's claim that a self-referential union cannot be built; that is refuted. The
  six-arm tree `type Json = null | boolean | f64 | string | Json[] | { [string]: Json }`
  renders `{"a":[1,null,"x"],"b":null,"c":{"deep":2.5}}` and a top-level `null` on the
  post-#2244 seed — measured by the critique panel, not re-measured here
  (`serde-critique-synthesis.md` §Verification). Two checker residues remain, both with
  one-line workarounds and both filed: **D1009** (`Json | null` — a map read — is not
  accepted where `Json` is expected, though `null ∈ Json`; spell `const c = v[k]` and
  narrow) and **D1010** (`[1.0, null]` cannot reach `Json` unannotated; annotate the
  binding). v1 therefore ships with those two spellings and gets shorter when they close.
  **The v1 SURFACE is proposed in `docs/json-design.md` (2026-09-01)** — and measuring it
  found a third residue that is not a workaround but a BLOCKER: **D1021**, the ruled
  `Json | JsonError` return (the `T | Error` shape every std module uses) is check-clean
  invalid wasm because a RECURSIVE alias does not compose into a wider union. The API is
  kept and the builder is sequenced after the fix; see that doc's §5.
  What this buys: `deserialize` is a two-phase read (text → `Json` → shape) whose first
  phase is reusable, the tree is the schemaless escape hatch by construction rather than a
  leftover lexer, and stage 3 retires LESS of it. The wire policies below are stage 1's
  from day one: unknown fields rejected, exact case, duplicate keys rejected, `null` always
  emitted (OQ-8); `i64` a JSON number (OQ-9); untagged arms distinguishable by first token
  or required key set (OQ-7 as amended by C). **§Approach 1 is being re-derived separately**
  with POSITION as its missing axis (ruling G's second half), and that derivation — not this
  bullet — is where the combinator-vs-boilerplate cost belongs.
- **Stage 2 — the derive, binary first.** Checker predicate + emitter shape-walk +
  VLB encode/decode, gated by per-rep-family fixtures and the distilled corpus. Serves
  message passing (b) — sequenced with, or just ahead of, the concurrency model's
  instance work, which is its forcing customer. **Two additions ruled 2026-09-01:**
  - **The static acyclic-shape predicate is stage-2 work, not a footnote** (ruling D). It
    does not exist in the compiler today — the audit found no transitive ref-free predicate
    anywhere (`serde-critique-synthesis.md` §Verification) — and §Cycles' cost argument
    depends on it entirely. Build it, keep a depth cap as the floor beneath it, and land the
    N/4N timing probe with it.
  - **The VLB header carries an 8-byte shape fingerprint** (ruling E, OQ-10), over
    wire-relevant structure only, reusing OQ-2's recursive structural fingerprint. It is
    part of the format from its first byte, not a later revision.
- **Stage 3 — the JSON rendering over the same walk.** `toJson<T>`/`fromJson<T>`;
  ~~retire the hand codecs of stage 1 where they overlap; `std:json`'s lexer/writer remain
  as the schemaless escape hatch.~~ **Stage 3 now retires LESS (ruling G).** With stage 1
  shaped as a value tree there are no per-type hand codecs to retire — what stage 3 adds is
  the *derived* path (`T` ↔ bytes in one step, no intermediate tree) beside a `std:json`
  that keeps its own reason to exist: the `Json` tree, its parser and its renderer are the
  schemaless surface, and a program that wants to read JSON whose shape it does not know
  still goes there. The overlap is the convenience codecs the repo writes for its own
  configs, and those are a handful.
- **Deferred until a consumer names them:** canonical-sorted map mode (content
  addressing), a schema-description artifact + gob-style handshake (cross-build
  messaging), CBOR rendering (foreign self-describing interop), generated `flat`
  accessors (ROADMAP already holds this).

## Print, templates, and color ride the same renderer (owner direction, 2026-09-01)

Three surfaces, one widening chain. Template holes and `print` both bind to the CANONICAL
stringifier — ~~std's integer/boolean renderer today, its f64 arm at Stage 0B~~ **std's
`i32 | i64 | boolean | f64` renderer as of 2026-09-01, the f64 arm LANDED**, and the derived
`show<T>` at Stage 2 — so **objects/maps/sets/arrays/unions become spellable in a template
hole and printable the moment the derive lands, with zero new template or print work**.
The widening is already visible at the hole: `` `f64=\{x} i32=\{n} i64=\{i} bool=\{b}` ``
renders all four widths with no import **(RUN 2026-09-01)**, and it did not do that
yesterday — which is the chain working exactly as this section claims it would.
D711's ruling ("`print([1,2,3])` has no defined output") is not overturned early: it is
revisited exactly once, at Stage 2, when `show<T>` DEFINES the rendering (with the §Cycles
back-reference rule).

**Colored print — ruled in principle, with one hard constraint: ANSI must never leak.**
The owner's pain case is real and common: tools that write escape codes into non-TTYs,
which then survive pipes, files, and copy/paste. Policy (Node's model, which has the right
split):

- A bare **string** prints raw, always — never colored, never quoted. Color applies to
  RENDERED VALUES (numbers, booleans, null, and Stage 2's composite rendering), the way
  `console.log(5)` colors and `console.log("s")` does not.
- Escapes are emitted **only by print's TTY sink**: color iff stdout isatty AND `NO_COLOR`
  is unset AND `TERM != dumb`, with `--color=always/never/auto` as the CLI override (the
  detection machinery shipped with the CLI overhaul, #2080). Redirected output is clean by
  construction — which is the whole copy/paste fix.
- **The string layer stays pure**: `toString`/`show<T>` output NEVER contains ANSI. Color
  is applied by the sink to the renderer's structure, not baked into strings — so template
  literals, serde, and log files can never capture an escape code. At Stage 2 this falls
  out naturally: the derive's walk is an event stream, the plain string builder is one
  consumer, the colorizing TTY sink is another.
- **Stage C0 — SHIPPED (host-side; `Palette` in `scripts/vl-host/src/main.rs`).** The
  print imports know each primitive's type, so the escape is applied there — the last
  point before stdout that still knows a value's type, and the only place a program's
  output can acquire one. Measured behaviour, one row per clause of the policy, pinned by
  `tests/vl_print_color_test.ts`:

  | invocation | escapes |
  | --- | --- |
  | `vl run m.vl \| xxd \| grep -c 1b` | **0** |
  | `vl run m.vl` on a pty (`TERM=xterm`) | 8 — `ESC[33m5ESC[39m` per value |
  | pty + `NO_COLOR=1` / pty + `TERM=dumb` | 0 / 0 |
  | pipe + `--color=always` / pty + `--color=never` | 8 / 0 |
  | `NO_COLOR=1` + `--color=always` | 8 — an explicit flag overrides the variable |
  | `print("42")` under `--color=always` | 0 — a string is never colored |
  | `"n = " + toString(n)` under `--color=always` | 0 — the renderer's strings stay pure |
  | `--batch` `.out`, and `vl test`'s relayed output | 0 / 0 |

  **The palette is Node's, measured rather than chosen**: `util.inspect.styles` on node
  v24.11.1 gives `number`/`bigint`/`boolean` = `yellow` and `util.inspect.colors.yellow`
  = `[33, 39]` — the open/close PAIR, not `[0m`, so a reset never cancels a bold the
  surrounding shell set. On a pty `console.log(5)` emits `ESC[33m5ESC[39m` and
  `console.log("s")` emits `s`; VL's i32/i64/f32/f64/boolean sinks now do the same, and
  its string sinks (`__print_char__`/`__print_str_flush__`) do not. **One correction to
  the sentence above**: Node renders `null` in **bold** (`[1, 22]`) and `undefined` in
  grey — not dim/grey for null. Nothing is colored for it yet, because VL's print import
  family has no null sink; the measurement is recorded for Stage C2.

  Two details the implementation settled. **`--color` is resolved in the host for every
  subcommand**, not just `run`: `cli_pump` appends its answer as a synthetic argv entry
  for the VL formatter, and a caller's own `--color=` used to lose to it (the VL parser
  takes the last one it sees), so `vl check --color=always | less -R` resolved to
  `never`. It is now an override everywhere, and an unrecognized value is exit 2 rather
  than a silent "never". And **`vl test` relays a failing test's captured output plain**
  while coloring its own report: that output is pushed character by character into a VL
  string for the reporter, so an escape in it would be an escape inside a VL string
  value — the thing this section forbids — as well as a double-wrap.

  **Stage C2**: composite coloring rides the Stage 2 event walk. The two TS print-sink
  twins (`tests/support/runWasm.ts`, `playground/src/runtime.ts`) are a documented
  deferral, not an oversight: neither has a stdout to test for a terminal — one pushes
  into an array a test compares, the other into the DOM, where an escape renders as
  literal garbage. A colored playground wants spans, built off the same type split.

## Cycles (owner ruling, 2026-09-01)

The owner's stance, recorded verbatim in intent: **print/show and serialization should both
handle cyclic values, ideally; serialization additionally wants an unsafe fast variant**
(deserialization could have one too, or the format's own metadata makes it unnecessary).
What that costs, per surface:

- ~~**Can VL even build a cycle?** Yes in principle …~~ **MEASURED 2026-09-01, and the
  answer is yes in fact.** `type Node = { v: i32, next: Node | null }` checks and emits;
  `a.next = b; b.next = a` builds a two-node cycle and `a.next.next.v` reads back `1`; a
  self-loop `c.next = c` builds and traverses **(RUN 2026-09-01)**. The prerequisite this
  bullet filed for stage 2 is therefore CLOSED, and the seen-set below is load-bearing
  rather than hypothetical: a `show<T>` or `serialize<T>` that recurses naively over `Node`
  will hang on a program anyone can write today. Arrays/maps holding refs can also close a
  loop. Primitives cannot.
  (Note the contrast with fact 5: self-reference through a STRUCT type is fully supported;
  self-reference through a UNION ARM is the thing that still refuses. Cycles are a struct
  story, and structs are the part that works.)
- **The walk carries an identity seen-set.** The derive's shape-walk (stage 2) threads a
  visited set keyed on REFERENCE IDENTITY (`ref.eq`-class, not `==` value equality —
  value equality on a cyclic value is itself a divergence). Cost: ~~one hash-set insert per
  ref-typed node visited~~ **there is no hash set to insert into — see the ruling below;
  this sentence priced a data structure the language does not have**, zero for
  primitive-only shapes — a shape whose transitive
  fields hold no ref cannot cycle, and the emitter knows that statically per
  monomorphized shape, ~~so **acyclic-by-construction shapes skip the bookkeeping at
  compile time and pay nothing**~~ — **except that the emitter does NOT know it today: the
  predicate does not exist and is now stage-2 work (ruling D)**. That static skip is the
  first-class fast path; the
  unsafe variant below only matters for shapes that are ref-bearing but that the CALLER
  knows are acyclic.
- **`show`/`print` on a cycle: render a back-reference, never hang.** The failure mode
  today's languages split on: naive recursion (stack overflow — pre-ES2015 JSON), refuse
  (`JSON.stringify` TypeError), or render a marker (`[Circular]` — Node's
  `util.inspect`, Python's `...` in reprs). For a DIAGNOSTIC surface the marker is the
  only defensible answer: `show` exists to tell a user what a value is, and a value
  being cyclic is part of that. Proposed rendering: `<cycle →#N>` where `#N` labels the
  N-th ref node in walk order (labels printed only when actually referenced back).
- **VLB (the binary derive format): back-references in the format.** A ref-typed field's
  encoding gains one byte of tag: `0` null / `1` inline value / `2` back-ref, where
  back-ref carries the varint index of the target in ENCODE VISIT ORDER. Decode keeps
  the same table and patches on read — this is how a cyclic value ROUND-TRIPS, which
  "refuse on encode" and "marker on encode" both forfeit. Deserialization needs no
  unsafe variant under this design: the table is O(refs) either way, and a malformed
  back-ref index is a bounds check, not a cycle hazard (decode never walks user-provided
  topology unboundedly — the byte stream is finite and each byte is consumed once).
- **JSON: refuse on cycle, loudly.** JSON has no reference syntax; every convention
  (`$ref`, JSON-LD `@id`) is an application-layer schema that a consumer must also
  speak, which contradicts JSON's job here (interop with things that are not VL). The
  seen-set is already in the walk, so the refusal is free and precise ("cycle through
  field `next` of `Node`"). A consumer needing cyclic JSON is a consumer for VLB or for
  a schema of their own.
- **The unsafe fast variant: `serializeUnchecked<T>` (name per OQ-1's resolution).**
  Skips the seen-set for ref-bearing shapes the caller asserts are acyclic. On a lied-to
  call it diverges (wasm stack exhaustion trap — loud, not silent corruption, worth
  stating in the doc comment). Justified the same way `as` (vs `as?`) is: the checked
  form is the default spelling, the unchecked form is an opt-in with the hazard in its
  name. Measure before shipping it: if the static acyclic-shape skip already covers the
  hot callers (likely — message-passing payloads are usually trees of records), the
  unsafe variant may have no customer, and per std review discipline it then should NOT
  ship. File it as deferred-until-measured rather than building it alongside stage 2.

### The seen-set had nothing to be — RULED 2026-09-01 (decision D)

The bullets above were written assuming a hash set keyed on reference identity. **There is
none, and the static skip that made its cost moot does not exist either.** Both were
measured by the critique panel and re-run by its coordinator, cited here rather than
re-measured (`serde-critique-synthesis.md` finding 3 and §Verification):

- `Map`/`Set` keys are `string` or `i32` only — a `Node`-keyed map refuses with `A
  Node-keyed Map isn't supported yet — Map/Set keys must be string or i32`. WasmGC gives
  `ref.eq` and derives no integer from a reference, so there is nothing to hash.
- No transitive ref-free / acyclic predicate exists anywhere in `compiler/*.vl` (the grep
  finds only comments and `unionHasRefArrayArmSlot`, which is a slot question).
  `repTyScalarMask` is the right template and the wrong question.
- The fallback a walk would otherwise get — a linear-scan seen-set — is **204 ms at 16,000
  nodes, 70× the VLB encode it protects**, and it degrades smoothly, so no small fixture
  will ever show it.

**The ruling: build the static acyclic-shape predicate (option 1), and keep the depth cap as
the floor beneath it.** A shape is acyclic-by-construction if it is transitively ref-free, or
ref-bearing with no back-edge in the type graph; those shapes skip the seen-set entirely at
compile time, which is most configs and most message payloads. It is compiler work with no
new language surface, and it is what makes the §Cycles cost argument true rather than
assumed. **Land the perf critic's timing probe with it** — walk a ref-bearing shape at N and
4N nodes, fail above 6× — under `scripts/capability-probes/`, so the day a seen-set does land
for the shapes that need one, it cannot be quadratic unnoticed.

**Reference-identity keys were ruled SEPARATELY — and the answer is YES** (OQ-11, identity
ruling 2026-09-01). The refusal's own wording (`isn't supported yet`) left open a language
question this document had no standing to answer, and the language answered it:
`IdentitySet<T>` is a concrete type keyed by `===` (`docs/identity-design.md` §0, ROADMAP A15
item 4), so the seen-set on the non-acyclic path is ordinary code — a flat `ref.eq` scan first,
the per-object serial only when a program measures the scan as a problem, same API either way.
Stage 2 still does not wait on it: the static predicate is sufficient for the shapes serde
actually walks, and the seen-set getting cheaper never makes the predicate wrong.

**`serializeUnchecked` stays deferred**, unchanged — the static predicate is exactly the
thing that decides whether it ever has a customer, so it cannot be priced before the
predicate exists.

## Deep `is` / `as` over a `Json` value — the read's second phase is an OPERATOR (owner direction, 2026-09-02)

*Owner, on `json-design.md` §6 question 1 (accessor helpers): "why would it have to be one
`is` test per level? why can't you do a complex, nested type on the right hand side? I say
get that working and then (a) is fine for now until we have an actual consumer."*

**What `is` is today, measured (seed 0ff2587f, `VL_STD` pinned).** `x is T` over a union is
an ARM-MEMBERSHIP test: the checker asks whether `T` is one of the union's registered
members and the emitter compares the box's TAG against that member. It never looks inside
the value. Against `type Json = null | boolean | f64 | string | Json[] | { [string]: Json }`:

| RHS spelling | value under test | check | run |
| --- | --- | --- | --- |
| `r is Json[]` | `["x"]` | ok | `true` (a member) |
| `r is { [string]: Json }` | any map | ok | `true` (a member) |
| `r is { users: string[] }` | any map | **refused** — `` `is` check type '{users:string[]}' is not a variant of Json `` | — |
| `r is Cfg` (`type Cfg = { server: { port: f64 } }`) | any map | **refused** — same sentence | — |
| `r is string[]` | `["xyz"]` | **accepted** | **`false`** — and the arm reads `r[0].length`, narrowed to `string[]`, never reached |
| `r is { [string]: string }` | a map holding only strings | **accepted** | **`false`** |
| `r is { [string]: Json[] }` | a map holding only lists | **accepted** | **`false`** |

So "one test per level" is not a rule anyone chose — it is the shape of a tag test. A
STRUCT spelling on the right is refused because a struct is not an arm; a REFINEMENT of an
arm (`string[]` under `Json[]`, `{[string]: string}` under `{[string]: Json}`) is admitted
by the checker's assignability-based membership test and then answered `false`
unconditionally by the emitter, because no registered tag matches the spelling. The last
three rows are a check-clean silently-wrong answer — `["xyz"] is string[]` printing `false`
is a wrong answer under any reading — filed as **D1035**; the build below is its fix.

**What it should mean.** `r is T` where `r: Json` and `T` is not an arm but a JSON-SHAPE
type is a **runtime shape walk plus conversion**: the emitter derives, per `(Json, T)` pair
and memoised per `T`, a predicate-and-builder that walks the tree against `T` and, on
success, produces a `T`-repped value. Inside the arm `r` IS a `T` — a real struct with
fields, a real `string[]` — so a consumer reads `r.server.port` and never walks the tree.

```vl
import { parseJson } from "std:json"
type Cfg = { server: { host: string, port: i32 }, tags: string[], note: string | null }

const doc = text.parseJson()        // Json | JsonError
if doc is Cfg {                     // deep walk; `doc: Cfg` in the arm
  print(doc.server.port + 1)
}
const cfg = doc as Cfg              // narrow-or-propagate, in a fn returning `… | JsonError`
const cfg2 = doc as? Cfg            // Cfg | null
const cfg3 = doc as! Cfg            // Cfg, or a trap with the path in its message
```

This is the two-phase read this document already commits to — "`deserialize` is a
two-phase read (text → `Json` → shape) whose first phase is reusable" (§Stage 1) — with
the SECOND phase spelled as the operator the language already has, instead of as a
`deserialize<T>` intrinsic. It is the same emitter shape-walk Stage 2 needs (§Approach 2),
reached through `is`/`as` for the JSON source, and the OQ-1 (b) intrinsic remains the
spelling for the BINARY source and for `serialize`, where no operator fits. The wire
policies are inherited wholesale, not re-decided: unknown key → not a match, exact
case-sensitive field names, duplicate keys are already a parse error (decision A);
`i64` fields read a JSON number (decision B); a union `T` decides its arm by first token
or required key set (OQ-7 as amended). The vocabulary of a JSON-shape `T`: `null` /
`boolean` / `f64` / `i32` / `i64` / `string`, literal unions of strings, `T[]`,
`{ [string]: T }`, structs, unions of those, and recursive aliases (`x is Json` is
trivially true). Closures, `Buffer`, non-string-keyed maps and newtype brands refuse at
the CHECKER, blaming the `is` site's `T` ("`Cfg.cb` is a closure; a JSON shape cannot hold
one"), never a std file.

**Four sub-rules, each with a recommendation; the owner rules or lets them stand.**

- **S1 — the narrowed value is a COPY, and `is` rebinds.** A `{[string]: Json}` map and a
  `{ server: … }` struct are different wasm reps, so the arm cannot be a view; the walk
  BUILDS the struct. Narrowing already changes rep silently (a value-union arm unboxes its
  payload); this is the same move on a container. Recommend: document it as "JSON is
  data, not identity — mutating `doc` inside the arm does not write back to the tree", and
  let `as` be the spelling that makes the new binding visible when a reader wants it.
- **S2 — `i32` / `i64` fields accept an INTEGRAL, IN-RANGE number and nothing else.**
  `8080` reads into `port: i32`; `80.5`, `3e9`, `NaN` do not match. This is exactly the
  `asExactI32` predicate `json-design.md` §6 question 2 asks for, so the two land on one
  definition. Recommend: exact-or-fail; a consumer that wants truncation declares `f64`
  and truncates in VL, where the loss is spelled.
- **S3 — absent key ≠ present `null`, and `T | null` matches only the latter.** Decision A
  already rules the WRITE side ("always emit `"f": null`, never omit it"); the read side is
  its mirror, and the reason is the same — `{x} | {x, y}` is only decidable when absence
  is a fact. Recommend: keep the mirror; a config that wants optional keys declares the
  field `T | null` AND writes the null, or reads through a `{[string]: Json}` catch-all.
  The alternative (absent reads as `null`) is the JS convention and is what most config
  readers want, so this is the one most worth the owner's eye.
- **S4 — `as` propagates a `JsonError`, not the remainder.** The trio's rule for a union is
  "propagate the arms `T` excludes"; for a shape test the excluded remainder is the whole
  tree, which is useless to a caller. Recommend: `doc as Cfg` in a function returning
  `… | JsonError` propagates `{ at: 0, kind: "shape", path: "/server/port", msg: "expected
  i32, got 80.5" }` — `path` is why `JsonError` has that field, and `"shape"` joins the
  reserved kinds (`cycle`, `missing`) in `std:json`'s header. `as!` traps with the same
  message; `as?` is `null`; `is` is the boolean and says nothing about why.

**Why this dissolves the helper question.** `jsonPointer` / `jsonGet` exist to walk a tree a
consumer cannot name the shape of. A consumer that CAN name it — every config reader,
every message payload — writes the shape once and never walks. What is left is the
genuinely dynamic consumer (a JSON formatter, a jq-alike, a schema validator), and none
is in the tree; when one arrives it will say which walker it needs. Hence (a) for v1.

**Sequencing.** It is Stage 2's JSON half brought forward: a checker predicate ("`T` is a
JSON shape", reusing the acyclic/ref-free predicate ruling D already schedules) and an
emitter walk keyed on the RHS type at the `is`/`as` site. Position matrix before narrowing
the checker — `is` in an `if`, `while`, `&&` chain and `!`, `as` at binding / return /
argument / assignment — per the D965 lesson. Standing gap it closes: D1035.

## Open questions — the owner's answers, 2026-09-01, and what each one still leaves open

*The owner answered all seven on 2026-09-01. Their words are quoted as ruling INPUTS —
what is recorded as ruled is marked so; everything else is this document's analysis of what
the answer still leaves to decide, expanded at the owner's request ("not enough detail").*

*A SECOND ROUND ran the same day, after the three-lens critique
(`docs/internals/serde-critique-synthesis.md`). It **reversed OQ-6**, **amended OQ-7**, and
added **OQ-8** (unknown-field policy), **OQ-9** (`i64` on the wire) and **OQ-10** (VLB shape
fingerprint) — all three RULED on arrival — plus **OQ-11**, which is open and is a LANGUAGE
question rather than a serde one. The owner's words for the whole second round were
"Recommendations all sound reasonable to me", so each new entry records the recommendation
it adopted and the argument that earned it, not a fresh deliberation.*

### OQ-1 — surface spelling. **RULED IN PART: "no builtin, ideally."**

Recorded. `serialize<T>`/`deserialize<T>` as ambient compiler builtins is OFF the table,
and the ruling is consistent with the day's other one: the ambient `toString` builtin was
retired the same day and its name given to `std:fmt`'s export, on the argument that there
should be exactly one of a name and it should live at the std surface, reached by an
ordinary import (`DECISIONS.md`; `std/fmt.vl`'s header carries the measurement trail). A
serde builtin would have re-created the thing that was just removed.

**What is still open is the sub-choice**, and it is real because "no builtin" does not by
itself say where the compiler's shape-walk attaches:

**(a) A derive marker on the TYPE.** `derive type Move = {…}`, or an attribute, marking a
type as serializable so the emitter generates codecs for it. *For:* the Kotlin/Swift model,
familiar; the checker's serializability predicate has one obvious place to run and one
obvious place to report from ("`Move` is marked serializable but field `f` is a closure");
codegen is bounded by what is marked, so a program pays for what it asks for. *Against:*
**VL types are structural**, and a marker is nominal by nature — `Move` and its unaliased
inline spelling `{player, at, note}` are THE SAME TYPE, so a marker on one alias either
leaks to a spelling that never asked for it or fails to. That is not a wrinkle, it is a
category error, and fact 3/fact 4 both showed the same day that VL's identity is the sorted
field list rather than any name attached to it. It also matches nothing VL has: there is no
attribute syntax, and inventing one for this is a language feature bolted on for a library.

**(b) std-shimmed intrinsics — `import { serialize } from "std:serde"`, where the compiler
recognizes the import.** The function is spelled in a std module and reached by an ordinary
import, so it reads exactly like `toString` or `encodeBase64`; the emitter recognizes the
bound symbol and generates the per-shape walk in place of an ordinary call. *For:* **the
precedent exists and shipped this week.** A template literal's hole binds ABSOLUTELY to
std's renderer through one constant, `TPL_RENDER_EXPORT` in `driver.vl`, with the module
merge rewriting an unspellable name onto the merged symbol (`DECISIONS.md`, "A template
literal's stringifier is bound ABSOLUTELY"; `docs/constraints-design.md` §1). That is the
same mechanism this needs, already built and already reasoned about — a compiler-known std
symbol, not an ambient name. It keeps the surface at the std tier where the owner's ruling
puts it, it costs no new syntax, it is namespaced (a program that never imports `std:serde`
cannot accidentally reach it, and a program that shadows the name gets the same hard
`Duplicate binding` refusal `toString` gets), and per-type generation is driven by USE
rather than by marking, so an unused type costs nothing. *Against:* the import is a
half-truth — it looks like a call to a VL function and is not one, so "go read the source"
fails; the std module needs a body that is either a stub or a slow real implementation
(there is no shape-generic VL, fact 1, so a real body is impossible and it must be a
declaration-only export or a documented intrinsic shim); and the checker's errors must be
careful to blame the CALL SITE's `T` rather than a std file the user never opened.

**Recommendation: (b), std-shimmed intrinsics in a `std:serde` module.** It is the only
option that satisfies the ruling without inventing syntax, it reuses a binding mechanism
that shipped and has a decision record, and it puts serde in the same place as every other
capability a program has to ask for. The half-truth objection is answerable by making the
std module's declarations carry the real documentation (the way `std/fmt.vl`'s header does
the arguing for `toString`), which is where a reader looks anyway.

### OQ-2 — which order union ARMS get wire indices. **Owner: "not enough detail." Full brief.**

**The question.** VLB encodes a general union as a u8 arm index plus a payload (§Approach 2).
An index is a number; the type is a SET of members; something has to impose an order. If two
spellings of the same type can disagree about that order, the same value gets two different
byte strings and a decoder built against one spelling silently misreads the other's bytes —
not an error, a wrong value.

**Why this is a real hazard here and not a theoretical one.** Two measurements, both filed:

1. **Declaration order carries no type identity.** `type A = i32 | string` and
   `type B = string | i32` are freely interchangeable at every position — a value of `A`
   passes into a function taking `B` and narrows correctly, and vice versa
   **(RUN 2026-09-01)**. So "the order the members were written" is not a property of the
   type; it is a property of one spelling of it, and the compiler already treats the two
   as one type.
2. **Canon rendering IS spelling-dependent, measured.** The destringify census's finding
   (B229, `docs/internals/destringify-types-program.md`): with `type K = "a" | "b"`, an
   annotation spelling `K` canons to `K` and `nameToTy("K")` returns the literal union
   unchanged, while the IDENTICAL arena type spelled inline canons to `string`. **The same
   type canons two different ways depending on the spelling it arrived in**, because canon
   is a name→name rewrite whose result is a function of the NAME. Its own conclusion: "the
   arena does not hold the input that decides the answer." So any rule that sorts members
   by their canonical rendered spelling inherits that instability.

**The concrete two-alias disagreement.** Suppose the rule is "sort members by canonical
rendered spelling". A module declares `type Tag = K | i32` with `type K = "a" | "b"`; a
second module spells the same type inline as `("a" | "b") | i32`. Under canon the first
renders its members as `K` and `i32`; the second renders them as `string` and `i32`. Sorted:
`[K, i32]` gives one order, `[i32, string]` gives the other — **arm 0 in one build is arm 1
in the other**, and a `Tag` encoded by the first module decodes as the wrong arm in the
second. Both modules type-check, both agree the two types are the same type, and nothing
anywhere reports a disagreement.

**The options.**

| rule | stable across spellings? | cost | fails when |
| --- | --- | --- | --- |
| **declaration order** | **NO** — measured: `A`/`B` above are one type with two orders | free | any two aliases exist; the failure is silent |
| **sorted by canonical rendered spelling** | **NO** — measured: B229, canon is a function of the NAME | free | an alias is used at one site and its expansion at another; silent |
| **sorted by a structural fingerprint** (recursive, over the member's own structure — for a struct member, its sorted FIELD NAME list and each field's fingerprint; for a scalar, its width; for a container, its kind plus its element's fingerprint) | **yes, by construction** — the fingerprint reads the TYPE, never a spelling | one recursive function in the emitter, plus a total order over fingerprints | a genuine structural ambiguity: two members that are structurally identical, which is not a union VL admits |
| **explicit user numbering** (protobuf tags: `type T = A = 1 \| B = 2`) | yes | new syntax; every union in every program must carry it; unnumbered unions become a second class | never silently — but it prices every user for a problem most of them do not have |

**Recommendation: the structural fingerprint, and it is not a new idea in this codebase — it
is fact 3 one level up.** The emitter already orders struct FIELDS by name rather than by
declaration, and fact 4's move on 2026-09-01 showed that sorted order is load-bearing at the
wasm type level: width subtyping succeeds exactly when the narrow field list is a sorted
PREFIX of the wide one, and reversing the source's declaration order changes nothing
**(RUN 2026-09-01)**. Union members should be ordered the same way and for the same reason:
by something read off the type, never off the spelling that reached the emitter. Concretely,
compute a fingerprint per member — a canonical string or an interned hash built recursively
from *structure only*, with struct fields visited in sorted-name order and NO alias names
anywhere in it — and sort the members by it.

**The failure it still admits, stated rather than hidden.** A fingerprint is spelling-free,
so it cannot distinguish two members that are structurally identical — and where a NEWTYPE
distinguishes them, the fingerprint must either include the brand (reintroducing a name, and
therefore the spelling question, at exactly one place) or refuse. That interacts with OQ-6
and the two should be answered together: ~~if newtypes are refused at the wire (OQ-6's
recommendation), the fingerprint never sees one and the ambiguity cannot arise~~ **OQ-6 was
RULED the other way on 2026-09-01 (newtypes accepted, ERASED to their base at emit), and the
property survives for the opposite reason: an erased newtype IS its base structurally, so the
fingerprint never sees a brand either way. What the reversal does cost is that two union
members differing ONLY by brand are structurally identical at the wire — and that union is
refused by this section's own ambiguity rule, loudly.** The second
admitted failure is evolutionary and unavoidable under any structural rule: **adding a member
to a union renumbers every member that sorts after it**, so index-form bytes do not survive a
union edit. That is not a bug in the ordering rule, it is schema-implicit encoding doing what
it does (§Approach 2, evolution), and OQ-5's resolution below is where it is priced.

### OQ-3 — NaN policy in VLB. **Owner: "not enough detail." Full brief.**

**The question.** A `f64` field holding a NaN: does VLB write its 64 bits verbatim, write a
canonical NaN, or refuse?

**First, the premise in the original OQ was UNVERIFIED and is now measured.** That text said
"computed-NaN payload bits are engine-nondeterministic". The wasm spec does permit that —
an arithmetic NaN result may carry any payload with the quiet bit set — but VL ships on two
engines and **they agree**, measured 2026-09-01 on the same built module:

| value | wasmtime (Rust host), as `f64bits` | V8 (Deno/TS host) |
| --- | --- | --- |
| `0.0 / 0.0` | `-2251799813685248` (`0xFFF8000000000000`) | **identical** |
| `f64fromBits(9221120237041090565)` (`0x7FF8…0005`) | round-trips exactly | **identical** |
| that value `+ 1.0` | payload **propagated**, bits unchanged | **identical** |
| `-1.0 * 0.0 / 0.0` | `-2251799813685248` | **identical** |

So: **VL programs CAN observe payload bits today** (`f64bits` is a real intrinsic, used by
`std:fmt` itself), a hand-built payload SURVIVES arithmetic, and the two engines produce the
same canonical NaN for a computed one. The nondeterminism is *spec-permitted*, not
*observed* — which changes the weight of the arguments below, and is exactly the kind of
claim that should be re-measured rather than quoted (a third engine, or a future wasmtime,
may differ; the spec allows it).

**The scenarios that decide it.**

- **Content-addressing / hashing.** Needs one value → one byte string. Bits-verbatim gives
  that *for a given NaN value*, and NaN's problem for hashing is not the encoding, it is that
  `NaN != NaN`, so two "equal" values were never equal to begin with. Canonicalizing makes
  the bytes stable across differently-produced NaNs, which is what a content-addressed store
  actually wants — but it does so by declaring all NaNs the same value, which VL's own `==`
  does not.
- **Record/replay determinism.** This is the strongest case and it points the other way.
  Bits-verbatim replays exactly: whatever the program had, the replay has. Canonicalizing
  **cannot round-trip a computed NaN's identity** — a program that stashed a payload (a
  tagging trick, a sentinel, a debugger marker) gets a different value back, silently, and
  the measurement above shows payloads DO survive arithmetic in VL, so this is reachable.
- **Cross-engine.** Measured above: no disagreement between VL's two hosts today, on either
  a computed or a hand-built NaN. This scenario does not currently discriminate. Note the
  asymmetry with the TEXT path, which DOES diverge cross-host (the 14-of-50,000 tie-break
  bug, fact 6) — the bits path is the *more* portable one right now, not the less.

| policy | round trip | stable bytes for equal-ish values | cost | who does this |
| --- | --- | --- | --- | --- |
| **bits verbatim** | exact, always | no (two NaNs differ) | zero | bincode; any bit-level format |
| **canonicalize on encode** | lossy for payloads | yes | one branch per f64 write | CBOR §4.2's deterministic profile canonicalizes NaN to `f16 0x7e00` |
| **refuse NaN at encode** | n/a | n/a (no NaN on the wire) | a runtime error path in a pure function | borsh — as recalled, stated with that hedge, to keep hashing sound |
| **JSON's forced answer** | n/a | n/a | — | protobuf's JSON mapping spells it `"NaN"`; plain JSON has no spelling at all |

**Recommendation: bits verbatim, unchanged from §Approach 2's proposal — but now argued from
measurement rather than from an unverified premise.** VLB's stated job is exactness and
determinism for same-build message passing and application-level snapshot; both want the
value back that went in, and the engine-divergence worry that would have justified
canonicalizing is not observed on the engines VL runs on. Refusing (borsh's posture) is
wrong for VL specifically: `NaN` is a reachable, printable value here (fact 6), so refusing
it would make a legal program fail at encode — a clause-2 shape this repo rejects elsewhere.
**If a content-addressing consumer ever appears**, it wants canonicalization of MORE than
NaN (sorted maps, OQ-4) and it should get one transform that does all of it, not a flag on
encode — see OQ-4. And the JSON rendering answers this separately and does not inherit it:
JSON has no NaN, so `toJson` refuses it at encode, loudly, as §Approach 2 already says.

### OQ-4 — a canonical (sorted-map) mode. **Owner: "pros/cons?"**

**For.**
- **Content addressing.** Two maps built by different insertion paths, holding the same
  entries, hash to the same digest. This is the only argument that genuinely needs it, and
  it is a real one — a content-addressed cache or a Merkle structure over VL values cannot
  work without it.
- **Dedupe.** The same, one layer up: a store that keys on the encoding collapses
  equal-content maps into one object.
- **Stable golden tests.** A fixture that pins bytes does not churn when unrelated code
  changes the insertion order of a map it builds.

**Against.**
- **VL map order is SEMANTIC, and that is measured, not assumed.** `.keys()` yields
  insertion order **(RUN 2026-09-01)**, and `Set` is fixture-pinned to it
  (`tests/cases/sets/basics.vl`). A program can and does observe it. So a sorted encoding is
  **a lossy projection, not an encoding**: decode hands back a map that iterates differently
  from the one encoded, which means `encode`∘`decode` is not the identity — precisely the
  "silently lossy operation" `docs/internals/std-api-review.md` exists to catch.
- **Two modes is the boolean-parameter smell.** `serialize(v, canonical: true)` is the shape
  the std review rubric names explicitly, and it is worse than usual here because the two
  modes have DIFFERENT round-trip properties: one is lossless and one is not, so a caller
  who passes the flag through a variable cannot reason about their own function's contract.
- **Cost.** Sorting a map at encode is O(n log n) with an allocation, on the hot path of the
  use case (b) VLB exists for, paid by every caller to serve a consumer that does not exist.

**The options.**

| shape | round trip | API surface | notes |
| --- | --- | --- | --- |
| **never** | lossless, one mode | smallest | content addressing has no answer at all |
| **`canonicalize<T>(v: T): T` — a separate TRANSFORM** | encode stays lossless and single-mode; the LOSS is where the user wrote it | one more std name, no new mode | `serialize(canonicalize(v))` is the content-addressing spelling, and it reads as what it is: you asked for a different value |
| **an encode flag** | two contracts behind one name | boolean parameter | the rubric's named smell; also forks every fixture (see OQ-5's test-matrix argument) |

**Recommendation: NEVER an encode flag; if anything, the transform — and not until a
consumer names itself.** `canonicalize<T>` has the property the flag lacks: it makes the
lossy step VISIBLE and ATTRIBUTABLE at the call site, so `serialize` keeps exactly one
contract ("one value, one byte string, and decode gives the value back"). It also
generalizes — a content-addressing consumer wants sorted maps AND canonical NaN (OQ-3) AND
whatever the next such question is, and a transform can grow to cover all of them while an
encode flag would need one boolean each. Defer building it; record the shape so that the day
a consumer appears, nobody reaches for the flag.

### OQ-5 — supporting both a compact (index) and a value form. **Owner's reasoning is the answer.**

The owner: *"compact only makes sense for storage/messaging with yourself, since indexes are
compile specific. What's the cost to support both?"* That is exactly right about where each
form belongs, and the second half deserves a concrete number.

**The nominal cost is trivial and the real cost is not that.** A mode byte in the VLB header
is one byte and one branch — the header already carries magic + format version (§Approach 2,
evolution (ii)), so there is a field for it. What "support both" actually costs:

- **The test matrix doubles on every union fixture.** The per-rep-family fixture set §Approach
  2 commits to (niche, value-tagged, boxed, litunion, `u8[]`, i32/string maps, recursive)
  gets a second column wherever a union is reachable, which is most of them, and every future
  rep family arrives owing two fixtures instead of one. That is the recurring cost, it is
  paid by everyone forever, and it is the one that actually decides.
- **The evolution rules FORK, and the fork is user-visible.** Value form tolerates arm
  reordering and arm insertion (the literal `"file"` still reads as `"file"`); index form
  tolerates neither, because OQ-2's structural ordering renumbers on insert. So "can I add a
  variant?" has two answers depending on a byte the user set at encode time, and a document
  that says "it depends" about schema evolution has failed at its job.
- **A third, smaller one:** two forms is two things to be canonical about, so OQ-2, OQ-3 and
  OQ-4 each acquire a second answer.

**The resolution the owner's own sentence points at, and this doc adopts it: it is not a
switch, it is ONE FORM PER FORMAT.** The two formats already have disjoint constituencies,
and they line up exactly with the two use cases §The question named:

- **VLB → index form.** Its stated home is use case (b), message passing between VL
  instances, where "both ends are the same build" is the design premise (concurrency-design's
  separate-instances ruling is what makes serialization load-bearing there at all). Compile
  -specific indices are *correct* there, which is the owner's point.
- **JSON → value form.** Its home is (a): config files, host IO, programs that are not VL,
  hand-editing, and cross-version reads. `"file"` on the wire, never `0`.

Under that split, "both" falls out **at nearly zero cost**: no mode byte, no branch, no
doubled fixture column — each format has one form, each form has one evolution story, and
the choice is made by picking the format, which the user is making anyway for other reasons.
Where it does cost something is in the §Recommendation staging, and honestly: it means the
JSON rendering (stage 3) is not merely "a second rendering of the same walk" for unions —
the walk is shared, the union LEAF differs. That is a known, bounded difference and it is
better than a mode byte, because it is a difference between two named formats rather than
two behaviours of one.

**What remains open, and it is small:** whether VLB's header keeps a reserved mode bit
anyway, so that a future consumer who wants value-form binary can have it without a format
version bump. Cheap insurance; costs one documented reserved bit and no code.

### OQ-6 — newtype posture. ~~**Owner: "can refuse (defer) maybe? Not super opinionated."**~~ **REVERSED AND RULED 2026-09-01: newtypes are ACCEPTED, transparently.**

**The ruling (decision F).** A `new` type serializes as its BASE — erased at emit, brand kept
by the checker. No refusal, no opt-in to design, nothing deferred. The morning's posture
below is kept in full because its argument is the one that was overturned, and the reversal
is only legible beside it.

**Why it flipped, in one sentence: the refusal is a capability refusal, and it is
anti-correlated with its own hazard.** Four things the consistency critic put beside each
other (`serde-critique-consistency.md` §3, re-run in the synthesis's §Verification — not
re-measured here):

- **It refuses the domain's centre.** `F32Base = new i32` is a newtype over `i32`, and `i32`
  is the most ordinary thing a wire carries. "Refuse until a consumer opts in" reads as a
  narrow deferral and is in fact a refusal of every branded scalar in the program.
- **It fires exactly where the hazard is absent, and misses it where it is present.** From
  ONE std file it refuses `F32View`/`F32Base` — branded, and the branding is the only reason
  it can see them — while accepting `Buf`, a plain alias for the *same raw address*. The
  provenance hazard the refusal was built for belongs to the ADDRESS, not to the brand, so
  the rule catches the spellings that told the truth about themselves and waves through the
  one that did not.
- **A newtype-branded struct field RUNS today** (`base: 4 as F32Base` prints `8`). The
  refusal would be *removing* a working program from the wire, which is the shape this repo
  refuses under clause 2.
- **It is cheap now and permanent later.** Accepting transparently can be narrowed the day a
  consumer wants brand-checking on the wire; shipping a refusal into a version-locked std and
  taking it back is the move there is no story for.

**What still needs a rule, and it is the `Buf` observation, not the newtype one.** A plain
alias over a linear-memory address encodes an integer that is meaningless in another
instance, and nothing marks it. That is a real hazard and it is NOT solved by anything here —
it wants a rule about ADDRESSES (a `std:buffer` type is not wire-portable, whatever it is
spelled as), which is a separate decision with no forcing customer yet. Filed as the open
remainder of this OQ.

**The OQ-2 interaction inverts with it.** OQ-2's fingerprint recommendation noted that
refusing newtypes removes the one case where a structural fingerprint would have to look at a
name. Accepting them transparently keeps that property for a different reason: an erased
newtype IS its base structurally, so the fingerprint never sees a brand either way. What
accepting does cost is that two members of a union which differ ONLY by brand are
structurally identical at the wire — and that union should be refused by OQ-2's own
ambiguity rule, loudly, rather than encoded ambiguously.

*The superseded posture, kept for its argument — everything from here to the end of OQ-6 is
what was overturned, including its closing note about OQ-2:*

~~Recorded as the default posture:~~ **REFUSE `new` types at the wire until a consumer opts in.**

The argument for refusing is the one §Approach 2 already made — a newtype usually brands
*provenance*, and provenance does not survive a trip. `F32Base` (`std:buffer`) is a
newtype over `i32` that names a linear-memory ADDRESS in THIS instance's memory; encoding it
writes an integer that is meaningless anywhere else, and decoding it manufactures a branded
address that was never valid. A silent encode there is the exact class of quiet lie this
document refuses elsewhere (a `null` for a NaN, a sorted map for an insertion-ordered one).
Refusing is loud, precise ("field `base` of `F32View` is the newtype `F32Base`; a brand does
not survive a wire trip"), and it is a compile-time refusal rather than a runtime one, so it
costs nothing at run time.

Filed in house style as **deferred-until-a-customer**: the refusal ships with stage 2, and
the opt-in (whatever its spelling — a `serialize`-visible marker, a wrapper, an explicit
unbrand at the call site) is NOT designed now, because designing an opt-in for a customer
who has not appeared is the speculative-API smell the std rubric names. When one appears,
they bring the requirement with them, and the refusal's message is where they will find this
paragraph. Note the interaction recorded under OQ-2: refusing newtypes also removes the one
case where a structural fingerprint would have had to look at a name.

### OQ-7 — JSON's union rendering. **Owner's position, quoted.**

The owner: *"JSON is by nature schemaless; forcing it into actual shapes happens at the end,
not in the data."*

**That is the UNTAGGED direction, and this doc adopts it.** The wire carries plain JSON —
a string is a string, a number is a number, an object is an object — and the READER's
expected type does the shaping. `fromJson<Shape>` knows what it is looking for; the bytes do
not have to say. Neither an arm-index wrapper (`{"_arm": 2, "v": …}`) nor a discriminant
field (`{"kind": "circle", …}`) appears in the output, so a non-VL consumer sees ordinary
JSON and a hand-written config file is writable by a human who has never heard of VL.

**The precedent, including its known footgun.** serde-rs's `#[serde(untagged)]` does exactly
this and is widely used; its documented failure is that deserialization tries each variant in
declaration order and takes the first that succeeds, so **two structurally overlapping arms
silently pick the wrong one** — a `{"x": 1}` that matches both `A{x}` and `B{x, y?}` gets
`A`, forever, and the program is simply wrong. That is a runtime, per-value, silent failure.

**The analysis, split by whether the arms are distinguishable.**

- **Structurally disjoint arms are unambiguous and untagged is strictly better.** A union of
  a string, a number and a struct — `string | f64 | Circle` — reads off the JSON token type
  with no ambiguity at all: `"x"` is the string arm, `1.5` is the number arm, `{…}` is the
  struct arm. This is the common case for config data and it is exactly the owner's instinct:
  the shape is recovered at the end, by the reader, from data that never had to carry it.
  Two objects with **disjoint field-name sets** are also distinguishable, by the same
  argument one level down.
- **Overlapping-struct arms are genuinely ambiguous.** Two arms sharing all field names and
  types are indistinguishable in the data, full stop — no reader can recover which one the
  writer meant, because nothing distinguishes them. (Note this is narrower than it sounds in
  VL: two struct arms with the *same* field names and types are the SAME structural type and
  cannot both be members of one union. The reachable case is *overlap* — `{x}` against
  `{x, y}` where `y` was absent or null, or `{x: i32}` against `{x: f64}` where the JSON
  number `1` fits both.)

**The options for the ambiguous case.**

| option | when the ambiguity is caught | cost |
| --- | --- | --- |
| **first-match order** (serde-rs) | never — a wrong value at run time, per value | zero; and it reintroduces declaration-order dependence, which OQ-2 measured is not a property of a VL type |
| **require a discriminant field for ambiguous unions only** | compile time, at the DERIVE | the user must add a field to their type to satisfy the serializer — the type serves the format |
| **REFUSE AT DERIVE TIME when two arms are not distinguishable** | compile time, at the derive | the user must change the union or write a hand codec — but they learn at build time, once |

**Recommendation: untagged, plus derive-time ambiguity refusal.** This is a compile-time
answer VL can give that serde-rs structurally cannot: **the deriver sees the whole union at
once**, at the monomorphized shape, so it can decide distinguishability as a static property
and refuse the union rather than the value. serde-rs cannot, because its derive runs per type
without the closed-world view and its untagged decoder is assembled from independent
`Deserialize` impls. The refusal is precise and actionable ("arms `{x: i32}` and `{x: f64}`
of this union are not distinguishable in JSON: a number matches both"), it fires once at
build time rather than silently per value, and it leaves the common disjoint case completely
free of ceremony — which is the whole of the owner's position.

The compatibility note stands from the old text and applies to whatever is chosen: once
`toJson` emits a shape, that shape is a compatibility surface. Untagged has the useful
property that the surface is *the user's own type*, with nothing of VL's added to it — so
there is less to be stuck with.

#### AMENDED AND RULED 2026-09-01 (decision C): the refusal rule is FIRST TOKEN or REQUIRED KEY SET

"The deriver decides distinguishability statically" is the right shape and the wrong size.
Over recursive types that predicate is **tree-automaton intersection emptiness** — decidable
in principle, unpredictable to a user, and expensive to implement correctly. It is replaced
by one rule a user can hold in their head:

> **Two arms of an untagged union are distinguishable iff they differ in their FIRST JSON
> TOKEN, or (both being objects) in their REQUIRED KEY SET. Anything else is refused at the
> derive.**

What that buys, beyond decidability: **no backtracking** (the reader commits on the first
token, or on the key set it has after one object pass — never O(arms × value) with a
speculative parse per arm), **streaming stays possible**, and the refusal message can name
the two arms and the token they share. And it admits `deserialize<ConfigV1 | ConfigV2>` —
the plan's own migration idiom, which the general predicate rejected — **exactly when the
versions differ in a required key**, which is the honest condition: two config versions that
differ only in an optional field genuinely cannot be told apart, and a reader that guesses is
the serde-rs bug this whole section exists to avoid.

**Two overlaps the list above misses, both of which RUN today** (measured by the critique
panel, cited from `serde-critique-synthesis.md` §Verification, not re-measured here — both
narrow correctly in VL, which is what makes them invisible until the wire is involved):

1. **An open map arm overlaps EVERY object arm.** `{x: i32} | {[string]: i32}` narrows fine
   in VL (`3`), and on the wire `{"x":1}` matches both — the map arm's required key set is
   empty, so it is a subset of every object arm's. Under the ruled rule this is refused, and
   correctly: no first token separates them and no key set does either.
2. **JSON's single number type merges `i32 | f64`.** The bullet above notes `{x: i32}`
   against `{x: f64}`; the same collapse happens at TOP level for a bare `i32 | f64` union,
   where `1` is both. The first-token rule catches it (both arms are `number`), which is the
   rule doing its job rather than a gap in it.

The alternative, stated so the choice is real: keep the general predicate and accept that it
will under-approximate somewhere, shipping serde's silent-wrong-arm bug class into a language
whose whole gate discipline is built against silent wrongness. Declined.

### OQ-8 — unknown fields, and its three siblings. **RULED 2026-09-01 (decision A).**

Added by the critique round, which called it "the largest single gap in the OQ list" — this
document had a position on union arms and NaN bits and no position at all on what a reader
does with a field it was not expecting. Four sentences, all adopted:

1. **Reject unknown fields.** A key in the JSON that the target type has no field for is an
   error, named and located, not a silent skip.
2. **Exact, case-sensitive field matching.** `userName` does not read `username`, `UserName`
   or `user_name`. No case folding, no separator normalisation, no aliasing table.
3. **Reject duplicate keys.** `{"x":1,"x":2}` is an error rather than last-wins or
   first-wins.
4. **Always emit `"f": null` for a `T | null` field, never omit it.** A present null and an
   absent key are different documents and only one of them is what the value said.

**Why.** Every one of these is a named Go v1 regret (silent unknown-field drops, case-insensitive
matching, last-wins duplicates), and Zig's std defaults to all four the other way. More to the
point for this repo: they are the loud-over-silent preference applied to the wire — the same
argument that makes `NaN` an encode error rather than a `null`, and that makes a cycle a
refusal in JSON rather than a truncation.

**And the first one is load-bearing for OQ-7, which is why it is an OQ and not a footnote.**
Ambiguity is only computable if "unknown field" is an error. Under reject-unknown, `{x} | {x,y}`
is DERIVABLE — `{"x":1,"y":2}` cannot be the `{x}` arm, because `y` would be unknown there —
so the required-key-set rule decides it. Under ignore-unknown the same two arms are genuinely
ambiguous, because every document that matches `{x,y}` also matches `{x}`. **Same VL type,
opposite answers, decided entirely by this policy.** A serde design that leaves OQ-8 open has
not actually answered OQ-7.

**The alternative, priced:** ignore-unknown, whose argument is real — JSON configs evolve, and
a reader that rejects a key added by a newer writer is a forward-compatibility problem. It
costs `{x} | {x,y}` and every union shaped like it, and it moves the failure from build time
to "the field I set had no effect and nothing said so". Declined. A program that wants
forward compatibility can carry a `{[string]: Json}` catch-all field explicitly, which is the
version of this that is visible in the type.

### OQ-9 — `i64` on the wire. **RULED 2026-09-01 (decision B): always a JSON NUMBER.**

**The question.** JSON has one number type and consumers written in JavaScript funnel it
through an f64, so an `i64` above 2^53 is lossy in *their* readers. Three answers were on the
table; this document previously stated the second, in three places, all now struck.

| option | verdict |
| --- | --- |
| **1. `i64` is always a JSON number** | **RULED.** VL's reader is type-directed and exact — it knows the destination is an `i64` before it reads a digit, so it parses to `i64` and never touches an f64. `i64 \| string` stays derivable under OQ-7. A config file spells `3`, which is what a human writing a config writes. A JavaScript consumer loses precision above 2^53 and is told so in the format's documentation, which is a true statement about JavaScript rather than a tax on every VL program. |
| **2. `i64` is always a decimal string** (the doc's old rule, from protobuf's JSON mapping) | Declined. It collides with untagged: `i64 \| string` becomes underivable, because every `i64` on the wire IS a string and no reader can tell which arm was meant. And it makes a human config spell `"3"` — the quoting is not carrying information, it is carrying a foreign language's limitation. |
| **3. value-dependent** (number when \|v\| ≤ 2^53, else string) | Declined outright. The wire type of a field would depend on its VALUE, which is hostile to untagged unions, to any schema derived from the type, and to a reader that wants to commit on the first token (OQ-7's ruled rule). |

**The coordinator's caveat, recorded rather than smoothed over.** The cross-language critic's
framing was that the f64 funnel is "inherited from JavaScript, not JSON" and that VL should
rule against I-JSON. **That framing was NOT verified.** The coordinator's recollection is that
RFC 7493 (I-JSON) §2.2 says the opposite — that 64-bit integers SHOULD be encoded as strings,
i.e. the interop profile adopted the JavaScript premise deliberately — and neither had web
access to check. **This ruling does not rest on the RFC in either direction.** It rests on
VL's own three reasons: the type-directed reader is exact, `i64 | string` derives, and configs
read naturally. If someone with the RFC in hand finds that I-JSON does endorse strings, this
ruling is unchanged and its status becomes "VL is deliberately not I-JSON-conformant on this
point", which is a sentence the format documentation should carry.

**The dependency, and it is not optional.** `parseI64` / `parseI32` do not exist in std today
— the ONLY number path is `parseF64`, the funnel — so option 1 has nothing to parse with, and
so do options 2 and 3. They are **landing as a separate change** (stage 0's remainder,
`std-api-reviewer` per CLAUDE.md); this document references them and does not specify them.
Nothing in stage 1 can read an `i64` until they land.

### OQ-10 — a VLB shape fingerprint in the header. **RULED 2026-09-01 (decision E): yes, 8 bytes.**

**The question.** VLB is schema-implicit: the bytes carry no field names and no types, and the
decoder's knowledge of the shape comes from the program it was compiled into. Two builds that
disagree about a shape therefore do not fail — they **silently misread**, which is bincode's
known failure mode and the one thing this format's positioning ("same build only") asks users
to guarantee by hand.

**The ruling.** The VLB header carries an **8-byte fingerprint of the shape**, computed by
OQ-2's recursive structural fingerprint — the same function, already committed to for arm
ordering, so this is a use of existing machinery rather than a new one. Decode compares it and
refuses on mismatch. One compare, eight bytes, on a format whose whole argument is throughput:
this is not where the cost is.

Two constraints the cross-language regrets impose, both of which are part of the ruling:

- **Hash WIRE-RELEVANT structure ONLY.** Java's `serialVersionUID` is the counter-example:
  it changed on edits that could not affect the bytes, so every irrelevant refactor broke
  compatibility and users learned to pin it by hand, which disabled the check entirely. A
  private field with no encoding, a doc comment, a renamed local — none may move this
  fingerprint. What may: field names that appear on the wire, field types, arm sets, arm
  order, container kinds.
- **A format-version byte is NOT a substitute**, and the header wants both. MessagePack's
  2013 `str`/`bin` split is the case: the format version says what the ENCODER's rules were,
  and says nothing about whether this program's `Move` is the same `Move` the encoder had.
  Two different questions, two different fields.

What it costs positionally: "same build only" weakens slightly as a *marketing* line, since
the format now tolerates being pointed at the wrong build. It strengthens as a *guarantee*,
which is the trade this document takes everywhere else — a loud refusal in place of a quiet
wrong value. Effectively it turns bincode into borsh-plus-a-header.

### OQ-11 — is reference identity a keyable concept in VL? **RULED YES, 2026-09-01 — by the language, not by serde.**

Split out of decision D deliberately, and answered where it belonged: the owner's identity
ruling (`docs/identity-design.md` §0; evidence in
`docs/internals/identity-critique-synthesis.md`). `===`/`!==` is one `ref.eq` on every
reference kind; `IdentityMap<K, V>` / `IdentitySet<K>` are concrete types keyed by it, with
`Map`/`Set`'s surface and satisfying `{[K]: V}`; v1 is a flat scan (the "linear probe" below),
and the per-object serial (the "identity slot" below — lazy, `i64`, per keyed class only) is
deferred until a program measures the scan as a problem. So the seen-set is an
`IdentitySet<T>` on the path where the static predicate fails, and the 204 ms-at-16k figure is
the price of the scan until the serial lands. The text below is the question as it was asked.

Split out of decision D deliberately. Serde surfaced it and serde did not get to answer it.

**What raised it.** §Cycles needs a set keyed on object identity, and there is none: `Map`/`Set`
keys are `string` or `i32` only (`A Node-keyed Map isn't supported yet — Map/Set keys must be
string or i32`), and WasmGC gives `ref.eq` but derives no integer from a reference, so there
is nothing to hash. The refusal's own wording — *isn't supported yet* — concedes a capability
gap, which under this repo's clause 2 means either the design forbids it and the message
should say so, or it does not and the gap is real.

**The question, stated so it can be ruled on its own merits:** does VL want reference identity
as a first-class, keyable concept — `Set<Node>`, `Map<Node, V>`, and an `identityOf` or
equivalent — or is object identity something the language deliberately does not expose?

**What it costs if yes:** an identity slot per object (memory on every allocation, whether or
not any program uses it) or a linear probe at each lookup (correct, and quadratic — which is
exactly the 204 ms-at-16k measurement that started this). Neither is free and the choice
between them is itself a decision.

**What it does NOT block.** Serde stage 2 proceeds on the static acyclic-shape predicate,
which is sufficient for the shapes serde walks. If OQ-11 later says yes, the seen-set for
genuinely-cyclic shapes gets cheaper and the predicate stays correct; if it says no, nothing
in the serde plan changes. That independence is why it was split rather than bundled.

---

## Is this one spec or several concerns? (owner's question, 2026-09-01)

The owner asked: *"are we trying to pack multiple things into one spec that are really
different concerns at heart?"* Honestly: **partly yes, and the honest answer has two halves —
the document already made the split it needed to make, and it has since accreted a fourth
concern that does not belong.**

**The half that is fine.** §The question opens by splitting (a) host IO/config, (b) message
passing, and (c) pause/restore, and then argues they want *different answers* rather than one
— which is the opposite of packing them together. The conclusions bear that out and are
deliberately not one thing:

| concern | deliverable | why it is separate |
| --- | --- | --- |
| (a) host IO, config, interop | **`std:json`** — text, tolerant, value-form unions, untagged | wants human editing and cross-version reads |
| (b) message passing between VL instances | **VLB** — binary, exact, index-form unions, canonical | wants speed and fidelity; both ends are one build |
| (c) pause/restore | **nothing at the serde layer** — deliberately | §Snapshot argues it belongs below the language (engine image of linear memory) or above it (application-level `serialize<T>` over a root state type), and refusing the middle is the whole finding |

Three deliverables, one shared shape-walk in the emitter, and OQ-5's resolution above makes
the split sharper rather than softer: one union form per FORMAT rather than a mode switch.
The shared walk is a genuine implementation economy — the same per-shape traversal, two
renderings, the Ion lesson — and sharing an implementation is not the same as conflating a
requirement. The place to watch is the reverse pressure: if a future decision has to be made
"once, for serde", and (a) and (b) want opposite answers, that is the tell that the walk is
being asked to carry a policy it should not. OQ-5 was exactly that pressure and the answer
was to split, not to add a byte.

**The half that is not fine, and the recommendation.** This document has also accreted the
**RENDERING** family: §Print/templates/color (a shipped Stage C0, a palette measurement, a
`--color` resolution table, `vl test` relay behaviour) and half of §Cycles (`show`'s
`<cycle →#N>` back-reference marker, the `[Circular]` survey). That is a fourth concern and
it is not a serialization concern. What it shares with serde is exactly one thing — **the
walk** — and what it does not share is everything that matters about a format: rendering has
no reader, no round trip, no evolution story, no wire compatibility, no determinism
requirement, and its correctness bar is "a human understands this" rather than "decode
returns the value". A section about ANSI escape pairs and Node's `util.inspect.colors` is
living in a document about byte formats because both call the same emitter function, which is
an implementation adjacency, not a shared requirement.

**Recommendation (not executed here — this refresh is docs-only and splitting a doc mid-flight
would strand the citations that point at it): when `show<T>` starts, move the rendering family
into its own document** — `docs/show-design.md` or similar — carrying §Print/templates/color
whole, the cycle-MARKER half of §Cycles, D711's "no defined output for `print([1,2,3])`"
revisit, and the palette measurements. `serde-design.md` keeps the walk, the formats, the
snapshot ruling, and the cycle **round-trip** half (VLB back-references), and gains a
one-line pointer. Doing it before `show<T>` starts would be premature — the two are one
emitter track until then, and the shared walk is the reason both are scheduled at stage 2 —
but doing it *at* that moment is cheap and keeps this document about what its title says.

---

## Appendix: what was RUN

**Two dated rounds.** The 2026-08-31 round is kept verbatim below, struck where a later
measurement replaced it; the 2026-09-01 refresh follows in its own block. Both were run via

```sh
VL_STD=$PWD/std scripts/vl-host/target/release/vl run <probe> \
  --compiler build/vl-compiler.wasm          # Rust host, wasmtime
```

`VL_STD` is not optional from an agent worktree: the host resolves `std:` from the *binary's*
checkout and every worktree symlinks `scripts/vl-host/target` to the main repo's, so a probe
run without it silently measures the WRONG std (CLAUDE.md). Programs are inlined so
re-running is a paste — a paraphrased witness is a different program.

### Round 1 — 2026-08-31

```vl
// Numerics: i64 exact past 2^53; f32 widens; f64 shortest-round-trip.
const a: i64 = 9007199254740993   // prints 9007199254740993
const b: f32 = 0.1                // prints 0.10000000149011612
print(0.1 + 0.2)                  // prints 0.30000000000000004
// 1e40-magnitude f64 prints "1e+40"; ~~the literal `1e300` fails to LEX
// ("undeclared identifier 'e300'")~~ [LANDED #2173 — see round 2]; -0.0 prints "0";
// NaN/Infinity print as those words; ~~toString(1.5) is a type error ("expects an
// i32 or boolean")~~ [the builtin is GONE — see round 2].
```

```vl
// Maps/sets: both key types; insertion order observable; Set is {[T]: boolean}.
const m: { [string]: i32 } = Map()
m["b"] = 2
m["a"] = 1
for k in m.keys() { print(k) }    // b, then a — insertion order
const s: { [string]: boolean } = Set()
s.add("x")
print(s.has("x"))                 // true
const bytes: u8[] = [104, 105]
print(bytes[0])                   // 104 — u8 element reads back as i32
let v = 300
const big: u8[] = [0]
big[0] = v
print(big[0])                     // 44 — computed store truncates to low 8 bits
```

```vl
// No shape-generic userland code: field access on a type parameter is a type error.
function getR<T>(x: T): f64 { return x.r }   // REJECTED at check
```

```vl
// The idiomatic JSON tree declares but is not emittable today.
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
const arr: Json = [1.5, "x"]
if arr is string { print("?") }
// emit error: `is` names a declared union member with no interned arm
// representation (deferred value-union composition)
// (and `is Json[]` is refused earlier, at check: "not a variant")
```

```vl
// Recursive STRUCT shapes work; width subtyping is check-valid, codegen-rejected.
type Tree = { v: i32, kids: Tree[] }
const t: Tree = { v: 1, kids: [{ v: 2, kids: [] }] }
print(t.kids[0].v)                // 2
// ~~{code,msg} into a {msg} param: "drops the field `code` … not yet supported
// by codegen"~~ [MOVED — see round 2's prefix rule] — decode must construct at
// the destination shape.
```

```vl
// Char literals are i32 code points; print refuses composites.
const c = 'a'
print(c)                          // 97
const s = "a"
print(c == s[0])                  // true
// print({kind:"circle", r:2.5}) is a type error naming the scalar-only surface.
```

### Round 2 — 2026-09-01 (the refresh)

Every round-1 program above was re-run. The three that moved, plus the new measurements the
refresh needed. Each block is one probe file, complete.

```vl
// FACT 5 — the FACTORIAL grid. 28 cells: null presence x array arm x map arm x test.
// Generator + grader: scratch `grid.py`; each cell is the two lines below over one
// declaration, graded check-refuse / emit-refuse / compiler-trap / RUNS (never merged).
type T = string /* | null */ /* | i32[] | T[] */ /* | {[string]: i32} | {[string]: T} */
const v: T = "hello"
if v is string { print("ok") } else { print("no") }      // or `is T[]` / `is {[string]: T}`
// Totals: RUNS 12 · check-refuse 6 · emit-refuse 5 · COMPILER TRAP 7.
// With `null`: any self-referential arm (array OR map) => emit-refuse on `is string`,
//   check-refuse on `is <that arm>`  ("'T[]' is not a variant of string | T[] | null").
// Without `null`: a self-referential ARRAY arm RUNS (`is T[]` included); a
//   self-referential MAP arm TRAPS THE COMPILER.
```

```vl
// FACT 5, MECHANISM 2 — the compiler trap, ablated. Six programs, one line each.
type T = string | { [string]: T }
print("ok")
// → vl check rc 0; vl run AND vl build: "wasm trap: call stack exhausted",
//   backtrace repeating compiler frames 1823 / 1799 / 2400.
//   The DECLARATION alone is enough: no `is`, no binding, no use.
//
// type T = string | T[]                            + a binding  → RUNS
// type T = { [string]: T }                         + Map()      → clean emit refusal:
//     "emitProgram: unsupported map value type (no rep for a union-member struct, …)"
// type T = string | null | { [string]: T }         + a binding  → RUNS  (null MASKS it)
// type T = string | { [i32]: T }                   + a binding  → compiler trap
// type A = string | { [string]: B } ; type B = string | A[]     → RUNS  (mutual is fine)
```

```vl
// FACT 5 — the original probe, verbatim, UNCHANGED in outcome. Note it carries `null`,
// which is why it lands in mechanism 1 (a loud refusal) rather than mechanism 2's trap.
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
const arr: Json = [1.5, "x"]
if arr is string { print("?") }
// emit: `is` names a declared union member with no interned arm representation
//       (deferred value-union composition)

// declaring and assigning still works:
//   const s: Json = "hello" ; print("declared and assigned")   → RUNS
// `is Json[]` still refuses at CHECK, at both spellings:
//   if arr is Json[] { … }
//   type JsonArr = Json[] ; if arr is JsonArr { … }
//   → `is` check type 'Json[]' is not a variant of
//     boolean | f64 | string | Json[] | {[string]: Json} | null

// The two controls that make self-reference the discriminating ingredient:
type U = i32 | string
const xs: U[] = [1, "a"]                        // an ARRAY of a value union: RUNS
const e = xs[1]
if e is string { print(e) }                     // prints "a"
// and with a struct arm, non-recursive, behind a struct field:
//   type S = { n: i32 } ; type U2 = i32 | string | S ; type Box = { items: U2[] }
//   const bx: Box = { items: [1, "a"] }         → RUNS
// but recursion ROUTED THROUGH a struct arm still refuses, with a different message:
//   type JArr = { items: Json2[] } ; type Json2 = null | f64 | string | JArr
//   → emitProgram: only i32[] arrays and struct/union element arrays are supported
```

```vl
// FACT 4 — width subtyping: the SORTED-PREFIX rule. Three programs.
type Wide = { code: i32, msg: string }
type Pre  = { code: i32 }                       // sorted prefix of Wide
function take(n: Pre): i32 { return n.code }
const w: Wide = { code: 1, msg: "boom" }
print(take(w))                                  // 1 — RUNS

// (2) the SAME pair with the retained field changed to `msg` — NOT a sorted prefix:
//   type Narrow = { msg: string } ; function show(e: Narrow): string { return e.msg }
//   → check: "an object value of shape Wide flowing into Narrow drops the field
//     `code`: type-valid (structural width subtyping) but not yet supported by codegen"
// (3) declaration order reversed, retained field still the sorted prefix:
//   type Wide2 = { msg: string, code: i32 } ; take(w2)   → 1 — RUNS
// `scripts/capability-probes/width-subtyping.vl` is this shape and now grades RUNS.
```

```vl
// FACT 6 — floats, in VL. (`toString` is std:fmt's; the builtin is retired.)
import { toString, parseF64 } from "std:fmt"
print(toString(1.5))                    // 1.5
print(toString(0.1 + 0.2))              // 0.30000000000000004
print(toString(-0.0))                   // 0        — ECMA-262's own rule
const p = parseF64("0.30000000000000004")
if p == null { print("parse failed") } else { print(p) }   // 0.30000000000000004
const q = parseF64("1e300")
if q == null { print("parse failed") } else { print(q) }   // 1e+300
const i: i64 = 9007199254740993
print(toString(i))                      // 9007199254740993
// unimported: `print(toString(5))` → "undeclared identifier 'toString' — `toString`
//   is not a builtin any more, it is `std:fmt`'s: add
//   `import { toString } from "std:fmt"`"
// an f32 reaches the f64 arm now:
//   const x: f32 = 0.1 ; print(toString(x)) ; print(x.toString())
//   → 0.10000000149011612 (twice)
```

```vl
// FACT 6 — the lexer reads scientific notation (#2173), and specials still print.
const x = 1e300
print(x)                                // 1e+300
print(1.5e-7)                           // 1.5e-7
print(2E+10)                            // 20000000000
print(-0.0)                             // 0
print(1.0 / 0.0)                        // Infinity
print(0.0 / 0.0)                        // NaN
print(1e40)                             // 1e+40
```

```vl
// FACT 6 — string assembly: `+` still refuses a float, a template hole does not.
const x = 0.1
const n = 42
const i: i64 = 9007199254740993
const b = true
print(`f64=\{x} i32=\{n} i64=\{i} bool=\{b}`)
//   → f64=0.1 i32=42 i64=9007199254740993 bool=true
// while `const s: string = "v=" + x` is still
//   operator '+' is not defined for string and f64
```

```vl
// FACT 3 / OQ-2 — union member order carries no type identity.
type A = i32 | string
type B = string | i32
function fromA(v: A): string { if v is string { return v } "int" }
function fromB(v: B): string { if v is string { return v } "int" }
const a: A = "hi"
const b: B = "hi"
print(fromB(a))                         // hi — an A passes as a B
print(fromA(b))                         // hi — and back
const n: A = 7
print(fromA(n))                         // int
```

```vl
// §Cycles — a real reference cycle builds and traverses. (The section's own
// filed prerequisite: "should be MEASURED when stage 2 starts".)
import { toString } from "std:fmt"
type Node = { v: i32, next: Node | null }
const a: Node = { v: 1, next: null }
const b: Node = { v: 2, next: null }
a.next = b
b.next = a
print(toString(a.v))                    // 1
const n = a.next
if n == null { print("no next") } else {
  print(toString(n.v))                  // 2
  const nn = n.next
  if nn == null { print("no next2") } else { print(toString(nn.v)) }   // 1
}
const c: Node = { v: 3, next: null }
c.next = c                              // self-loop
const cn = c.next
if cn == null { print("no self") } else { print(toString(cn.v)) }      // 3
```

```vl
// OQ-3 — NaN payload bits ARE observable, and they propagate.
import { toString } from "std:fmt"
const computed = 0.0 / 0.0
print(toString(f64bits(computed)))              // -2251799813685248 (0xFFF8…0000)
const custom = f64fromBits(9221120237041090565) // 0x7FF8000000000005
print(toString(f64bits(custom)))                // 9221120237041090565
print(custom)                                   // NaN
const prop = custom + 1.0
print(toString(f64bits(prop)))                  // 9221120237041090565 — PROPAGATED
const neg = -1.0
print(toString(f64bits(neg * 0.0 / 0.0)))       // -2251799813685248
```

```sh
# OQ-3, the CROSS-ENGINE half. Same module, two engines, byte-identical answers.
vl build oq3.vl -o oq3.wasm --compiler build/vl-compiler.wasm   # then, under V8:
deno run -A --no-check - <<'TS' oq3.wasm
import { runWasm } from "./tests/support/runWasm.ts";
console.log(JSON.stringify((await runWasm(await Deno.readFile(Deno.args[0]))).logs));
TS
# wasmtime : -2251799813685248  9221120237041090565  NaN  9221120237041090565  -2251799813685248
# V8       : IDENTICAL, all five
```

```vl
// APPROACH 1's sketch, whole — this is the program the §Approach 1 excerpt is cut from.
import { toString, parseF64 } from "std:fmt"

type Config = { name: string, ratio: f64, retries: i32 }
type Lex = { src: string, pos: i32 }

function at(lx: Lex): i32 { if lx.pos < lx.src.length { lx.src[lx.pos] } else { 0 } }
function eat(lx: Lex, ch: i32): boolean {
  while at(lx) == ' ' || at(lx) == '\n' { lx.pos = lx.pos + 1 }
  if at(lx) == ch { lx.pos = lx.pos + 1; true } else { false }
}
function str(lx: Lex): string | null {
  if !eat(lx, '"') { return null }
  const s = lx.pos
  while lx.pos < lx.src.length && at(lx) != '"' { lx.pos = lx.pos + 1 }
  const out = lx.src.slice(s, lx.pos)
  lx.pos = lx.pos + 1
  out
}
function num(lx: Lex): f64 | null {
  while at(lx) == ' ' { lx.pos = lx.pos + 1 }
  const s = lx.pos
  while lx.pos < lx.src.length && at(lx) != ',' && at(lx) != '}' { lx.pos = lx.pos + 1 }
  parseF64(lx.src.slice(s, lx.pos))
}

function encode(c: Config): string {
  `{"name":"\{c.name}","ratio":\{toString(c.ratio)},"retries":\{toString(c.retries)}}`
}

function decode(src: string): Config | null {
  const lx: Lex = { src: src, pos: 0 }
  if !eat(lx, '{') { return null }
  const k1 = str(lx)
  if k1 == null || !eat(lx, ':') { return null }
  const name = str(lx)
  if name == null || !eat(lx, ',') { return null }
  const k2 = str(lx)
  if k2 == null || !eat(lx, ':') { return null }
  const ratio = num(lx)
  if ratio == null || !eat(lx, ',') { return null }
  const k3 = str(lx)
  if k3 == null || !eat(lx, ':') { return null }
  const retries = num(lx)
  if retries == null { return null }
  { name: name, ratio: ratio, retries: retries as i32 }
}

const src = encode({ name: "vl", ratio: 0.30000000000000004, retries: 3 })
print(src)                              // {"name":"vl","ratio":0.30000000000000004,"retries":3}
const back = decode(src)
if back == null { print("decode failed") } else { print(encode(back) == src) }  // true
```

```vl
// APPROACH 3's sketch, whole — flat layout constants over a Buffer.
import { Buffer, storeI32, storeF64, loadI32, loadF64 } from "std:buffer"
flat type Packet = { id: i32, kind: i32, x: f64, y: f64 }
const buf = Buffer(Packet.size * 4)
function put(i: i32, id: i32, kind: i32, x: f64, y: f64) {
  const at = i * Packet.size
  storeI32(buf, at + Packet.id, id)
  storeI32(buf, at + Packet.kind, kind)
  storeF64(buf, at + Packet.x, x)
  storeF64(buf, at + Packet.y, y)
}
print(Packet.size)                      // 24
print(Packet.x)                         // 8
put(2, 7, 1, 1.5, -2.25)
const at = 2 * Packet.size
print(loadI32(buf, at + Packet.id))     // 7
print(loadF64(buf, at + Packet.y))      // -2.25
```

```vl
// std:base64 round trip (stage 0, landed).
import { encodeBase64, decodeBase64 } from "std:base64"
import { toString } from "std:fmt"
const bytes: u8[] = [104, 105, 33]
const s = encodeBase64(bytes)
print(s)                                // aGkh
const back = decodeBase64(s)
if back is u8[] { print(toString(back.length)); print(toString(back[0])) }
else { print("decode error") }          // 3, then 104
```

```vl
// `u8[] | null` — the FILED probe runs; a LITERAL return is check-clean invalid wasm.
// filed: scripts/capability-probes/u8-list-nullable-return.vl → prints 1 then 0. RUNS.
// the nearby spelling that does not:
import { toString } from "std:fmt"
function maybe(n: i32): u8[] | null {
  if n > 0 { return [1, 2, 3] }
  return null
}
const r = maybe(1)
if r == null { print("null") } else { print(toString(r.length)) }
// `vl check` rc 0; run: Invalid input WebAssembly code … type mismatch:
//   expected (ref null $type), found (ref $type)
```

Round-1 programs re-run and UNCHANGED on 2026-09-01: the maps/sets/`u8`-truncation block
(prints `b`, `a`, `true`, `104`, `44`), the char-literal block (`97`, `true`, and
`print({kind:"circle", r:2.5})` still refusing with the scalar-only sentence), the
shape-generic rejection (`function getR<T>(x: T): f64 { return x.r }`), the recursive
`Tree`, and the `i64`/`f32`/`0.1+0.2` numerics line.

Not run, sourced from docs or knowledge and marked as such in the text: the union rep
encodings and field-name sorting (`docs/guide/unions.md`), string internals
(`docs/guide/strings-design.md`), the concurrency ruling
(`docs/internals/concurrency-design.md`), the `flat`/sub-byte rulings (`ROADMAP.md`),
webcraft's snapshot placement (`docs/webcraft-requirements.md`), the canon
spelling-dependence finding (B229, `docs/internals/destringify-types-program.md`), the
constraints ruling (`docs/constraints-design.md`), the template-literal absolute binding and
the `toString` rename (`DECISIONS.md`, `std/fmt.vl`'s header), all external format and
engine-capability claims (spec knowledge as of writing; the wasmtime/Wizer capability
statements should be re-verified before anything is scheduled against them).

### Round 3 — 2026-09-01 (the POSITION matrix)

Why this round exists: §Approach 1's premise (fact 5's "the tree's defining feature IS the
self-reference, so the pull-lexer plan is unchanged") was refuted, and the two instruments that
should have caught it disagreed because **each held POSITION fixed** — the 28-cell grid at
module `const`, `scripts/capability-probes/` at *parameter* (`docs/internals/serde-critique-consistency.md`
§1/§2). This round adds POSITION as the axis. Seed self-refreshed from this worktree's
`compiler/` before the first probe; every invocation is
`VL_STD=$PWD/std scripts/vl-host/target/release/vl {check,run} <probe> --compiler build/vl-compiler.wasm`.

**Six arms × ten delivery positions = 60 cells. RUNS 51 · check-refuse 6 · emit-refuse 2 ·
check-clean invalid wasm 1 · trap 0.** Every cell prints a value proving the arm round-tripped
(`null`, `true`, `f64:2.5`, `str:x`, `arr:2.5`, `map:k=2.5`), and a cell that compiled but
printed something else would have graded `WRONG-OUTPUT` (none did).

| position | null | boolean | f64 | string | `Json[]` | `{[string]: Json}` |
| --- | --- | --- | --- | --- | --- | --- |
| module `const` | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| parameter (`is`-narrowed) | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| return, annotated | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| return, INFERRED | check | check | check | check | check | check |
| struct field | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| array element | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| map value read (`m[k]`) | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| closure capture | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |
| array literal → `Json`, bare | RUNS | RUNS | RUNS | **SILENT** | emit | emit |
| array literal → `Json[]`, annotated | RUNS | RUNS | RUNS | RUNS | RUNS | RUNS |

Two conventions the matrix depends on, both measured rather than assumed. **The delivered value
is hoisted into a local before the `is` ladder wherever the read expression is not an
identifier** (field, element, map read) — because a narrowing applied *to* a field or element
read does not reach the emitter at all (residue (g) below), which is a separate defect from
delivery and would otherwise have coloured three whole rows. And **the map-read `null` cell
proves a stored `null` is not a miss** (`m.has("q")` → `true`; a miss → `false`).

Every cell is this template, one arm and one position substituted:

```vl
// cells2/field__map.vl — the struct-FIELD position at the self-referential MAP arm.
import { toString } from "std:fmt"
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
const mv: { [string]: Json } = Map()
mv["k"] = 2.5
type Node = { v: Json }
const n: Node = { v: mv }
const q = n.v                                  // hoist: the narrowing needs an identifier
if q is { [string]: Json } {
  for k in q.keys() {
    const c = q[k]
    if c is f64 { print("map:" + k + "=" + toString(c)) } else { print("NO-c") }
  }
} else { print("NO") }
// RUNS → map:k=2.5
```

```vl
// cells2/mapread__null.vl — the one cell whose proof needs a second question.
import { toString } from "std:fmt"
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
const m: { [string]: Json } = Map()
m["q"] = null
const q = m["q"]
if q == null { if m.has("q") { print("null") } else { print("MISS") } } else { print("NO") }
// RUNS → null   (i.e. the stored null, not the miss sentinel)
```

**The `std:json`-shaped round trip, whole.** Parses and renders
`{"a":[1,null,"x"],"b":true,"c":{"deep":2.5}}` byte-identically, plus escapes, `[]`, `{}`,
`null`, and `[1e3,-2.5,0]` → `[1000,-2.5,0]`. `vl check` rc 0 (ten hints/infos, no errors);
`vl run` rc 0.

```vl
// The smallest real `std:json`-shaped program the value tree admits on the
// 2026-09-01 seed: parse a JSON document into `Json`, render it back.
import { toString, parseF64 } from "std:fmt"

type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
type Lex = { src: string, pos: i32 }

// ---------------------------------------------------------------- render
function esc(s: string): string {
  let buf: i32[] = []
  let i = 0
  while i < s.length {
    const ch = s[i]
    if ch == '"' { buf.push('\\') buf.push('"') }
    else if ch == '\\' { buf.push('\\') buf.push('\\') }
    else if ch == '\n' { buf.push('\\') buf.push('n') }
    else { buf.push(ch) }
    i = i + 1
  }
  fromCodePoints(buf)
}

function render(v: Json): string {
  if v == null { return "null" }
  if v is boolean {
    if v { return "true" }
    return "false"
  }
  if v is f64 { return toString(v) }
  if v is string { return "\"" + esc(v) + "\"" }
  if v is Json[] {
    let out = "["
    let first = true
    for e in v {
      if !first { out = out + "," }
      out = out + render(e)
      first = false
    }
    return out + "]"
  }
  if v is { [string]: Json } {
    let out = "{"
    let first = true
    for k in v.keys() {
      if !first { out = out + "," }
      out = out + "\"" + esc(k) + "\":"
      const c = v[k]                       // D1009: `render(v[k])` is a check reject
      if c == null { out = out + "null" } else { out = out + render(c) }
      first = false
    }
    return out + "}"
  }
  "null"
}

// ---------------------------------------------------------------- parse
function at(lx: Lex): i32 {
  if lx.pos < lx.src.length { lx.src[lx.pos] } else { 0 }
}

function ws(lx: Lex) {
  while at(lx) == ' ' || at(lx) == '\n' || at(lx) == '\t' || at(lx) == '\r' {
    lx.pos = lx.pos + 1
  }
}

function eat(lx: Lex, ch: i32): boolean {
  ws(lx)
  if at(lx) == ch {
    lx.pos = lx.pos + 1
    return true
  }
  false
}

function isNum(c: i32): boolean {
  (c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E'
}

function pstring(lx: Lex): string {   // the opening quote is already eaten
  let buf: i32[] = []
  while lx.pos < lx.src.length {
    const ch = lx.src[lx.pos]
    if ch == '"' {
      lx.pos = lx.pos + 1
      return fromCodePoints(buf)
    }
    if ch == '\\' {
      lx.pos = lx.pos + 1
      const e = lx.src[lx.pos]
      if e == 'n' { buf.push('\n') }
      else if e == '"' { buf.push('"') }
      else if e == '\\' { buf.push('\\') }
      else { buf.push(e) }
      lx.pos = lx.pos + 1
    } else {
      buf.push(ch)
      lx.pos = lx.pos + 1
    }
  }
  fromCodePoints(buf)
}

function pvalue(lx: Lex): Json {       // the annotation is load-bearing: residue (a)
  ws(lx)
  const ch = at(lx)
  if ch == '{' {
    lx.pos = lx.pos + 1
    const m: { [string]: Json } = Map()
    ws(lx)
    if at(lx) == '}' {
      lx.pos = lx.pos + 1
      return m
    }
    let more = true
    while more {
      if eat(lx, '"') {
        const k = pstring(lx)
        if eat(lx, ':') { m[k] = pvalue(lx) }
      }
      more = eat(lx, ',')
    }
    eat(lx, '}')
    return m
  }
  if ch == '[' {
    lx.pos = lx.pos + 1
    let a: Json[] = []                 // the annotation is load-bearing: residue (b)
    ws(lx)
    if at(lx) == ']' {
      lx.pos = lx.pos + 1
      return a
    }
    let more = true
    while more {
      a.push(pvalue(lx))
      more = eat(lx, ',')
    }
    eat(lx, ']')
    return a
  }
  if ch == '"' {
    lx.pos = lx.pos + 1
    return pstring(lx)
  }
  if ch == 't' { lx.pos = lx.pos + 4
    return true }
  if ch == 'f' { lx.pos = lx.pos + 5
    return false }
  if ch == 'n' { lx.pos = lx.pos + 4
    return null }
  const s = lx.pos
  while lx.pos < lx.src.length && isNum(at(lx)) { lx.pos = lx.pos + 1 }
  const n = parseF64(lx.src.slice(s, lx.pos))
  if n == null { return null }
  n
}

function parse(src: string): Json {
  const lx: Lex = { src: src, pos: 0 }
  pvalue(lx)
}

// ---------------------------------------------------------------- round trip
const doc = "{\"a\":[1,null,\"x\"],\"b\":true,\"c\":{\"deep\":2.5}}"
print(render(parse(doc)))
print(render(parse("{\"esc\":\"q\\\"b\\\\c\\nd\"}")))
print(render(parse("[]")))
print(render(parse("{}")))
print(render(parse("null")))
print(render(parse("[1e3,-2.5,0]")))
// {"a":[1,null,"x"],"b":true,"c":{"deep":2.5}}
// {"esc":"q\"b\\c\nd"}
// []
// {}
// null
// [1000,-2.5,0]
```

On a generated 1,049-byte document (24 members, each a 4-element array holding an f64, a
`null`, a string and a nested object) the same program is **semantically equal to the input,
preserves key order, and is idempotent** (`render(parse(a)) == a` → `true`); its output is
1,001 bytes because VL's shortest-round-trip `f64` writes `0` where Python writes `0.0`.
Timing, min-of-7 wall on a loaded box: `vl run` of the module at 1 / 100 / 1000 round trips
= **0.178 / 0.208 / 0.424 s**, so the marginal cost of one 1 KB parse+render is **~0.24 ms**;
`print(1)` is 0.015 s and `vl build` of the module is **0.067 s** → a 22,729-byte wasm.

**Four spellings the round-trip program had to avoid — each is the same program with one
substitution, so each is a paste.** (Applied to the whole program above.)

```vl
// w1 — D1009. Replace the map arm's bind-and-narrow with the direct call:
//   out = out + render(v[k])
// → check reject: argument 1: expected Json, got Json | null

// w2 — index the narrowed array arm and hand it STRAIGHT to a call: RUNS.
//   while i < v.length { out = out + render(v[i]) … }
// (residue (e) only fires when the index result is BOUND and re-narrowed — see below)

// w3 — drop `pvalue`'s return annotation (`function pvalue(lx: Lex) {`):
// → check reject: push: cannot add {[string]: Json} | Json[] | string | boolean | f64 | null
//                       to Json[]

// w4 — build the array arm with a bare literal (`let a = []`):
// → check rc 0, then Invalid input WebAssembly code at offset 19912:
//   type mismatch: expected i32, found (ref $type)      ← check-clean invalid wasm
```

**The residues, minimised.** Each is the smallest program that still shows it; the control that
runs is beside it. `vl check` returns 0 for every one of these.

```vl
// (a) INFERRED union return — an existing counted capability literal.
import { toString } from "std:fmt"
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
function g() {
  const t: Json = 2.5
  return t
}
const v = g()
if v is f64 { print("f64:" + toString(v)) } else { print("NO") }
// → check reject: 'g' infers the union return type Json — type-valid, but an inferred
//   return of this shape is not yet supported by codegen; annotate the return type
// CONTROL: `function g(): Json { 2.5 }` → RUNS, prints f64:2.5.  (All six arms refuse alike.)
```

```vl
// (b) a bare array literal of STRINGS at a recursive-union destination — SILENT.
type K = string | K[]
const c: K = ["x"]
if c is K[] { for e in c { if e is string { print(e) } } }
// → check rc 0; run: Invalid input WebAssembly code at offset 350:
//   type mismatch: expected (ref $type), found (ref $type)
// CONTROLS: `const a: K[] = ["x"]` then `const c: K = a` → RUNS, prints x.
//           `if c is K[] { print(c.length) }` on the BARE literal → RUNS, prints 1,
//           so the array exists and only the ELEMENT's rep is wrong.
//           f64, boolean and null elements all RUN on the bare literal.
```

```vl
// (c) a bare NESTED array literal at a `Json` destination — loud, at three boundaries.
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
const c: Json = [[2.5]]
print(1)
// → check rc 0; emitProgram: array value does not match any array member of the union
//   (leaf-scalar widening across a nested array is unsupported)
// Same message at the ARGUMENT boundary (`f([[2.5]])` against `f(v: Json)`) and at the
// MAP-WRITE boundary (`m["a"] = [[2.5]]`).
// CONTROL: `const a: Json[] = [[2.5]]` then `const c: Json = a` → RUNS.
```

```vl
// (d) a bare array literal holding a MAP at a `Json` destination.
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
const mv: { [string]: Json } = Map()
mv["k"] = 2.5
const c: Json = [mv]
print(1)
// → check rc 0; emitProgram: a union arm that is an array-of-map is not yet supported
//   — use a named element type
// CONTROL: `const a: Json[] = [mv]` then `const c: Json = a` → RUNS.
```

```vl
// (e) indexing a narrowed self-referential ARRAY arm INTO A LOCAL, when the union also
//     carries a self-referential MAP arm.
type K = f64 | K[] | { [string]: K }
const v: K = [2.5]
if v is K[] {
  const e = v[0]
  if e is f64 { print(e) }
}
// → check rc 0; emitProgram: map op receiver is not a map
// ABLATION — each of these RUNS and prints 2.5 (or 1):
//   `for e in v { if e is f64 { print(e) } }`            (iteration, not indexing)
//   `print(v.length)`                                    (the other array op)
//   `g(v[0])` against `function g(x: K)`                 (index result → argument, not a local)
//   `type K = f64 | K[]`                                 (drop the map arm)
//   `type K = f64 | K[] | { [string]: f64 }`             (make the map arm non-recursive)
// Fires identically at const, parameter and function-local positions.
```

```vl
// (f) `print` of a local RE-BOUND from an `is`-narrowed REF arm — SILENT.
//     Sibling of the closed D968, which fixed `print` of the narrowed RECEIVER.
type K = f64 | string
const v: K = "x"
if v is string {
  const a = v
  print(a)
}
// → check rc 0; run: Invalid input WebAssembly code at offset 312:
//   type mismatch: expected i32, found (ref $type)
// ABLATION — each of these RUNS:
//   `print(v)` (no rebind) · `const a: string = v` (annotated) · `print(a + "y")` ·
//   `s(a)` against `function s(t: string)` · `type K = f64 | i32` (scalar arm) ·
//   `if v != null` over `type K = null | string` (a != null narrow)
// `let a = v` behaves identically to `const`. Over the full six-arm `Json` the string arm
// is SILENT and the f64 and boolean arms RUN; over `type K = f64 | K[]` the recursive
// array arm is SILENT too (`print(a.length)`), while the recursive MAP arm RUNS
// (`print(g.size)`).
```

```vl
// (g) an `is` narrowing applied to a struct-FIELD or ARRAY-ELEMENT receiver never
//     reaches the emitter. FOUR messages, one mechanism.
type K = f64 | K[]
type N = { v: K }
const n: N = { v: [2.5] }
if n.v is K[] { for e in n.v { if e is f64 { print(e) } } }
// → check rc 0; emitProgram: unsupported for-in iterable
//
// The other three arms of the same mechanism:
//   `type K = f64 | f64[]`, same shape          → emitProgram: narrowed union field atom
//                                                  has no value box
//   `if n.v is K[] { const e = n.v[0] … }`      → emitProgram: index access but array type
//                                                  not collected
//   the MAP arm, `for k in n.v.keys()`          → emitProgram: callee is not a function name
//   an ARRAY-ELEMENT receiver, `if xs[0] is K[] { for e in xs[0] … }`
//                                              → emitProgram: unsupported for-in iterable
//
// WORKAROUND, and it is the whole fix at the call site — hoist, then narrow:
//   const q = n.v
//   if q is K[] { for e in q { if e is f64 { print(e) } } }        → RUNS, prints 2.5
// CONTROL: the same field with NO union (`type N = { v: f64[] }`) → RUNS at both spellings,
// so it is the narrowing that is lost, not the field read.
```

**D1010, re-run verbatim on the six-arm tree** — `const c: Json = [1.0, null, "x"]` →
`cannot assign (f64 | string | null)[] to 'c' of type Json`; `const arr: Json[] = [1.0, null, "x"]`
runs. Consistent with the row as filed.

**Combinators over the value tree run** — the cross-language critique's F10 steelman, which is
what makes "one hand-written line per field, per type, forever" an artifact of the old sketch
rather than a property of the language:

```vl
import { toString } from "std:fmt"
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
type Circle = { r: f64, tag: string }

function field(v: Json, k: string): Json {
  if v is { [string]: Json } {
    const c = v[k]
    if c == null { return null }
    return c
  }
  null
}
function num(v: Json): f64 { if v is f64 { return v } 0.0 }
function str(v: Json): string { if v is string { return v } "" }
function decodeCircle(v: Json): Circle {
  { r: num(field(v, "r")), tag: str(field(v, "tag")) }
}

const m: { [string]: Json } = Map()
m["r"] = 2.5
m["tag"] = "c1"
const c = decodeCircle(m)
print(toString(c.r) + "/" + c.tag)              // 2.5/c1

const dec: (Json) => f64 = num                  // a first-class decoder value: RUNS
print(toString(dec(2.5)))                       // 2.5
// The ALIAS spelling is what is refused, and only it:
//   type Dec<T> = (Json) => T
//   → unknown type 'T' within '(Json)=>T' in union 'Dec<T>'
```

Not re-run in this round and inherited unchanged from round 2: the `f32`-widening and
`std:base64` lines in §Approach 1's fidelity paragraph, and everything outside §Approach 1.
