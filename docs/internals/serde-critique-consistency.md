# Serde plan — a consistency critique from VL's own goals

> **Angle: VL language consistency and alignment with the standing goal.** One of several
> adversarial passes the owner asked for on `docs/serde-design.md`. This document attacks; it
> does not demolish. §What the plan gets right is not a courtesy section — it names the parts a
> later critic should leave alone.
>
> **Every behavioural claim below was RUN, not recalled.** Seed provenance, stated once because
> the whole document depends on it: `build/vl-compiler.wasm` self-compiled by
> `scripts/refresh-compiler.sh` from `compiler/*.vl` at master `5380df1e`, and proven a
> byte-exact self-compilation fixpoint by `--prove-fixpoint` (`compile(seed) == seed`,
> 1,678,332 bytes). Host `scripts/vl-host/target/release/vl` (wasmtime), `VL_STD` pinned to this
> worktree's `std/` per CLAUDE.md. Probe programs are inlined so re-running is a paste rather
> than a paraphrase. Measurements are dated **2026-09-01 (late)** — after `#2229`, `#2230` and
> `#2218` merged, which is the whole of finding 1.
>
> The constitution this grades against is CLAUDE.md's standing bar: *every program the language
> design permits compiles and runs correctly* — (1) **soundness**, (2) **no capability
> refusals**, with *"not yet supported by codegen" is never a valid answer.*

---

## Ranked findings

| # | finding | verdict |
| --- | --- | --- |
| 1 | The JSON value tree **works today** — fact 5's conclusion is refuted by a running program | **fix: re-derive Approach 1** |
| 2 | Fact 5's 28-cell grid held POSITION fixed, which is where its blind spot was | **fix: add the axis** |
| 3 | No stage is graded against the two clauses; the one clause-2 call made (newtypes) is the wrong category and anti-correlated with its own hazard | **fix** |
| 4 | The O3 error layering the plan inherits does not exist: `is` demands an exact declared arm | **fix: stop minting error names** |
| 5 | OQ-2's residual failure is already closed by the checker; OQ-7's ambiguity refusal is aimed at the wrong unions | **fix: retarget** |
| 6 | "print and templates ride the same renderer" is false today, measured on one f64 | **fix before `show<T>`** |
| 7 | Four `(RUN 2026-09-01)` claims are stale by four merged commits | **fix: re-run** |
| 8 | The derive's checker predicate is a FIFTH deferred capability, priced as "small" | **re-price** |
| 9 | OQ-5's "one form per format" is a fork wearing unification's clothes | **accepted cost, print the matrix** |
| 10 | `s as Config` needs an open question the doc never names | **fix: name it** |

---

### 1. The JSON value tree WORKS today. Fact 5's conclusion is refuted by a program that runs.

**What the doc says.** Fact 5 is the document's longest section, and Approach 1's shape rests on
one sentence from it: *"a `std:json` v1 still cannot be value-tree-shaped, because the tree's
defining feature IS the self-reference; the pull-lexer plan stands unchanged."* The 28-cell
grid, the three mechanisms, and §Approach 1's entire pull-lexer justification hang off it.

**Measured.** A full five-arm recursive `Json` union — with a self-referential *array* arm **and**
a self-referential *map* arm — used as a recursive function **parameter**, `is`-narrowing on
every arm, renders a nested document correctly:

```vl
import { toString } from "std:fmt"
type Json = boolean | f64 | string | Json[] | { [string]: Json }

function render(v: Json): string {
  if v is string { return "\"" + v + "\"" }
  if v is f64 { return toString(v) }
  if v is boolean { if v { return "true" } return "false" }
  if v is Json[] {
    let out = "["
    let first = true
    for e in v { if !first { out = out + "," } out = out + render(e) first = false }
    return out + "]"
  }
  if v is { [string]: Json } {
    let out = "{"
    let first = true
    for k in v.keys() {
      if !first { out = out + "," }
      const c = v[k]
      if c == null { out = out + "\"" + k + "\":null" }
      else { out = out + "\"" + k + "\":" + render(c) }
      first = false
    }
    return out + "}"
  }
  "?"
}

const doc: { [string]: Json } = Map()
doc["a"] = [1.0, "x"]
doc["b"] = true
const inner: { [string]: Json } = Map()
inner["deep"] = 2.5
doc["c"] = inner
print(render(doc))
```

