# Identity proposal — critique synthesis

**Status: SYNTHESIS, 2026-09-01 — awaiting the owner's ruling.** Three cross-examinations of
`docs/identity-design.md` (#2268), each from one angle, each by an agent that did not see
the others' work:

| angle | document | verdict |
| --- | --- | --- |
| cross-language precedent | `identity-critique-crosslang.md` (#2271) | yes, with changes |
| consistency with the tree and the rulings | `identity-critique-consistency.md` (#2272) | yes, with changes — two blocking |
| performance and implementation cost on WasmGC | `identity-critique-perf.md` (#2276) | yes for `===`; **no for P4 as specified** — split the proposal |

Every **(RUN)** claim a conclusion below rests on was re-run by the coordinator on the
refreshed seed before this document was written — §6 lists them. Three defect rows came out
of the exercise and are filed with probes: **D989** (union-vs-union `==` refused at emit;
filed #2269/#2270/#2274/#2275, **closed #2277**), **D1017** (`==` over a struct with a
list-of-structs field refuses at emit; #2273, open) and **D1018** (`==` between two bare-`null`
operands refused at emit; filed #2278, **closed #2279** — the answer is static, no rep was
needed). Each is a clause-2 gap on the `==` ladder the proposal's lowering would share.

**One lesson from closing D989 binds the `===` build items.** The refusal's message (`union
`==` atom has no value box`) pointed two levels away from the cause — `emitUnionUnionEq`
intersected both sides' member atoms and both lookups missed for a declared union. Expanding
only the LEFT side **compiled cleanly and was silently wrong**: the intersection went empty,
the arm loop emitted nothing, and the tag-only fallback compared the two TAGS, so `1 == 2`
printed `true` (`i32.eq (struct.get $0 0 …) (struct.get $0 0 …)` in the disassembly). An
intermediate state of the fix passed a compile and failed the value table. **Whatever lowers
`===` over a union payload rides that unboxing, so its acceptance is a VALUE TABLE — same
object true, two equal objects false, across arms false, null-vs-null true, inside and
outside an `is` guard — never a compile.**

The shape of the answer, before the detail: **the operator is cheap, sound on structs, and
the critics converge on how to spell its rules; the container is right in shape and its
rep — the hidden serial — is the part that was under-priced.** Every critic recommends
proceeding. None recommends proceeding with P4 as written.

## 1. Where the three converge

Topics on which at least two critics reached the same conclusion independently, with the
third's position where it had one.

| topic | crosslang | consistency | perf | converged answer |
| --- | --- | --- | --- | --- |
| **`===` costs nothing** | — | — | 5: Heap2Local models `ref.eq` precisely (`escapes = false`), folds it and deletes the allocation; 0.43 ns when it survives **(RUN)** | §4.1's worry is closed. Delete it. |
| **Union of struct arms** | (cannot see) | F1 BLOCKING: box allocated per widening; `u === v` false outside an `is` guard, true inside **(RUN)** | 7: `ref.eq` on the box answers `a === a` false; payload answers true **(RUN)** | `===` on a union compares **payloads**, never boxes — an invariant in P1, not a §4 question. `A \| null` is the `nulvariant` niche (bare `ref null`) and is sound as one `ref.eq`. |
| **Function values** | 10: `mk(1) == mk(1)` is `false` — `==` on functions is already allocation identity of the env **(RUN)** | F2 BLOCKING: closure struct is per-binding, so `ref.eq` on it disagrees with `==` (`const a = f; const b = f`: `==` true, `ref.eq` false); `ROADMAP.md:1007` says funcrefs admit no `ref.eq` | — | Drop function values from `===` in v1. `==` already gives the useful notion there (table index + `ref.eq` on env). |
| **Strings** | answers section: "the highest-confidence call in the document" — forbid; 4: the message needs three arms (scalar / string / union) | F10: the message must render the user's spelling (`Id`, not the erased base, `DECISIONS.md:814–825`) | — | `string === string` is a check error. One message template, three arms, rendered at the user's spelling. |
| **Serial: lazy** | 6: every GC'd runtime assigns identity hash lazily; eager is what none do | — | 4: eager survives `-O3` as a `global.set` in a loop whose `struct.new` was deleted — the counter advances for objects that never existed; eager +10.9%/+19.4% per allocation, lazy **free** on both sides **(RUN)** | Lazy, 0 = unassigned, one predicted branch at keying. Not a choice — a finding. |
| **Serial: it is a hash SEED** | 5: bucket compare is `ref.eq`; the serial is HotSpot's 31-bit identity hash, not an identity | F11: under the error model a wrap is a perf event if the bucket compare is `ref.eq`, and must TRAP if serials are compared as identity — say which | 2 and 9: "under `ref.eq`-checked lookup [a wrap] is a correctness-preserving slowdown"; reuse the i32-keyed map rep and `fbI32HashMix` (murmur3 `fmix32`) so the raw-modulo 2048× cliff never exists **(RUN)** | The container hashes the serial and resolves the bucket with `ref.eq`. Never compares serials as identity. Reuses VL's map rep and mix. |
| **`IdentityMap`/`IdentitySet` are their own types, off the `Map`/`Set` interfaces** | 7: keep the separate type (the only shape where substitution is visible to the checker); adopt `IdentityHashMap`'s disclaimer as a RULE | F9: must not subtype the C2 interfaces (recommended: no, the way C2.2 keeps `Set` off `Mapping`); `Set<T>` is unbuilt, so it is a prerequisite, not a parallel task | 9: implement on the existing i32-keyed map rep | Two names, not a mode parameter. Not subtypes of `{[K]: V}`. `Set<T>` first. |
| **P3 structural keys need an eligibility rule** | 1: `==` is not reflexive over `f64` (`n == n` false, `0.0 == -0.0` true **(RUN)**) — Rust's model: an `f64` field makes the struct key-ineligible | F3: a struct with a FUNCTION field is `==`-comparable but has no hash (`typecheck.vl:15508`) — exclude by name | 8: a container-bearing key walks its payload on every lookup, 4697× at length 4096, over MUTABLE keys (Java's lost-key bug) — refuse in v1 **(RUN)** | Key-eligible = struct whose fields are transitively `i32`/`i64`/`boolean`/`string`/eligible-struct. No `f64`, no function, no container, no map — each refused by field name. And the mutable-key rule goes in the header. |
| **The `==` ladder is the key ladder** | 8: the motivating shape (`{v, kids: T[]}`) cannot be asked `==` today | — | — | Filed as **D1017**: the ingredient is a struct-element list at field position. P3's key lowering and `==` must be ONE code path, or the key path inherits every hole the `==` ladder has. |
| **Doc hygiene** | 2: Swift is not evidence (value-type structs); Kotlin is, with three retrofitted diagnostics. 9: for maps, `===` is the ONLY equality — motivation, not consequence. 10: A15's parenthetical over-promises | F7: `DECISIONS.md:835` "A custom `==` overrides" is stale — `function "=="` is a parse error (D46) | — | §3 cites Kotlin only; A15's sentence is rewritten (§4, decision 9). |

## 2. Where they disagree, and how this document resolves it

**2a. The serial's width — `i32` (crosslang) or `i64` (perf).** Both critics agree on the
mechanism (seed + `ref.eq`), so the wrap is a slowdown and never a wrong answer, and
crosslang is right that HotSpot's 31 bits have collided by the birthday bound for 25 years.
Perf's measurement changes the *scale*: a sequential counter wraps at exactly 2³²
keyings, which under eager assignment is **10.2 s (RUN)**. Under LAZY assignment — which
both recommend — the counter advances only on first keying, so 2³² is 2³² distinct objects
handed to an identity container, and every colliding pair costs one extra `ref.eq` probe.
That is viable. But `i64` measured **free in time** (+0.014 ns, inside noise) and costs 4
bytes on keyed objects only, and it retires the paragraph forever. **Resolution: `i64`,
lazy.** Low stakes; the owner may pick `i32` without contradicting anyone.

**2b. Whether to build the serial at all (perf finding 6 vs the serde ruling).** Perf
measured the crossover: a flat `ref.eq` scan beats a hashed identity set below **N ≈ 12–16
(RUN)** and needs no serial, so if serde decision D's seen-set is the *ancestor path* the
serial has no v1 customer. The serde synthesis measured the other end of the same curve:
a linear-scan seen-set is **204 ms at 16,000 nodes, 70× the encode it protects**
(`serde-design.md:1363`), and a 16k-node `next`-chain IS a 16k-deep ancestor path. The two
measurements do not disagree; they bracket the answer. **Resolution: an identity container
at scale needs a per-object slot** — WasmGC gives `ref.eq` and no header word, so the only
alternatives are a hidden field or O(n). That confirms OQ-11's own framing and makes P4's
*shape* right. What perf refutes is P4's *price*, which is §2c.

**2c. P4's cost model — "one field, those types only, fine whole-program".** Three
independent findings say the price is different from the one quoted:

* **Consistency F4:** injection takes the `repCanonKey` opt-out seam `DECISIONS.md:1242`
  reserved for opaque types; under the alias ruling (`:814–825`) a `{x: i32}` keyed in one
  file and an unrelated `{x: i32}` elsewhere are ONE row, so either both pay or the serial
  splits the dedup; and `flat` types must be refused by name because the field changes the
  byte layout their contract exposes.
* **Perf 1:** `emitStructEqRec` walks `eqRowFieldCount` → `sFieldCount[row]`, the REP count,
  positionally (`wasmEmit.vl:11802`, `emit_classify.vl:7837`, verified). An injected field
  is compared by `==` unless every walker is taught to stop short — so as specified, P4
  refutes P2: `a == b` on two equal objects flips to `false` because some *other* part of
  the program identity-keyed their type.
* **Perf 3:** VL has no declared-vs-rep field split. One table (`emit_state.vl:1016–1046`)
  is the declaration record, the WasmGC field list, the interner key and the diagnostics
  source; 13 exact-arity sites; no `struct.new_default` anywhere; `emitStructExprAsVariantBox`
  copies field-for-field and would copy a serial (two objects, one identity); `slotCanonId`
  and `structFieldCodesEq` would disagree by construction; and the twin relation
  (`repStructSlotsTwin`, `emit_rep.vl:3110`) is pairwise over the module, so keying `Circle`
  injects into `Circle`'s whole twin class — `Dot` included — or splits it and re-creates
  the D280/D621/D623/D624/D627 family on purpose. The injection set must be decided BEFORE
  `collectCloSigs` (`emit_rep.vl:3124–3127`: "the two must agree"). Perf tried to witness
  a behaviour change from a field-count split and could not (`twin_split.vl` runs clean) —
  a mechanism with no witness, reported as that.

**Resolution.** The serial is a *rep* decision inside a container whose *API* does not
depend on it. Rule the semantics and the API now (§4, decisions 1–8); rule the slot as a
build item with prerequisites, not as a design fact (§4, decision 10): per **heap-type
class** (so "zero for every other type" becomes "zero for every other heap type", and
`Dot` pays for `Circle` — stated, not hidden), lazy, `i64`, decided before signature
interning, on a **private heap type** through the `repCanonKey` seam, with a
declared-vs-rep field split as the prerequisite that lets `==`, `emitObj`, the variant-box
copy and the arity sites read the *declared* count. Acceptance is four corpus cells the
critics named: two equal objects of a keyed type still `==`; a layout twin of a keyed type
still compiles; a `flat` key refuses by name; the alias spelling of a keyed type compiles.

**2d. `===` versus `identical(a, b)`.** Only crosslang has evidence: Dart shipped `===` and
**removed** it (M1, October 2012) with migration guidance that assumed most uses were the
JS reflex; Rust never shipped an operator (`ptr::eq`, named, loud). Consistency and perf
both list this under "what this angle cannot see". P1's rep restriction is a mitigation
neither Dart nor JS had — `x === 1` and `s === "a"` are compile errors — so what survives
is `p === q` on two structs, which is Kotlin's situation. **This is the one decision in the
document that is taste, not measurement**, and §4 decision 1 presents it that way.

## 3. What none of the three can see

* **Whether `===` is a footgun in VL's actual corpus.** Every critic said so. There is no VL
  corpus of identity checks to measure a reflex rate on, and there will not be until the
  operator exists. The hedge is crosslang's default-on lint on struct-vs-struct `===`.
* **Compile-time cost of the injection analysis and what a layout-changing whole-program
  pass does to LSP latency** (the compiler core recompiles on every keystroke). Unmeasured.
* **Liveness under a large live `IdentityMap`** — allocation moved 30× between
  dead-on-arrival and retained (2.3 → 70.5 ns, RUN); retention dominates and nobody measured
  it. §4.6's "identity keys keep their objects alive; no weak references" stands as written.
* **Generics and newtypes** are checker questions with no runtime cost (perf) and one
  consistent shape (consistency F8: per-instance refusal, the bound is unspellable, copy the
  `incoherent bound` message shape at `typecheck.vl:22043`). No critic disputed them.

## 4. Decisions for the owner

Each item: the question, who raised it, the recommendation, and what it costs to reverse
later. VL is not shipped; the reversal column is what "not shipped" is worth here.

1. **Spelling — `===`/`!==` or `identical(a, b)`.** (crosslang 3.) **Recommend `===`**, with
   P1's rep restriction and crosslang's hedge: a default-on hint on `a === b` where both
   operands are struct-typed and neither is `null`, saying what `==` would mean there. Record
   in P6 that Dart reversed this decision, so the choice is made knowingly. *Reversal:* a
   rename; cheap while unshipped.

2. **v1 operand set.** (consistency F1/F2/F5/F6, perf 7.) **Recommend:** struct, `List`/
   array, `Map`, and a nullable of one of those — one `ref.eq`. **Union of struct arms:**
   payload compare, specified in P1 as an invariant, lowered in `eqCmpKindOfTy`'s family
   (`typecheck.vl:15638`) so checker and emitter read one answer; may ride D989's fix since
   it needs the same unboxing (D989 is closed; its lesson above is the acceptance rule).
   **Function values: out** — `==` is already identity there.
   Lists are in with a constraint the ruling must write down (F5/F6): today a list is a
   `{backing, len, cap}` header object whose identity survives growth **(RUN)**; §VL.7's
   unbuilt header-less fixed-array rep (`collections-design.md:680`) claims to be "invisible
   to semantics", and `===` on a list would make it visible if growth ever reallocated the
   object — so §VL.7 inherits "list identity is the header's identity" as a constraint, and
   P5's "uniform element type" reason is replaced by that sentence. And `===` on lists is
   NOT the substitute for structural list hashing, which stays deferred
   (`collections-design.md:660`). *Reversal:* adding an operand kind later is free;
   removing one is a break.

3. **`string === string`.** (crosslang answers, 4; consistency F10.) **Recommend: check
   error.** One template, three arms — scalar (`i32` has no identity — use `==`), string
   (`string` compares by value in VL — use `==`), union-with-scalar-arm (`… is not a
   reference type`) — rendered at the user's spelling, with a newtype-operand fixture.
   *Reversal:* admitting it later is possible and every language that did regrets it.

4. **`null === null`.** (consistency F10, D1018.) **Recommend: `true`** — static, the way
   D1018's close made `null == null` static (#2279: the equality emitter answers before either
   operand is lowered); `x === null` gets the P1 hint pointing at `== null`. *Reversal:* none
   needed.

5. **P3 key-eligibility.** (crosslang 1, consistency F3, perf 8, D1017.) **Recommend the
   Rust model:** a struct is key-eligible iff every field is transitively `i32`/`i64`/
   `boolean`/`string`/eligible-struct. `f64`/`f32` (non-reflexive `==`), function fields (no
   hash), lists/arrays/maps (unbounded walk over mutable payload) each refuse **by field
   name**. Key equality IS `==` on the eligible subset, where `==` is reflexive; the key
   hash and `==` share one lowering (D1017 is why). The container header carries the
   Java mutable-key rule: a key mutated after insertion is lost. *Reversal:* lifting a
   restriction later is free; SameValueZero-style float keys would be a third equality
   relation and are the thing to avoid drifting into.

6. **Container names and interfaces.** (crosslang 7, consistency F9, perf 9.) **Recommend:**
   `IdentityMap<K, V>` and `IdentitySet<K>` as separate types that do **not** subtype the C2
   index-signature interfaces; surface = `Map`/`Set`'s entire surface, which makes `Set<T>`
   (C2.2, unbuilt) a prerequisite; implemented on the existing i32-keyed map rep with the
   serial as the hashed key and `ref.eq` as the bucket compare. Header states: not a `Map`;
   identity keys keep their objects alive; iteration is insertion-ordered and the serial is
   unobservable (replay rule, `collections-design.md:1460`). *Reversal:* a name is close to
   permanent in std — this is the item the std review exists for.

7. **`K` for the identity containers.** (P4, consistency F4.) **Recommend:** a struct type,
   a union of struct types, or a nullable of one; `flat` types refused by name (layout
   contract); arrays/maps/functions not identity-keyable in v1 (no slot), refused with a
   message naming the limitation — P5 unchanged. *Reversal:* free to widen.

8. **Generics and newtypes.** (consistency F8, proposal §4.3/4.4.) **Recommend:** per-instance
   refusal at the instantiation, message naming the instance; a newtype over a struct is
   identity of the underlying, over a scalar it is decision 3's error, both rendered at the
   newtype's spelling. *Reversal:* none needed.

9. **Doc corrections that ride the ruling.** (crosslang 2/9/10, consistency F7.) A15's
   parenthetical becomes "same function AND the same captured-environment object (`ref.eq`
   on the env) — two closures from separate calls of one factory are unequal even when
   their captures hold equal values" (measured, not "same closure object", which is also
   inexact: `const a = f; const b = f` are two closure objects and `==` is `true`).
   `DECISIONS.md:835` "A custom `==` overrides" is deleted (D46). §3 cites Kotlin only.
   Map `===` moves to the motivation: it is the only map equality VL has.

10. **The serial — a build item with prerequisites, not a design fact.** (§2b/2c above.)
    **Recommend recording:** the identity containers need a per-object slot at scale (204 ms
    at 16k, crossover at ~16 — both measured); the slot is a lazy `i64` on a **private heap
    type per keyed twin class**, decided before `collectCloSigs`; prerequisite is a
    declared-vs-rep field split in the emitter so every field walker reads the declared
    count; acceptance is the four corpus cells in §2c plus perf's timing probe (walk at N
    and 4N, fail above 6×, already ruled in serde D). **Ship order:** `===` first (cheap,
    sound, independent); then `Set<T>`; then the containers on the flat-scan rep with the
    slot as the optimisation that follows — the API does not change when the rep does.
    *Reversal:* the slot's placement (per-class vs universal) can change under the same
    API; the split is compiler investment either way.

## 5. What the ruling records

If the recommendations stand, the A15 remainder in `DECISIONS.md` reads: identity is
spelled `===`/`!==`, one `ref.eq`, over struct / list / map / nullable-of-those and the
payload of a union of struct arms — never a scalar, a string, a function value or a box;
`Map`/`Set` struct keys are structural over the key-eligible subset (no `f64`, no function,
no container) and share `==`'s lowering; `IdentityMap`/`IdentitySet` are separate types off
the C2 interfaces, keyed by a lazy `i64` serial on a private heap type, bucket-resolved by
`ref.eq`. OQ-11 in `docs/serde-design.md` closes on that sentence. `ROADMAP.md` A15 lists
the build items in ship order: (1) the operator + checker rule + hint, with D1018 and the
union payload rule on D989's now-built unboxing, accepted by a value table; (2) the key-eligibility predicate + struct-key
lowering for `Map`/`Set`, on the `==` ladder, with D1017; (3) `Set<T>`; (4) the two
containers on the flat rep; (5) the declared-vs-rep field split; (6) the serial, with its
four acceptance cells. Compiler work routes to the compile-goal track; the std surface of
(3), (4) and (6) goes through `std-api-reviewer`.

## 6. Verification — what the coordinator re-ran before writing this

All on the refreshed seed (`scripts/refresh-compiler.sh` rc 0 after #2265), `VL_STD=$PWD/std`:

* crosslang 1: `n == n` → `false`, `{d: NaN} == {d: NaN}` → `false`, `0.0 == -0.0` → `true`.
* crosslang 10 / consistency F2: `mk(1) == mk(1)` → `false`; `const c = a; a == c` → `true`;
  `==` on functions disassembles to `i32.and (i32.eq index) (ref.eq env)`.
* consistency F1: one struct widened twice into `A | B` allocates the `{tag, payload}` box
  twice (`wasm-dis`: two `struct.new $2` boxes around one `$0` payload); inside `is A` the
  read is the bare payload.
* perf 5: `wasm-opt -O3` on `b_refeq.wat` leaves `i32.add` and no `struct.new`; `c_cases`
  prints all seven assertions identically raw and post-`-O3`.
* perf 4: `serial_b.wasm -O3` — zero `struct.new`, `global.set $global$0` inside the loop;
  `serial_a` has neither.
* perf 7: `box.wasm` — `ref.eq` on BOX = 0, on PAYLOAD = 1.
* perf 2: `overflow.wasm` prints `0` after 9,980 ms.
* perf citations: `emit_sections.vl:5048` (`wU8(1) // mutable`), `emit_rep.vl:3110` and
  `:3124–3127`, `wasmEmit.vl:7627`, `emit_bytes.vl:643`, `wasmEmit.vl:11802`,
  `emit_classify.vl:7837` — all present as cited.
* crosslang 8 → D1017 ablation (four spellings); consistency F10 → D1018 ablation (five
  spellings). Both rows grade `as filed`: `375 graded · 375 as filed · 0 MOVED · 0 not
  graded`. `capability-probes/run.py`: 20 of 22 run, the two new probes are the two.
