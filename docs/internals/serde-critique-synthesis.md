# Serde plan — the three-lens critique, synthesised into one verdict

> **What this is.** The owner asked (2026-09-01) for the serde plan (`docs/serde-design.md`) to
> be attacked from several angles. Three independent critics ran, each in its own worktree
> against a self-refreshed seed with `VL_STD` pinned, and each landed its own document:
>
> | lens | doc | PR | probes RUN |
> | --- | --- | --- | --- |
> | VL consistency and the two clauses | `serde-critique-consistency.md` | #2240 | 10 findings, 11 credits |
> | other ecosystems' regrets | `serde-critique-crosslang.md` | #2238 | 12 findings, 12 credits |
> | compile-time and run-time cost | `serde-critique-perf.md` | #2243 | 11 findings, a do-not-optimise list |
>
> This document is the coordinator's synthesis: what the three agree on, what each caught
> alone, what is the OWNER's to rule and what is engineering. **Every load-bearing claim
> below was re-run by the coordinator against a fresh master seed (`c0484fa9`) before being
> relayed**, and §Verification records two places where a critic overreached.

---

## Verdict

**The architecture survives all three lenses.** No critic argued for a different one. Each
independently endorsed the derive over reflection, OQ-1(b)'s std-shimmed intrinsic (with the
`TPL_RENDER_EXPORT` precedent), OQ-3 bits-verbatim, OQ-4 transform-over-flag, OQ-7's
*direction*, insertion-order maps, and the plan's ordering of binary above text for use
case (b) — and the perf critic put numbers under that last one (VLB **4.5×** faster than
template JSON on a scalar record, **96×** with three `f64` fields).

What fails is narrower and more fixable than "the plan":

1. **The premise under §Approach 1 is refuted by a running program.** A full JSON value
   tree — self-referential array arm, self-referential map arm, `is`-narrowed as a recursive
   parameter — renders today. The doc's fact 5 says the tree's "defining feature IS the
   self-reference" and therefore the pull lexer is forced. It is not. The critics measured
   one surviving wall — a **`null` ARM** in a self-referential union at parameter position
   (D982/D985) — and **#2244 removed it while this synthesis was being written**: on the
   refreshed seed the six-arm tree `null | boolean | f64 | string | Json[] | { [string]:
   Json }` renders `{"a":[1,null,"x"],"b":null,"c":{"deep":2.5}}` and a top-level `null`
   (coordinator's probe, §Verification). What remains is two CHECKER gaps on the same
   membership fact, filed as D1009 (`Json | null` — a map read — is not accepted where
   `Json` is expected, though `null ∈ Json`) and D1010 (`[1.0, null]` cannot reach `Json`
   unannotated while `[1.0, 2.0]` can); both have one-line workarounds. **`std:json` v1
   can be value-tree-shaped now.**
2. **The OQ list is missing its largest member, and four format/policy pairs contradict
   across sections.** The unknown-field policy is in no OQ, and it *decides* OQ-7's ambiguity
   predicate (`{x} | {x,y}` is derivable under reject-unknown and ambiguous under
   ignore-unknown — same VL type, opposite answers). §Snapshot recommends VLB for the
   compiler-upgrade axis, which is the one axis VLB silently misreads across. The i64-as-string
   rule and the untagged ruling collide (`i64 | string` becomes underivable). And the plan's
   own migration idiom, `deserialize<ConfigV1 | ConfigV2>`, is exactly the union shape its
   ambiguity refusal rejects.
3. **One unpriced quadratic sits on the run-time path.** §Cycles says "one hash-set insert per
   ref node". There is no hash set: `Map`/`Set` keys are `string` or `i32` only (the refusal
   reads `isn't supported yet`), WasmGC derives no integer from a reference, and the static
   acyclic-shape skip that was to make this moot **does not exist in the compiler** (audited;
   `repTyScalarMask` is the right template and the wrong question). A linear-scan seen-set is
   **204 ms at 16,000 nodes — 70× the VLB encode it protects**, and it degrades smoothly, so
   no small fixture will ever show it.