`vl check` rc 0; run rc 0; output **`{"a":[1,"x"],"b":true,"c":{"deep":2.5}}`**.

**The one ingredient, ablated in one line.** Add `null` as a declared ARM of `Json` — change
nothing else — and the same program is `vl check` rc 0 followed by
`emitProgram: only i32, i64, f64, f32, boolean, struct, union, array, or string parameters are
supported`. That is the whole of the surviving wall.

**And `null` does not need to be an arm.** A map read is already `V | null` — measured: with
`null` absent from the union, `render(v[k])` refuses at check with `argument 1: expected Json,
got Json | null`. So JSON's `null` is *already* a value-level narrow at the read site, which is
where it belongs; declaring it as a sixth arm is what buys the refusal, and buys nothing else.

**Why this matters more than a stale sentence.** The doc's own framing is that the pull lexer is
forced. It is not: a value tree is a live option today, which changes stage 1's shape (a real
`Json` value plus a parser, not a token-at-a-time lexer), changes what stage 3 retires, and
changes the OQ-7 analysis (an untagged decoder that *builds a `Json` and then shapes it* is a
different program from one that type-directs a token stream). §Approach 1's sketch is measured
and honest about *its own* boilerplate; it is the **premise above it** that no longer holds.

**Remedy.** Re-run fact 5 whole (see finding 2 for the axis it needs), then re-derive §Approach 1
from what it finds rather than editing the sentence. If the value tree survives re-measurement,
`std:json` v1 is a materially different and smaller module than the one staged.

---

### 2. The grid's fixed coordinate was the POSITION — CLAUDE.md's own named blind spot.

**What the doc says.** The 28-cell grid varies `null` presence × array arm × map arm × test, and
reports `RUNS 12 · check-refuse 6 · emit-refuse 5 · COMPILER TRAP 7`. Every cell is a top-level
`const v: T = "hello"` (the appendix records the generator).

**Measured — one ingredient changed, `const` → parameter:**

```vl
// POS1                                    // POS2
type J = null | string | J[]               type J = null | string | J[]
const j: J = "hi"                          function f(j: J) {
if j is string { print(j) }                  if j is string { print(j) } else { print(0) }
else { print(0) }                          }
                                           f("hi")
// check rc 0, run rc 0, prints "hi"       // check rc 0, EMIT REFUSES
```

POS2's message: `emitProgram: only i32, i64, f64, f32, boolean, struct, union, array, or string
parameters are supported` — **which lists `union` as supported while refusing a union.** That is
CLAUDE.md's "a refusal's sentence describes the arm that fired, not the feature", live, and it is
also why grouping by message would have merged this with unrelated parameter-floor cells.

Controls, each one ingredient from POS2:

| program | position | `null` arm | outcome |
| --- | --- | --- | --- |
| `type U = i32 \| string` | parameter | — | **RUNS** |
| `type R = string \| R[]` | parameter | — | **RUNS** |
| `type T = string \| {[string]: T}` | parameter | — | **RUNS** |
| `type J = null \| string \| J[]` | parameter | `null` | **emit refuse** |
| `type J = null \| string \| J[]` | const | `null` | **RUNS** |

So the family's ingredients are *self-referential container arm* **+** `null` arm **+**
**parameter position**, and the grid can see only two of the three.

**The two instruments already disagreed and nobody reconciled them.** `scripts/capability-probes/`
grades `json-tree-is-plain-arm.vl` and `json-tree-is-container-arm.vl` as GAP — both are
*parameter*-position. The doc's grid and its appendix are *const*-position and now RUN. Both
measurements are correct; they are about different populations, and only the probes' population
still has the defect. (`tests/cases/types/json-value-tree-declares.vl`'s own comment — *"`is`
against any arm is still refused (D982/D985)"* — is stale for the same reason.)

**Remedy.** Add POSITION as the grid's axis before re-running it — `const` / parameter / return /
struct field / array element / global assignment — which is the nine-row matrix D965 already
prescribes in CLAUDE.md ("**Enumerate the positions by finding the SIBLING's callers, then verify
by running them**"). Report `runs → not-runs` and `→ silent` per position. A one-position grid
over a capability family is the exact instrument CLAUDE.md says produces a confidently filed
wrong number.

---

### 3. No stage is graded against the two clauses, and the one clause-2 call made is the wrong category.

**What the doc says.** The word "clause" appears **twice** in 1,931 lines: once labelling
§Approach 2's refusal list "clause-2-honest", once defending OQ-3's bits-verbatim. No stage is
graded against the standing bar, and the bar is the repo's constitution.

That omission is not cosmetic, because the one clause call the doc does make is miscategorised
by the repo's own criterion. D711/D712 (`DECISIONS.md`) settled how to tell a design rule from a
capability gap: **"ask whether the argument's MEMBERS are inside the domain. If they are, the
refusal is a capability. If the value has no members in the domain at all, the refusal is the
domain."**

Applied to §Approach 2's refusal list:

| refused thing | members in the wire domain? | verdict under D711/D712 |
| --- | --- | --- |
| closures / function types | no — a captured environment has no wire meaning | **the domain.** Correct, defensible, keep |
| `void` / `never` | no values | **the domain.** Correct |
| newtypes (OQ-6) | **yes** — `F32Base = new i32`, and `i32` is the domain's centre | **a capability refusal wearing a design rule's words** |

**And the newtype refusal is anti-correlated with the hazard it claims to prevent.** From one std
module, `std/buffer.vl`:

```
line  48:  export type Buf     = { base: i32, length: i32 }        // plain alias
line 380:  export type F32View = new { base: i32, length: i32 }    // newtype
line 409:  export type F32Base = new i32                           // newtype
```

OQ-6 **refuses** `F32View` and `F32Base` — the branded, self-documenting spellings — and
**accepts** `Buf`, which is the same linear-memory address with no brand on it. §Approach 2 even
notices the second half (*"`Buf` is a plain structural alias … the derive cannot refuse them by
shape"*) without connecting it to the first. The refusal catches the safe spelling and lets the
unsafe one through, from the same file. Measured: a newtype-branded struct field runs today —

```vl
type F32Base = new i32
type F32View = { base: F32Base, length: i32 }
const v: F32View = { base: 4 as F32Base, length: 8 }
print(v.length)          // 8 — RUNS
```

— so OQ-6 makes a working program un-serializable for a reason that is not a design rule.

**Remedy.** Two parts. (a) Add a per-stage clause table to §Recommendation: for each of stage 0–3,
what the checker refuses, what the emitter refuses, and why each is the DESIGN rather than a gap.
A staged deliverable that cannot fill that table is not ready to schedule. (b) Reopen OQ-6.
Either refuse by capability with a real rule (something `{base, length}`-shaped, which is hard and
probably not worth it), or accept newtypes transparently — they are erased to their base at emit
anyway (`newtype-design.md`: *"byte-identical to the same program with `new` deleted"*), so
accepting is the zero-work option and it is the one that does not refuse a running program.

---

### 4. The error layering the plan inherits does not exist: `is` demands an exact declared arm.

**What the plan leans on.** `error-handling-design.md` O3 ruled the minimal error shape is
`{ msg: string }`, with `IoError` extending it, and justified it structurally: *"a caller matching
on `{msg}` accepts both"*. The serde plan mints `JsonError` (stage 1) and `DecodeError` (stage 2)
beside the existing `IoError` and `Base64Error`, and the asymmetry defence — *"the failures
differ"* — is only principled if those four compose.

**Measured — they do not.**

```vl
type IoError     = { code: i32, msg: string }
type Base64Error = { at: i32, msg: string }
type Err         = { msg: string }
function report(r: i32 | IoError | Base64Error): string {
  if r is Err { return r.msg }        // <- the O3 spelling
  "ok"
}
```
→ `[ERROR]: `is` check type 'Err' is not a variant of i32 | IoError | Base64Error`

Ablated: the **inline** spelling `if r is { msg: string }` gives the same refusal
(`'{msg:string}' is not a variant`), so it is not about the alias. The **exact-arm** control runs:
`if r is IoError { … } if r is Base64Error { … }` checks clean and prints `io` then `b64`. So `is`
requires a declared member, not a structural supertype, and O3's layering is a ruling with no
runtime behind it.

**What that does to the plan.** A program using `std:fs` + `std:base64` + `std:json` + the derive
carries **four** error struct types and must write four `is` arms at every join. The error surface
fans out linearly in the number of std modules, and the doc's per-module asymmetry justification
("the failures differ") is precisely what generates the fan-out.

**The second half: the `T | null` channel cannot bridge to the `T | E` channel.** Measured, and
the refusal is excellent:

```vl
function readNum(s: string): f64 | JsonError {
  const v = parseF64(s) as f64      // parseF64: f64 | null
  v
}
```
→ ``[ERROR]: `as f64` propagates null, which the enclosing function cannot return (it returns f64 | JsonError)``

Loud, precise, clause-clean — and it means `as` carries **one** error shape per function. A
`std:json` decoder declaring `T | JsonError` must hand-write `if v == null { return {at: …, msg:
…} }` at every numeric field, which is boilerplate stage 2 cannot delete because it lives at the
`std:fmt` boundary, not in the codec's shape walk.

**Remedy.** Do not mint `JsonError` and `DecodeError`. Return `T | { at: i32, msg: string }` and
let the *arm spelling* be the alias, so a caller has one arm to narrow across std. If the O3 floor
is genuinely wanted, it needs `is` to accept a structural supertype of a declared arm — a real
language change, worth its own ruling, and the serde plan should not be the first customer to
discover it is missing. Either way: stop citing O3's layering as the reason the asymmetry is
principled, because the layering is not there.

---

### 5. OQ-2's residual failure is already closed by the checker; OQ-7's refusal is aimed at the wrong unions.

Three measurements, each hitting a different load-bearing premise.

**(a) OQ-2's stated residual failure is unreachable.** OQ-2 says a structural fingerprint *"cannot
distinguish two members that are structurally identical — and where a NEWTYPE distinguishes them,
the fingerprint must either include the brand … or refuse"*, and uses this to argue OQ-6 and OQ-2
must be answered together. Measured, the checker already refuses that union:

```vl
type Meters = new { v: f64 }
type Feet   = new { v: f64 }
type Len = Meters | Feet
```
→ `[ERROR]: union members 'Meters' and 'Feet' have the same runtime representation, so `is` cannot
tell them apart — a nominal newtype is erased to its base at run time in union 'Len'`

So the ambiguity cannot arise, OQ-6 is **not** load-bearing for OQ-2's totality, and one of the
two reasons given for refusing newtypes evaporates (the other is finding 3's, which is also weak).

Worse for the option table: OQ-2 puts the fingerprint **in the emitter** (*"one recursive function
in the emitter"*), and `newtype-design.md` is explicit that brands do not reach there — *"the
checker reads `declaredTyOfName` and gets the brand, the emitter reads `cUserTypes` and gets the
shape"*, and two different struct newtypes of one shape **share one wasm heap type**. So "include
the brand" is not a choice the architecture offers at that layer. The table presents a fork with
one arm.

**(b) The premise OQ-7 uses to narrow its own problem is false.** OQ-7 writes: *"two struct arms
with the same field names and types are the SAME structural type and cannot both be members of one
union."* Measured — they can:

```vl
type A = { v: f64 }
type B = { v: f64 }
type U = A | B
function pick(n: i32): U { if n == 0 { return { v: 1.0 } } { v: 3.28 } }
const a = pick(0)
if a is A { print("A") } else { print("B") }     // check rc 0, RUNS, prints A
```

**(c) OQ-7's refusal fires on the union that works and is unreachable for the one it cites.** Its
worked ambiguous example is `{x: i32}` against `{x: f64}`. Measured, the union rep **already**
refuses that pair, at emit, for a different reason:

```
emitProgram: union `U` cannot be discriminated — variants `Ai` and `Af` have the same field
names but different field types
```

So the derive never sees it. Meanwhile the *other* ambiguity OQ-7 names — `{x}` against `{x, y}` —
**runs today**:

```vl
type Small = { x: i32 }
type Big   = { x: i32, y: i32 }
type U = Small | Big
// check rc 0, RUNS, prints 1 then 2
```

Net: OQ-7's marquee claim — *"a compile-time answer VL can give that serde-rs structurally
cannot"* — is, for its own examples, either an answer an existing rule already gives with a better
message, or a refusal aimed at a union the language happily runs.

**Remedy.** Rewrite OQ-7's distinguishability analysis against measured unions. The real question
it should answer is narrower and more interesting: *`Small | Big` runs, and untagged JSON cannot
round-trip it — is refusing at the derive right, or should `toJson` be the surface that admits it
is lossy?* Drop the `{x: i32} | {x: f64}` example, which the language settled first. For OQ-2,
either move the fingerprint to the checker (where brands exist) or state plainly that it is
structure-only by construction and that this is fine because N2's rule holds the line.

---

### 6. "Print and templates ride the same renderer" is false today, and the measurement is in this doc's own fact 6.

**What the doc says.** §Print, templates, and color: *"Template holes and `print` both bind to the
CANONICAL stringifier"*, and stage 2's `show<T>` takes over *"with zero new template or print
work"*. Fact 6 separately files a cross-host divergence: the Rust host's `print` re-formats digits
from Rust's `{:e}` and breaks an exact decimal tie away from even, smallest witness bits
`4835952189745799117`.

**The two sections contradict each other, and the contradiction is observable in one program:**

```vl
import { toString } from "std:fmt"
const x = f64fromBits(4835952189745799117)
print(x)                 // 2023347301156851.3     <- host print sink
print(toString(x))       // 2023347301156851.2     <- std:fmt, ECMA-262
print("\{x}")            // 2023347301156851.2     <- template hole
```

**`print(x)` and `print("\{x}")` render the same `f64` as different characters, today.** They are
not one renderer: `print` binds to a host sink (Rust, `Palette` in `main.rs`), the hole binds
absolutely to `std:fmt` through `TPL_RENDER_EXPORT`. A minor corroborating split: the two
advertised domains differ too — `print` says `i32 | i64 | f32 | f64 | boolean | string`, the hole
says `` `string` or i32 | i64 | boolean | f64 `` (f32 is admitted anyway, by widening).

**The forward hazard, which is the point.** Stage 2's `show<T>` is compiler-derived; `print`'s
scalar rendering is host-side. `show<T>` "taking over" therefore adds a **third** renderer rather
than unifying two, and the composite case makes it worse: `print(v)` for a struct would render
guest-side through `show<T>` while `print(1.5)` still renders host-side — so `print(x)` and
`print([x])` disagree on the same `f64`, which is exactly the objection D711/D712 raised when it
declined to teach `print` about containers.

This also under-cuts the doc's own §"Is this one spec" recommendation to split the rendering
family *later*, at `show<T>`. The rendering family has a live, measured defect **now**, and the
serde framing is what is hiding it.

**Remedy, and it is the `toString` ruling's unfinished half.** That ruling's argument was *there
is one of a name and it lives at the std surface*. Apply it to rendering: route `print`'s scalar
sinks through `std:fmt` so the host divergence dies and the "one widening chain" claim becomes
true, **then** let `show<T>` extend it. Do this before stage 2, not during. Split the rendering
family into its own document now rather than at `show<T>` — its defect is already independent of
serde.

---

### 7. Four `(RUN 2026-09-01)` claims are stale, by four commits merged after the doc's last refresh.

The doc's own standing rule is *"a citation is a measurement with a date on it"*, and it applies
inside a day. The last serde refresh is `45db4a9a` (#2224). Merged after it: `#2218` (D983),
`#2229` (D984), `#2230`. Re-run verbatim from the appendix:

| doc claim | filed outcome | measured now | closed by |
| --- | --- | --- | --- |
| `u8[] \| null` returning `[1, 2, 3]` — stage 0's live caveat | check-clean invalid wasm | **RUNS**, prints `3` | #2218 |
| `type T = string \| {[string]: T}` + `print("ok")` | **compiler trap**, "veto-class" | **RUNS**, prints `ok` | #2229 / #2230 |
| `const s: Json = "hello"` + `is string` | emit refusal / check-clean invalid wasm | **RUNS**, prints `hello` | #2221 |
| `is Json[]`, and via `type JsonArr = Json[]` | refused at CHECK, "not a variant" | **RUNS** (both), prints `arr` | #2221 |
| mechanism 3, `JArr = { items: Json2[] }` | `only i32[] arrays and struct/union element arrays…` | **RUNS**, prints `built` | — |

Of fact 5's three mechanisms: **mechanism 2 is closed, mechanism 3 is closed, mechanism 1 survives
only at parameter position.** The doc's sentence *"D984 is the blocking item for the whole family,
not a sibling of it"* names a closed defect as the blocker. Stage 1's advice to *"keep a `null` arm
in every recursive-map spelling until it closes"* is now exactly backwards — the `null` arm is the
ingredient that still breaks things (finding 1).