4. **The plan is not graded against the two clauses, and two clause-2 violations sit on its
   critical path.** `struct field type u8[] has no struct-field rep` fires (check rc 0, emit
   refuses) on the VLB decoder's own cursor shape. The ref-keyed map refusal above is the
   other. Neither is a design rule; both are capability gaps that serde will hit on day one.

---

## Where the lenses converge — the strongest signal

Three critics, three briefs, no shared notes. Where two or three landed on the same object
from different directions, that is the finding to trust most.

| object | consistency | cross-language | performance | what it means |
| --- | --- | --- | --- | --- |
| **JSON value tree** | RUNS minus the `null` arm (§1) — and the `null` arm runs since #2244 | untagged needs a value tree "VL cannot build" (F3) — premise now soft | — | the pull lexer is a choice, not a forced move; F3's LL(1) narrowing stands on its own merits |
| **`null`** | was the one refusing arm (D982/D985, landed #2244); two checker residues remain, D1009/D1010 | "always emit `"f": null`, never omit" (F2 sibling 4) | — | JSON null wants ONE ruled story across the arm, the field, and the wire |
| **clause-2 refusals on serde's shapes** | newtypes (OQ-6) are a capability refusal, anti-correlated with their hazard (§3) | `type Dec<T> = (Lex) => T` refused while the inline spelling runs (F10) | `u8[]` struct field; ref-keyed map (§7, §1) | five capability gaps, every one on a shape serde needs; none is a design rule |
| **VLB** | — | silently misreads across builds; fix is an 8-byte shape fingerprint in the header, reusing OQ-2's fingerprint (F1) | wins 4.5×/96× on encode; **loses 1.6× on decode today** because bytes→string COPIES (81% of the decode) — a `fromUtf8` view primitive flips it to 3.3× faster (§6) | VLB is the right bet and needs two cheap things to be what the doc says it is |
| **the rendering/parsing substrate (`std:fmt`)** | `print(x)` ≠ `toString(x)` on one f64 — host sink vs `std:fmt` (§6) | `parseF64` funnels `9007199254740993` → `…992`; **std has no `parseI64`** (F5) | fmt's "~25 µs" is the random-bit-pattern population; ordinary doubles are 2.59 µs (§4) | serde rides `std:fmt`, and `std:fmt` has three loose ends |
| **OQ-5 (compact vs indexed union form)** | "a fork wearing unification's clothes — accepted, print the matrix" (§9) | — | confirmed on cost: index form ~100× cheaper per union field than value form (§11) | the owner's per-format ruling is right; the matrix is owed |

---

## What the plan gets right — unanimous, leave it alone

The three credit sections overlap heavily. The intersection, so the next critic does not
re-litigate it: the derive is right for a whole-program compiler with no reflection; the
survey's synthesis is correct; OQ-1(b) with `TPL_RENDER_EXPORT` as precedent; OQ-3
bits-verbatim (now also the throughput argument); OQ-4 canonicalise-as-transform; OQ-7's
direction (the common case `string | f64 | Circle` and `Circle | Rect` both narrow today);
insertion-order maps (which also makes hash seeding free — F6); WasmGC allocation left to
Heap2Local (4 ns escaping, 3–4% of a decode — do not pool); template-literal record building
(0.8 µs per 10-field record — do not build a string builder); and the pin-riding deferred
constraint that `serialize<T>` needs, which already ships and blames the call site.

---

## Decisions that are the owner's

Each is a ruling, not engineering. Recommendation first; the alternative is stated so the
choice is real.

**A. Unknown-field policy and its three siblings** (cross-language F2 — "the largest single gap
in the OQ list"). Four sentences: **reject unknown fields**; **exact, case-sensitive field
matching**; **reject duplicate keys**; **always emit `"f": null` for a `T | null` field, never
omit it**. Every one is a named Go v1 regret; Zig defaults to all four. *Recommend: all four,
as stated* — they are this repo's loud-over-silent preference applied to the wire, and the
first one is what makes OQ-7's ambiguity predicate computable. Alternative: ignore-unknown
(the JSON-config-forward-compat argument); it costs OQ-7 `{x} | {x,y}` and every shape like it.

**B. Number policy — where `i64` goes on the wire.** The doc says "i64 as decimal string" in
three places; F5 shows it collides with untagged (`i64 | string` underivable) and makes a
human config spell `"3"`. *Coordinator's caveat on the critic:* F5 says the f64 funnel is
"inherited from JavaScript, not JSON" and to rule against I-JSON — but my recollection of RFC
7493 §2.2 is that I-JSON itself says 64-bit integers SHOULD be encoded as strings, i.e. the
interop profile *adopted* the JS premise deliberately. Neither of us had web access; check the
RFC before quoting either. The decision has the same shape either way:
  1. **i64 always a JSON number** — VL's type-directed reader is exact, `i64 | string` derives,
     configs read naturally; a JS consumer loses precision above 2^53 and is told so.
  2. **i64 always a string** (the doc's current rule) — I-JSON-conformant, JS-safe; untagged
     collision and `"3"` in configs, paid by every user.
  3. **value-dependent** (number when |v| ≤ 2^53, else string) — hostile to untagged and to
     any schema; do not.
*Recommend (1)*, with `parseI64`/`parseI32` added to stage 0's remainder regardless (needed by
every option, and today the ONLY number path is the funnel — `parseF64` is what the appendix
sketch uses).

**C. Untagged-union refusal rule** (F3/F4). Narrow "the deriver decides distinguishability
statically" — which over recursive types is tree-automaton intersection emptiness — to one
predictable rule: **arms must be distinguishable by the first token, or by required key set.**
That fixes performance (no backtracking, no O(arms × value)), keeps streaming possible, makes
the ambiguity check decidable, and admits `deserialize<ConfigV1 | ConfigV2>` exactly when the
versions differ in a required key — which is the honest answer. Also note the two overlaps the
doc's list misses, both RUN today: an open map arm overlaps every object arm
(`{x:i32} | {[string]:i32}`), and JSON's single number type merges `i32 | f64`. *Recommend:
adopt the rule.* Alternative: keep the general predicate and accept serde's silent-wrong-arm
bug class when it under-approximates.

**D. Cycles — the seen-set has nothing to be.** The ruling was "cycles handled, unsafe variant
deferred until measured". It is now measured (finding 3 above). Three ways out:
  1. **Build the static acyclic-shape predicate** (transitively ref-free, or ref-bearing with no
     back-edge in the type graph) so the seen-set runs only on shapes that CAN cycle — most
     configs cannot — and keep a depth cap as the floor. Compiler work, no new language surface.
  2. **A reference-identity key** — a `Set<Node>` keyed on object identity. This is a LANGUAGE
     question the refusal's own wording (`isn't supported yet`) leaves open: does VL want
     reference identity as a keyable concept at all? WasmGC gives `ref.eq` and no hash, so it
     costs an identity slot per object or a linear probe.
  3. **Un-defer `serializeUnchecked`** — the escape hatch, priced now.
*Recommend (1) now, plus the perf critic's 10-line timing probe (walk a ref-bearing shape at N
and 4N, fail above 6×) so the day the seen-set lands it cannot be quadratic unnoticed; rule (2)
separately as the language question it is.*

**E. VLB header shape fingerprint** (F1). Eight bytes, one compare, reusing the recursive
structural fingerprint OQ-2 already commits to. Turns bincode's silent misread into
borsh-plus-a-header. Constraints from the regrets: hash wire-relevant structure ONLY (Java's
`serialVersionUID` broke on irrelevant edits), and a format-version byte is not a substitute
(MessagePack's 2013 `str`/`bin` split). *Recommend: yes.* It slightly weakens "same build only"
as a positioning line and strengthens it as a guarantee.

**F. OQ-6 newtypes — reopen.** Ruled "refuse/defer, not opinionated". The consistency critic
shows the refusal is a capability refusal (`F32Base = new i32`, and `i32` is the domain's
centre), and that it is anti-correlated with its hazard: from one std file it refuses
`F32View`/`F32Base` (branded) and accepts `Buf` (plain alias, same raw address). A
newtype-branded struct field RUNS today. *Recommend: accept newtypes transparently* — erased
to their base at emit, brand kept by the checker — and keep the doc's `Buf` observation as the
thing that actually needs a rule. Cheap to flip now; permanent if it ships as a refusal.

**G. Stage 1's shape** — follows from A–C rather than a ruling of its own: with the value tree
live, `std:json` v1 is a real `Json` value plus a parser, not a token-at-a-time lexer, and
stage 3 retires less. The doc owes a re-derivation of §Approach 1 from what fact 5 now
measures, with POSITION as the grid's missing axis (consistency §2 — const RUNS, parameter
refuses, and the capability probes and the 28-cell grid disagreed for exactly that reason).

---

## Engineering fallout — no ruling needed, routed

Filed here so nothing in the three docs depends on someone re-reading 2,200 lines.

| item | source | route |
| --- | --- | --- |
| `struct field type u8[] has no struct-field rep` — check rc 0, emit refuses; `i32[]` runs. On the VLB cursor's own shape | perf §7 | inventory row + vl-de; clause-2, critical path |
| `null` arm in a self-referential union, parameter position (D982/D985) | consistency §1/§2 | **landed #2244** during the synthesis. Residue: D1009 (`J \| null` ↛ `J` when `null ∈ J`) and D1010 (`(f64 \| null)[]` ↛ `J` while `f64[]` → `J`) — both loud check rejects, filed, routed to vl-de |
| `type Dec<T> = (Lex) => T` refused (`unknown type 'T' within '(Lex)=>T'`) while `map2<A,B,C>` over inline function types RUNS (prints 74) | crosslang F10 | capability probe + row; small, and it means Elm-style combinators cost no compiler work |
| `print(x)` ≠ `toString(x)` on `2023347301156851.3` (`.3` vs `.2`) — host sink vs `std:fmt` | consistency §6, perf §4 | bind `print`'s f64 arm to the std renderer (the ruling already says print rides the renderer); do it BEFORE `show<T>` adds a third |
| `parseI64` / `parseI32` | crosslang F5 | stage 0 remainder; std-api review |
| `fromUtf8(b, off, len)` zero-copy view; `.bytes()` COPIES (a per-token call took 99 s) and `decodeUtf8At` transcodes | perf §6 | stage 2's cheapest large win; std-api review |
| seed the string hash (unseeded FNV-1a, `emit_sections.vl`; murmur3 finalizer for i32, `emit_bytes.vl`) — free here because iteration is insertion-order, so the hash is unobservable | crosslang F6 | emitter; zero VLB/golden-file churn |
| `join`-not-`+=` at document level (quadratic assembly; the fix already ships) | perf §9 | one header sentence in `std:json` |
| timing probe: ref-bearing walk at N and 4N stays under 6× | perf closing | `scripts/capability-probes/` |
| second probe: VLB decode of a string-bearing record FASTER than JSON decode (false by 1.6× today) | perf §6 | same runner |
| `std/fmt.vl` "~25 µs" → name the population (random bit patterns 14.4 µs; ordinary doubles 2.59 µs) | perf §4 | header edit |
| `perf-landscape.md` §4.1 says strings are `(array (mut i32))` UTF-32 — stale since Stage 2c; header now carries a cached hash | perf §5 | doc correction |
| four `(RUN 2026-09-01)` claims in the design doc stale by #2218/#2229/#2230 — including "the blocking item for the whole family" (closed) and stage 0's `u8[] \| null` caveat (closed) | consistency §7 | next design-doc refresh |
| stage-by-stage clause table (what the checker refuses, what the emitter refuses, why each is DESIGN) | consistency §3 | design doc §Recommendation; "a staged deliverable that cannot fill that table is not ready to schedule" |
| OQ-5 cost matrix (compact vs indexed, per format) | consistency §9, perf §11 | design doc |
| Elm/Gleam steelman: combinators are not scaffolding; Approach 1's measured "boilerplate tax" is an artifact of a sketch with no abstraction | crosslang F10 | design doc §Approach 1 re-derivation |

---

## Verification — what the coordinator re-ran, and two overreaches

Re-run against master `c0484fa9`, seed refreshed, `VL_STD=$PWD/std`, all probes under
`scratchpad/verify/`; the `null`-arm lines re-run again on `969df4df` (#2244) where noted:

- five-arm `Json` (array + map self-reference) as a narrowed recursive parameter: **RUNS**,
  `{"a":[1,"x"],"b":true,"c":{"deep":2.5}}`; `+ null` arm: check rc 0, `only i32, i64, f64,
  f32, boolean, struct, union, array, or string parameters are supported` (which lists `union`
  while refusing one).
- `(Json | null)[]` as the array arm: check rc 0, `ref valtype with no interned shape`.
- `JNull` marker-struct arm: **RUNS**, `{"a":[1,null,"x"],"b":null}`.
- **On #2244:** the real `null` arm, six-arm tree, `null` in an array, as a member, and at top
  level: **RUNS**, `{"a":[1,null,"x"],"b":null,"c":{"deep":2.5}}` then `null` — with two
  spelling workarounds the checker still demands: `const c = v[k]; if c == null {…} else
  { render(c) }` instead of `render(v[k])` (D1009, `expected J, got J | null`), and
  `const arr: Json[] = [1.0, null, "x"]` instead of the bare literal (D1010, `cannot assign
  (f64 | string | null)[] to Json | null`). Ablated: `[1.0, 2.0]` reaches `J` at binding,
  map-write and argument; `[1.0, null]` refuses at all three. The `JNull` interim is no
  longer needed.
- `print` vs `toString` on the f64: `…851.3` / `…851.2` / `…851.2` (the `\{x}` hole agrees
  with `toString`, not with `print`).
- `parseF64("9007199254740993")` → `9007199254740992`; `parseF64("9223372036854775807")` →
  `9223372036854776000`; `grep parseI64 std/` → nothing.
- `map2<A,B,C>` over inline function types → `74`; `type Dec<T> = (Lex) => T` → `unknown type
  'T' within '(Lex)=>T' in union 'Dec<T>'`.
- `{x} | {x,y}` narrows both ways (`2`, `5`); `{x:i32} | {[string]:i32}` narrows (`3`).
- `is Err` structural over `i32 | IoError | Base64Error`: `'Err' is not a variant of …` at check.
- newtype-branded struct field (`base: 4 as F32Base`): **RUNS**, `8`.
- ref-keyed map: `A Node-keyed Map isn't supported yet — Map/Set keys must be string or i32`.
- `u8[]` struct field: check clean, `struct field type u8[] has no struct-field rep`; `i32[]`
  control runs.
- `wasm-dis`: `string` and `u8[]` both `(array (mut i8))`.
- FNV basis/prime at `emit_sections.vl:2131–2138`; murmur3 finalizer at `emit_bytes.vl:646–655`.
- No transitive ref-free predicate in `compiler/*.vl` (`acyclic`/`refFree`/`hasRef`/… grep
  finds only comments and `unionHasRefArrayArmSlot`, which is a slot question).

**Two overreaches, recorded so they are not relayed as findings:**

1. Consistency §1 says "`null` does not need to be an arm" because a map read is already
   `V | null`. That holds for object MEMBERS only; `[1, null]` and a top-level `null` document
   have no home in a `Json` without the arm, and `(Json | null)[]` refuses too. The marker-struct
   arm is what actually closes it today. The finding's conclusion (the wall is one ingredient,
   not "self-reference") survives; the sentence does not.
2. Cross-language F5's "JSON does not force the f64 funnel, JavaScript does; rule against
   I-JSON" — see decision B. I-JSON's own text (as recalled) endorses strings for 64-bit
   integers, so it is not the ally the finding presents it as. The collision with untagged and
   the config-readability cost are real regardless.