**Remedy.** Re-run the appendix before the next scheduling decision, and record a **commit id**
beside each `(RUN)` claim, not only a date. A date has one-day resolution and this family moved
four times in one day.

---

### 8. The derive's checker predicate is a FIFTH deferred capability, and it is priced as "small".

**What the doc says.** *"Cost, sized honestly. Checker: the serializability predicate +
diagnostics — small, `match`-exhaustiveness-class work."*

**The mechanism it needs exists and is excellent** — measured, and this is the plan's strongest
unclaimed precedent:

```vl
function show<T>(x: T) { print(x) }
show(1)                 // RUNS
show({ r: 2.5 })        // [ERROR]: `show` prints its type parameter here: print expects one
                        // scalar or string value (…), got {r: f64} — print the elements or
                        // fields individually
```

The refusal rides the monomorphization pin, blames the **call site's** span, names the generic and
names the offending `T`. That is precisely what `serialize<T>` needs, and it answers OQ-1(b)'s
stated worry (*"the checker's errors must be careful to blame the CALL SITE's `T`"*) as a shipped
mechanism rather than an open problem. The doc should cite it.

**But citing it means inheriting its documented limits**, all in `DECISIONS.md` under *"A REFUSAL
the checker holds must ride the pin"*:

- It needs `tyHasHole`, not `tyIsHole` (D421) — `serialize<T[]>`, or a `T` reached through a field,
  records no constraint at all under the naive predicate.
- *"a deferred constraint belongs to ONE body"*, and `validateBinCstrs` **reached only the
  direct-call spelling** — so `xs.map(x => serialize(x))` is a known blind spot of the machinery
  the derive would build on.
- D551/D561/D572: *the seam is an AXIS*. A refusal stated at `return` and nowhere else finds
  nothing; the destination must be varied (binding, field write, element write, argument).
- D401 is the worked instance: *printability* was the fourth such capability and was lost at the
  pin the same way, costing a campaign.

Serializability is strictly richer than all four existing tables (`binCstr`, `argCstr`, `escJoin`,
print): it is a **transitive walk over a whole shape**, not one yes/no about one operand, and it
must produce a *path* in its diagnostic ("field `run` of `Handler` is a function"). A
function-typed struct field is legal and running today —

```vl
type Handler = { name: string, run: (i32) => i32 }
const h: Handler = { name: "double", run: (n) => n * 2 }
print(h.name); print(toString(h.run(21)))    // RUNS: "double", 42
```

— so the predicate has real work to refuse, at every position.

**Remedy.** Re-price the checker line as *a fifth deferred-capability table, with the four
predecessors' known holes to close by construction*, and budget the position matrix. Keep the
emitter estimate as is — that half reads about right.

---

### 9. OQ-5's "one form per format" is a fork wearing unification's clothes. **Accepted cost — but print the matrix.**

The owner has repeatedly collapsed forks: one `toString`, one hole syntax, one renderer, one brace
rule. OQ-5 reads as another collapse — *"it is not a switch, it is ONE FORM PER FORMAT"* — and it
is genuinely better than a mode byte. The doc's argument (disjoint constituencies, one evolution
story each, no doubled fixture column) is correct and I would not overturn it.

**But the divergence is larger than OQ-5's one row, and it is distributed across seven sections so
nobody sees it at once.** Assembled from the doc:

| policy | VLB | JSON | `flat` | `show<T>` |
| --- | --- | --- | --- | --- |
| general unions | u8 arm index | untagged, reader-directed | n/a | rendered |
| literal unions | the literal value | the literal value | n/a | rendered |
| field order | sorted-name (fact 3) | key order per the map | **declared order** | walk order |
| cycles | back-reference tags | **refuse** | n/a | `<cycle →#N>` marker |
| NaN | bits verbatim | **refuse at encode** | bits | `NaN` |
| `i64` | 8 bytes exact | decimal **string** | 8 bytes | decimal |
| `f32` | 4 bytes | shortest-for-f32 (unbuilt) | 4 bytes | widened f64 (today) |
| maps | insertion order | insertion order | n/a | insertion order |
| newtypes | refuse (OQ-6) | refuse (OQ-6) | n/a | ? — never stated |
| evolution | none | tolerant | foreign spec | n/a |

That is one walk and **four leaf policies**, disagreeing on eight rows. The `flat` lane's
*declared* order against the derive's *sorted* order is a genuine two-rulebook conflict the doc
already identifies (§Flat types, position A vs B) — and Position A's reasoning is right.

**Verdict: accepted cost.** These really are different requirements and a single answer would be
worse. Two asks, though. **(a) Print this table in the doc**, so the divergence is one page rather
than seven sections — a policy matrix nobody can see is how a "shared walk" acquires a fifth leaf
policy without anyone deciding. **(b) The `show<T>` column has a hole**: newtypes, and finding 6's
host-vs-guest split. Fill it before stage 2, because `show` is the column with no round trip to
keep it honest.

---

### 10. `s as Config` needs an open question the doc never names.

The owner wants `s as Config` eventually. Measured, today:

```vl
const c = s as Config      // [ERROR]: `as` supports numeric conversions only
```

The spelling the plan actually delivers works cleanly and is good:

```vl
function load(s: string): Config | JsonError {
  const c = fromJson(s) as Config      // propagates JsonError
  c
}
// check rc 0, RUNS
```

So `x as T` over a decoder's **result union** is the plan's real answer, and it is a good one.
`s as Config` — a `string` operand and a struct target — is a *third* `as` lowering that the
unified-`as` principle does not currently have an arm for, and it is `error-handling-design.md`'s
**O6(b) user-defined casts**, still open. The composition question the serde doc should ask and
does not: *a user cast is declared per (source, target) PAIR, which is exactly the per-type tax
stage 2 exists to delete — so does `as` reach the derive, or does `s as Config` stay a hand
declaration per type?*

(A related asymmetry worth one line: `4 as F32Base` — a scalar newtype — works, while
`{ v: 1.0 } as Meters` refuses with the same numeric-only sentence. `as` into a newtype is
half-built, and OQ-6 is deciding a newtype policy without it.)

**Remedy.** Add an OQ, or one paragraph in §Recommendation, saying which spelling is chartered.
`fromJson<Config>(s) as Config` is a perfectly good answer; it just has to be *the* answer, said
out loud, so `s as Config` is not quietly assumed to arrive with the derive.

---

## What the plan gets RIGHT — a critic should not touch these

1. **Approach 2 as the destination, and fact 1's re-derivation.** The old argument ("no bounded
   polymorphism") died when constraints were ruled, and the doc noticed and rebuilt the conclusion
   rather than inheriting it: *a bound grants CALLS on a generic receiver; it does not grant FIELD
   ENUMERATION.* That is exactly right, it is why Rust needs `#[derive]` beside its traits, and it
   is the load-bearing argument for the whole document. Re-deriving instead of patching is the
   behaviour CLAUDE.md asks for and it is rare to see done.

2. **OQ-1(b), std-shimmed intrinsics.** The right call, for the right reason, with a real shipped
   precedent (`TPL_RENDER_EXPORT`'s absolute binding, its no-pollution mechanism, and its byte-
   identity proof). It satisfies "no builtin" without inventing syntax, and it correctly rejects
   (a) a type marker on the ground that markers are nominal and VL types are structural — a
   category error the doc names as one.

3. **§Snapshot.** The strongest analytical section in the document. "Snapshot belongs *below* the
   language or *above* it, never at the serde layer" is a genuine finding, the WasmGC argument for
   why "could always do that at the byte level" is mostly false is correct, and converting *"what
   silently didn't survive the snapshot"* into *"what the checker made you move out of your state
   type"* is the right trade stated the right way.

4. **§Flat types' dividing question.** *"The dividing question is not performance, it is who owns
   the layout"* is the correct axis, and Position A (permanently separate lanes) is the right call
   for the reason given: the two rulebooks disagree about field order and a bridge must break one.

5. **OQ-4: `canonicalize<T>` over an encode flag.** Textbook application of the std rubric. It
   keeps `serialize` at exactly one contract, makes the lossy step visible and attributable at the
   call site, and generalises to future canonicalisation questions where a boolean would need one
   each. Deferring it until a consumer names itself is also right.

6. **Maps in insertion order, refusing to sort.** Correct, and correctly argued from measurement:
   VL map order is observable, so sorting would make `decode ∘ encode` non-identity — the silently-
   lossy shape the std review exists to catch. Naming this as a *considered deviation from borsh*
   in the module header is the right form.

7. **OQ-3, and how it got there.** The doc found its own premise ("payload bits are engine-
   nondeterministic") was unverified, measured it across both hosts, reported that the measurement
   *weakened* the case for the answer it still recommends, and recommended it anyway on different
   grounds. That is the intellectual honesty the repo's rules are trying to institutionalise.

8. **Literal unions encode as the literal value, not an index.** Consistent with the owner's
   unions-over-enums posture, survives member insertion and reordering, and is the same instinct
   that made declaration order carry no type identity. Right call.

9. **Untagged JSON's common case genuinely works today**, which the doc asserts and I confirm.
   Both measured RUNS: `string | f64 | Circle` (disjoint by JSON token type) and `Circle | Rect`
   (disjoint field-name sets), constructed at runtime, returned, and narrowed on every arm. OQ-7's
   *direction* is well chosen even though its ambiguity analysis needs the rework in finding 5.

10. **`as` composes over both error shapes**, measured, which is the load-bearing half of the
    error-model fit: `parseF64(s) as f64` inside an `f64 | null` return runs; `decodeBase64(b) as
    u8[]` and `parseF64(n) as f64` in one body, propagating a struct arm and a null arm into
    `i32 | Base64Error | null`, checks clean and runs. Finding 4 attacks the *naming* fan-out, not
    the propagation mechanism — that part works.

11. **§"Is this one spec or several concerns?"** — the doc turning the owner's question on itself
    and answering *"partly yes"*, then identifying the rendering family as the accreted fourth
    concern, is better self-criticism than most external review produces. Finding 6 argues only
    that the split should happen **now** rather than at `show<T>`, which strengthens the doc's own
    conclusion rather than opposing it.

---

## Appendix — probe index

All programs above are complete and were run as
`VL_STD=<worktree>/std vl {check,run} <probe> --compiler build/vl-compiler.wasm` against the
fixpoint-proven seed named in the header. Grouped by finding:

| finding | probes |
| --- | --- |
| 1 | value tree without a `null` arm (RUNS); + `null` arm (emit refuse); map read is `V \| null` (check refuse) |
| 2 | `const` vs parameter position, 5-row control table; `capability-probes/run.py` (17/20, both json-tree probes GAP) |
| 3 | newtype-branded struct field (RUNS); `std/buffer.vl:48/380/409`; function-typed struct field (RUNS) |
| 4 | `is Err` / `is {msg: string}` / exact-arm control; `as f64` propagating null into a `JsonError` return |
| 5 | two newtypes in one union (check refuse); `A \| B` identical arms (RUNS); `{x:i32}\|{x:f64}` (emit refuse); `{x}\|{x,y}` (RUNS) |
| 6 | `f64fromBits(4835952189745799117)` through print / `toString` / a hole; `f32` through print and a hole |
| 7 | the five appendix programs in finding 7's table, verbatim |
| 8 | `function show<T>(x: T) { print(x) }` at `i32` and at `{r: f64}` |
| 10 | `s as Config`; `fromJson(s) as Config`; `4 as F32Base` vs `{v: 1.0} as Meters` |
