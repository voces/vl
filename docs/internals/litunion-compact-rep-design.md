# The literal-union COMPACT REP inside a mixed union (webcraft P2 / A16)

**Verdict: FILED, not shipped.** The rep's stated benefit — *fewer allocations* — is
**refuted by measurement**, and the correctness defects it would close are **blocked on
three owner rulings** (an ABI-wide tag re-base, a new wasm instruction family, and what
`K | K2` should mean) that no slice should make on its own. This document records the
measurement, the four defect families it
found, the ruling each design question has with the alternative it beats, and the two
follow-on slices the filing hands off — each with its own population.

Measured off `master` at `5e59abdf` (post-#1300 preserve, post-#1303/#1304), with the
seed-built compiler (`scripts/fetch-seed.sh` + `scripts/refresh-compiler.sh
--prove-fixpoint`, which reports *"the seed IS the fixpoint"* at this base).

---

## 0. The ask, and what the preserve ruling opened

`docs/webcraft-requirements.md` §P2 lists it as *"Literal-union compact representation
(A16 remaining): order/state enums stored as i32 tags rather than softened values — mostly
a memory nicety since authoritative enums live in Buffers anyway."* Wanted, not gating.

A **standalone** litunion already reps as a compact interned i32 ATOM id — `internAtom`,
one id per distinct member lexeme, module-global. Four **keep positions** rep it that way
too (`ctxKeepsLitUnion`: an array ELEMENT, a struct FIELD, a map VALUE, a function
RESULT). What does *not* is the **MEMBER OF A MIXED UNION** — `K | f64`, where the box's
payload is a **string ref**, not the atom.

The preserve ruling (#1300, owner 2026-07-29) made the emitter's vocabulary keep litunion
identity inside a mixed union: `K | f64` is spelled `K|f64`, not `string|f64`, by all four
producers. The rationale given for why preserve keeps a door open was: *a mixed box could
store its litunion member as the compact atom id, and that is only spellable if the
vocabulary distinguishes `K` from `string`.* It now does. This document walks through that
door and measures what is on the other side.

---

## 1. What a mixed box stores today, and the ONE root cause

### 1.1 The box, and the litunion arm's place in it

The value-union box is `(struct (field i32) (field anyref))` — `{tag, value}`. The tag
alone discriminates the arm; every consumer (`is`, `??`, the narrowing push, the unbox
reads) reads **field 0 and nothing else**. That is the load-bearing invariant of the whole
design, and §4 is about what happens when a rep violates it.

Tags are three interleaved bands over `uVariants.length` (`emit_rep.scalarTagOfKind`,
`emit_classify.refArrSlotTag` / `mapSlotTag`):

| band | formula | occupies |
|---|---|---|
| struct variants | `0 .. uVariants.length-1` | dense ranks (`assignTags`) |
| value ATOMS | `uVariants.length + k`, `k ∈ 0..12` | 13 fixed slots |
| ref-element ARRAYS | `uVariants.length + 13 + 2·slot` | the ODD offsets from +13 |
| MAPS | `uVariants.length + 16 + 2·slot` (mono slot `-1` → +14) | the EVEN offsets from +14 |

The value-atom band is **13 wide and full**: `0 i32 · 1 boolean · 2 string · 3 i64 · 4 f64
· 5 f32 · 6 null · 7 i32[] · 8 f64[] · 9 string[] · 10 i64[] · 11 closure · 12 f32[]`. A
**14th** code lands on `uVariants.length + 13`, which is ref-array slot 0. The two slot
bands are parity-interleaved and jointly saturated, so a third family — or a widened atom
band — **re-bases both**. Hold that; §4 spends it.

A litunion member is not in that table at all. `isArmTagOfTy` gives it kind 2's tag by
hand:

```
  let ak = unMemAtomKind(ity)
  if ak < 0 {
    if tyIsLitUnion(ity) { ak = 2 }      // "boxes as the STRING ref its members are"
  }
```

and `emitUnionCoerce`'s ladder reaches the same code the other way — `exprString(exprIx)`
claims a string LITERAL, so `cak = 2` and the payload is the string.

### 1.2 The root cause, in one line

**`valueAtomKind` has no arm for a literal-union member.** `valueAtomKind("K")` walks its
seven primitive compares, the five list-element compares, `litUnionArrayElemOf` (which
answers only for `K[]`), `nulElemListAtomKind` and `nameIsFuncTypeAtom`, and returns
**`-1`** — *not a value atom*.

That is not an inference; the tree says so beside the workaround. `emit_base.unionHasValueAtom`
carries an explicit second test with the reason written out:

```
    const k = valueAtomKind(atoms[i])
    if k >= 0 && k != 6 { return true }
    // A litunion-ALIAS atom (`K0 | {w: i32}`) rides the box as its member-string atom …
    if nameIsLitUnionType(atoms[i]) { return true }
```

So the emitter's kind vocabulary answers **"not a value atom"** for a litunion member, and
individual gates compensate — or do not. **Measured: of 42 `valueAtomKind` call sites in
`compiler/*.vl`, 7 have a litunion leg within ±6 lines and 35 do not** (§10 derives the
42 from three `grep`s; CALLS excludes the definition line and comment mentions).
`isValueUnionName` (36 call sites) has no such leg, so `isValueUnionName("K|f64")` is
**false**; its banked twin `msIsValueUnion` short-circuits on the same `-1`.

Every defect in §2 is a place where a gate was not taught the missing half. This is the
"classifier taught HALF a set" shape, and here it is quantified rather than anecdotal.

### 1.3 Why two 13-site coercion censuses did not find this

#1296 and #1300 each censused the union-coercion sites (*"13 sites, 6 arena-keyed, 7
name-keyed"*) and each concluded correctly that **none keys on the preserved spelling** —
which is why the preserve ruling could ship without touching the rep. Both censuses asked
*"does any existing site read the name I am changing?"*. Neither asked *"is a site
MISSING?"*, and F1 is a missing site: `emitUnionCoerce`'s ladder has no litunion arm to
census. #1300's own finding — the fourth site was a CONSUMER nobody had enumerated — is
the same lesson one step earlier. **An enumeration of the sites that exist is not an
enumeration of the sites that should.**

---

## 2. The blast radius — 244 cells, 81 broken

Two grids, both with an EXPECTED-stdout oracle so a silent wrong answer is its own outcome
class. Classes, best to worst: `RUN-OK` · `RUN-WRONG` (runs, wrong answer) · `RUN-TRAP` ·
`INVALID-WASM` (`vl check` rc 0, `vl build` rc 1, validator message) · `EMIT-REJ` (`vl
build` rc 1, `emitProgram:` — a loud, clean reject) · `CHECK-REJ`.

**G1 — the declared ALIAS**, 8 mixed spellings × 20 ops = **160 cells**:

| class | cells |
|---|---|
| RUN-OK | 103 |
| RUN-WRONG | 31 |
| INVALID-WASM | 22 |
| EMIT-REJ | 4 |

**G2 — the UN-ALIASED INLINE run**, 6 spellings × 14 ops = **84 cells**:

| class | cells |
|---|---|
| RUN-OK | 60 |
| RUN-WRONG | 11 |
| INVALID-WASM | 12 |
| EMIT-REJ | 1 |

**244 cells, 81 broken — 42 of them SILENT (`RUN-WRONG`), 34 invalid wasm, 5 loud.** Every
one is `vl check` rc 0.

### 2.1 G1's `b_inl` row was a CONTAMINATED CONTROL, and it cost the first pass 10 cells

G1's first pass spelled its inline row `("aa"|"bb") | f64` **in a file that also declared
`type K = "aa" | "bb"`**. Identical member sets: the ALIAS registration answered every
INLINE lookup and the inline half **greened falsely** — G1 reported `b_inl` at 15 OK / 5
broken, the same profile as the alias.

Re-run as G2 with members that differ (`("pp"|"qq")`, and **no alias declared in the
file**), the inline half is materially worse: the narrowed READ of the inline arm
(`print(x)`, `x + "!"`) is **INVALID WASM in 5 of 6 mixed spellings**, where the alias twin
runs. `b_inl` is excluded from every G1 number above for this reason.

*A control is a control because its members DIFFER.* The rule is #1304's; it fired here on
this document's own first grid, which is why the floor fixture spells the two halves
`"aa"|"bb"` and `"pp"|"qq"` and says so in a comment.

### 2.2 The four defect families

*They are families, not a partition — a `K | string` cell can belong to F1 and to F3 at
once, so the counts below deliberately do not sum to 81.*

**F1 — an atom-typed VALUE entering the box (24 cells).** `const k: K = "aa"; const x: K |
f64 = k` — and the same through a `K`-returning call, and at an argument boundary. 8 cells
per op × 3 ops (`S02atom_isK`, `S03call_isK`, `S18param_atom`), across all mixed
spellings.

`emitUnionCoerce`'s ladder has no litunion arm, so an atom value falls past every branch to
the numeric default and then to the union's own promotion rules:

- `K | f64` → **`cak = 4`**. The emitted body is `i32.const 0` (the atom id) → `i32.const
  4` (the f64 TAG) → **`f64.convert_i32_s`** → `struct.new $vbF64` → `struct.new $uBox`.
  The atom id is converted to a FLOAT and tagged f64. `is K` compares tag 2 and is false:
  the program prints `O` where `K` is correct. **Silent miscompile.**
- `K | string` → `cak = 0` (no i32/i64/f64/f32 atom to promote to), tag 0, and the raw i32
  atom is pushed at the box's `anyref` payload: `type mismatch: expected anyref, found
  i32`. **Invalid wasm.**
- `K | i32[]` → the same invalid wasm.

**F2 — the narrowed arm read back into a `K`-typed position (16 cells).** `if x is K {
const y: K = x }` and `if x is K { show(x) }` where `show(k: K)`. **8 of 8 mixed spellings
each, INVALID WASM**: `type mismatch: expected i32, found (ref $type)`. The box holds a
string ref; the destination's rep is the i32 atom id, and nothing converts.

This is the direction the string rep is genuinely bad at: going back requires a chain of
`__str_eq__` calls against each member constant, where the compact rep is a no-op.

**F3 — TWO members on ONE tag.** The two colliding spellings' rows are the worst in either
grid: `K | string` 12 OK / 8 broken and `K | K2` 4 OK / 16 broken on G1, and `K | string`
**1 OK / 13 broken** on G2 — against 15 OK / 5 broken for every non-colliding alias
spelling.

- `K | string`: both arms claim kind 2. Six lines reproduce it —
  ```vl
  type K = "aa" | "bb"
  function go() {
    const x: K | string = "zz"
    if x is K { print("K") } else { print("O") }   // prints K
  }
  go()
  ```
  A value that is not a `K` claims the `K` arm. The module contains exactly **one**
  `struct.new`, so there is no collapse to a single member — it is two arms sharing one
  tag. The comment in `tests/cases/unions/litunion-value-union-is.vl` (from #845) asserts
  the opposite — *"A real `string` member cannot coexist (`K0 | string` collapses to
  `string`), so the string tag never collides"* — and that invariant **does not hold on
  master today**.
- `K | K2` (two distinct litunions): worse. The union reps as a **plain string, with no box
  at all**, and `is K` is **const-folded to `i32.const 0`** — a guard that can never fire.
  12 of 20 cells `RUN-WRONG`, one `EMIT-REJ` naming the registration gap directly
  (`emitProgram: union box atom test on a union with no recorded members: string`).
- The INLINE spelling of `K | string` collapses hardest of all: `is ("pp"|"qq")` answers
  false in every position, and the return and param boundaries are invalid wasm
  (`expected struct type at index 0, found (array (mut i32))` — a raw string array where
  the box belongs).

**F4 — the inline-only narrowed read (10 cells).** §2.1 above. The un-aliased run diverges
from its own alias twin at `print(x)` and `x + "!"`.

### 2.3 Reach — where these shapes actually live

| population | count | how |
|---|---|---|
| corpus `.vl` files | 1,696 | `find tests/cases -name '*.vl' \| wc -l` |
| …declaring a litunion ALIAS | 165 | `grep -rlE '^ *type +[A-Za-z0-9_]+ *= *"' tests/cases \| wc -l` |
| …with the alias beside `\| null` only (a NICHE, not a box) | 40 | per file, take the declared alias NAMES and look for each beside a `\|` on a non-declaration line |
| **…with the alias beside a NON-null arm (a mixed BOX)** | **23** | ” , excluding the `null` sibling |
| …with an INLINE litunion inside a union | 1 | `grep -rlE '\("[^"]+" *\|[^)]*\) *\|\|\| *\("[^"]+" *\|' tests/cases` |

The 23 are concentrated in `tests/cases/closures/` (11) and `tests/cases/maps/` (4), plus
`literal-unions/` (2), `unions/` (3), `lists/` (2), `types/` (1).

### 2.4 Fuzz reach — present, and VACUOUS on exactly the broken half

Measured, not banked. Two batches of 800 cases, produced by running `scripts/fuzzgen.vl`
with a `sed`-injected seed/count/depth exactly as `scripts/fuzz-vl.sh` does (seeds
12345/777, depth 3/4, the second with `DECLTYPES`/`BRANCHING` on):

| | seed 12345 | seed 777 |
|---|---|---|
| litunion ALIAS declarations | 106 | 132 |
| `K<n>` beside `\| null` (a niche) | 24 | 22 |
| **`K<n>` beside a NON-null arm (a mixed BOX)** | **26** | **14** |
| INLINE litunion spellings | **0** | **0** |

So `scripts/fuzzgen.vl` **does** reach litunion-in-mixed-union. The standing note that it
has "zero inline-litunion reach" is right about the inline half (0 and 0) and wrong to
imply the alias half is absent too.

**But the reach is vacuous on every defect family.** Reading the generated cases: the
carrier is always a member **LITERAL** stored into the box, then `is K0` + `print` —

```vl
type K0 = "0206" | "fpt" | "njx"
const g: K0 | i64 = "fpt"
function go() { const t0 = g; if t0 is K0 { print(t0) } else { print("OTHER") } }
```

— which is grid cell `S01lit_isK` composed with `S06narrow_print`, both `RUN-OK`. The
generator never stores an atom-typed **value** (F1), never reads a narrowed arm back into a
`K`-typed **position** (F2), and its decoy-admissibility rule deliberately forbids pairing
a litunion carrier with `string` (F3). A 400-case × 2-seed run reports **0 findings**, and
that is a true report about shapes it cannot generate.

---

## 3. RULING 1 — the litunion member must become a value-atom KIND

**The rep question is downstream of a vocabulary question.** Before asking whether the box
stores an i32 or a string ref, the emitter has to have a *code* for "this member is a
literal union" — and it does not (§1.2). Give it one, and F1/F2/F3 all become
expressible; leave it out, and every fix is another `nameIsLitUnionType` leg bolted beside
another `valueAtomKind` call.

### Alternatives

- **Keep the `string` alias; bolt a litunion leg at each gate that needs one.** This is
  today's design, and it is measurable: **7 of 42** `valueAtomKind` sites have the leg and
  **35** do not. It is not that the 35 are wrong — most never see a union member — but
  there is no way to tell which do without visiting all 42, and the four defect families
  are exactly the ones nobody visited. Rejected: the cost is proportional to the number of
  gates *forever*, and a missed gate is a silent miscompile (F1's `f64.convert_i32_s` is
  the specimen). This is the same argument #1110 made for putting the kind→tag table in one
  home rather than deriving it per site.
- **One kind for "any litunion" (code 13).** The cheapest version: `valueAtomKind` and
  `unMemAtomKind` gain an arm, `scalarTagOfKind` covers `0..13`, `refArrSlotTag`'s `+13`
  becomes `+14` and `mapSlotTag`'s `+16` becomes `+17`. Two constants. It fixes F1, F2 and
  the `K | string` half of F3 (kind 13 vs kind 2 discriminate), and does **not** fix `K |
  K2` (both members would be kind 13). See §4 for why that residue cannot simply be
  rejected.
- **A per-member-SET slot, interned like `rlSlot`/`mvSlot`, with its own tag band.** Fixes
  F3 completely. Costs a third slot family in a two-family parity scheme that is already
  saturated (§1.1) — so both existing bands re-base, which renumbers **every union box tag
  in every program**. #1300's own corpus A/B is the calibration: **6 files moved on BYTES**
  from a tag renumbering caused by ONE duplicate union row disappearing. A deliberate
  re-base moves far more, and its diff is uniform-but-total, which is the hardest kind of
  A/B to grade.

**Ruling: the kind code is required; WHICH of the two shapes it takes is an owner ruling
(§7.1), because the second one is an ABI event.**

---

## 4. RULING 2 — a loud reject is NOT available for the collision shapes

The obvious containment for F3 — reject `K | string` and `K | K2` at the emitter, loudly,
and say why — is **illegal under the program's own law**, and this is measured rather than
argued.

An outcome class must never move DOWN. `RUN-WRONG → EMIT-REJ` is UP (a silent wrong answer
becoming a loud reject). But a blanket reject of the *shape* takes its working cells down
too:

| shape | cells that would move DOWN (`RUN-OK → EMIT-REJ`) |
|---|---|
| `K \| string` (alias) | 12 — store, narrow-print, narrow-eq, return, param, global, field, element, map-value, nullable, nul-narrow, concat |
| `K \| K2` | 4 — `S04`, `S05`, `S09return`, `S10param` |

A reject scoped to the *operation* rather than the shape does not escape it either: the
unsound operation is `x is K`, and `is K` over a `K | string` box is `RUN-OK` in G1's
`S01lit_isK` — right answer, accidentally, because both arms carry tag 2 and the value
stored happened to be a `K`. Rejecting the test takes that cell down.

**Therefore F3 is BLOCKED on the rep.** It is not independently fixable. The expected
outcome going in was *"if the two members cannot stay discriminable, that shape gets a loud
reject and the design says why"* — and the design says why the reject is unavailable
instead: it would cost more working cells than it saves.

This is also the sharpest argument for the per-set slot (§3's third alternative) over the
single kind: the single kind leaves `K | K2` permanently unfixable-and-unrejectable.

---

## 5. RULING 3 — the payload encoding, and why `ref.i31` is the only one that does not REGRESS

Given a kind code, what does the box's `anyref` field hold for that arm? An i32 atom id is
not a reference. Three encodings:

| encoding | allocations per store | new wasm vocabulary | discriminable by `ref.test`? |
|---|---|---|---|
| the existing `$vbI32` scalar value box | **2** (`struct.new $vbI32` + `struct.new $uBox`) | none | yes |
| **`ref.i31`** | **1** (the box only — `ref.i31` is a tagged pointer, not a heap object) | `ref.i31`, `i31.get_u`, `ref.cast (ref i31)` | yes |
| widen the box to `{i32 tag, i32 scalar, anyref value}` | 1 | none | n/a |

The third is dismissed immediately: it changes the layout of **every** union box in every
program and costs a machine word per box module-wide, to serve one arm.

Between the first two, `ref.i31` wins on the only axis that matters here, and the reason is
§6: today's store already costs exactly one allocation, so the value-box route is a
**regression**.

### `ref.i31` is available in all three engines this project targets — measured

The probe module, which exercises every instruction the encoding needs:

```wat
(module
  (type $box (struct (field i32) (field anyref)))
  (import "imports" "__print_i32__" (func $p (param i32)))
  (func $go
    (local $b (ref $box))
    (local.set $b (struct.new $box (i32.const 2) (ref.i31 (i32.const 41))))
    (call $p (i31.get_s (ref.cast (ref i31) (struct.get $box 1 (local.get $b))))))
  (start $go))
```

| engine | how measured | result |
|---|---|---|
| `wasm-tools` **default** (shipped-proposals) feature set | `wasm-tools parse i31.wat -o i31.wasm && wasm-tools validate i31.wasm` | rc 0, rc 0 |
| V8 (deno, the JS test host) | a two-line `deno run` that instantiates it with a `__print_i32__` import | prints `41` |
| wasmtime 47 (`vl-host`, `cfg.wasm_gc(true)`) | `vl check <any>.vl --compiler i31.wasm` | fails at **import resolution** (`unknown import: imports::__print_i32__`), i.e. `Module::new` VALIDATED it before instantiation |

The third row is the decisive one and it is cheap: a feature-gated instruction fails inside
`Module::new`, before imports are consulted, so reaching an import error proves validation
passed. (`--compiler` hands wasmtime an arbitrary module; the probe borrows that door.)

The emitter has **zero** `i31` today (`grep -rn 'i31' compiler/*.vl` → nothing). Adding an
instruction family to the emitted vocabulary is an owner call (§7.2), not a slice's.

---

## 6. THE ALLOCATION RATIONALE IS REFUTED — and what the real win is

This is the finding that decides ship-or-file, so it is stated with its witness.

**The claim under test:** *a mixed union box storing its litunion member as a string ref
allocates, and storing the atom id instead would not.*

**The witness** — a member literal stored into `K | f64` (§10 has the exact program and the
two commands). The store's whole emitted sequence is three instructions:

```wat
i32.const 2        ;; the string TAG
global.get 0       ;; the pooled "aa"  <-- NOT an allocation
struct.new 0       ;; the union box    <-- the ONE allocation
```

Every distinct string literal within the `array.new_fixed` operand cap is interned into an
**immutable global** by `collectStrPool`, and `emitStr` lowers a pooled literal to a single
`global.get`. So the litunion member's string is **already free**: the store costs exactly
**one** `struct.new`, which is the box itself.

No rep can go below one. `ref.i31` matches it; the `$vbI32` route **doubles** it. **The
allocation win is zero, and the value-box variant of the compact rep is an allocation
regression.**

The bar this slice was to clear before shipping was *byte/alloc evidence of the win — a
witness program's WAT losing the string-ref path*. There is no such witness to show, because
the string-ref path does not allocate. **That bar cannot be met, and that is the
ship-or-file answer.**

### What IS real

**Equality.** `x == "aa"` on the narrowed litunion arm of a `K | f64` box lowers to:

```wat
local.get 0
struct.get 0 1     ;; the box payload (anyref)
ref.cast (ref 2)   ;; cast to the string array
global.get 0       ;; the pooled "aa"
call 8             ;; __str_eq__  — a per-code-point LOOP
```

Under a compact rep that is `struct.get` → `i31.get_u` → `i32.const <atom id>` → `i32.eq`:
a cast and an O(len) helper call replaced by one comparison. This is the *"faster
equality"* half of the original rationale and it survives measurement intact.

**Code size at a dynamic store.** Going the other way today needs `emitAtomToStr`, a
`select_t` tower of N−1 compares over the member constants plus a string-op scratch-frame
reservation. Under the compact rep the store is a bare push. (Note that this cost is
currently *unpaid* — F1 shows the ladder never calls `emitAtomToStr` at a union boundary at
all, which is precisely why F1 miscompiles.)

**Correctness.** 81 of 244 grid cells (§2). This is the largest term by far, and it is
worth being blunt about it: **the compact rep is not primarily a performance change. It is
a vocabulary fix wearing a performance rationale.** §3 is the ruling that says so.

---

## 7. What the owner has to rule before this can be built

### 7.1 The tag scheme — a 14th atom kind, or a third slot band?

Both re-base the existing bands; they differ in how far.

- **14th kind** — `refArrSlotTag` `+13 → +14`, `mapSlotTag` `+16 → +17`. Two constants, 5
  and 3 call sites. Fixes F1, F2, and `K | string`. Leaves `K | K2` broken **and
  unrejectable** (§4).
- **Third slot band** — an interned litunion member-SET table, tags interleaved 3-ways
  instead of 2. Fixes F3 completely. Renumbers every union box tag in every program.

Either way the renumbering is a **uniform** ABI move whose corpus A/B is all-BYTES: #1300
saw 6 files move that way from a single vanished union row, and the published band formulas
(all rooted at `uVariants.length`) are what makes such a diff explicable rather than
alarming. A deliberate re-base needs that explanation prepared *before* the A/B, not after.

### 7.2 `ref.i31` in the emitted vocabulary — yes or no?

Measured available in all three engines (§5). It is nonetheless the first non-struct,
non-array GC instruction family this emitter would use, and the alternative (`$vbI32`) is
a measured allocation regression, so "no i31" and "compact rep" are close to mutually
exclusive.

### 7.3 `K | K2` — what should it MEAN?

Today it silently reps as a bare string with `is K` const-folded false. Two coherent
answers:

- **Two distinct tags** (the third band, §7.1). Fixes all 16 cells, costs the ABI move.
- **FLATTEN it** to one litunion `"aa"|"bb"|"cc"|"dd"` — a pure litunion, so it reps as the
  interned ATOM and never boxes — and let `is K` be a **membership test over K's subset**.
  **SHIPPED as slice C (#1306) — see §8.3, including the one claim below that measurement
  refuted** (the work was not "only the render": the checker's annotation-union arm never
  flattened a union member either, and moving the render alone is 12 cells DOWN).
  The runtime half genuinely is free, and that is the measurement below:

  ```vl
  type K  = "aa" | "bb"
  type KA = "aa" | "bb" | "cc" | "dd"     // what `K | K2` would flatten to
  const x: KA = "aa"
  if x is K { print("K") } else { print("O") }   // K   ✓
  const y: KA = "cc"
  if y is K { print("K") } else { print("O") }   // O   ✓
  ```

  `emitIs`'s `laTexts` ladder emits `id == m0 || id == m1 || …` over the TESTED type's
  members and even folds to `true` when the receiver's own members are within the tested
  set. So the entire runtime story for `K | K2` exists; the only thing missing is that the
  checker renders `K | K2` as `string` instead of flattening it. This is **independent of
  the rep and of §7.1**, and it is the only one of the answers that could ship as its own
  slice. It is also what the preserve ruling itself gestured at: *"preserved as `K | f64`
  **or flattened to the constituent parts of `K | f64`**"*.

A third option — reject `K | K2` — is **not** coherent: §4's arithmetic does not care which
phase the reject comes from, so a checker-level reject moves the same 4 `RUN-OK` cells down
that an emitter-level one does.

### 7.4 The rep KEY — `repCanonKeyGo`'s mix-widen inverts

`emit_rep.repCanonKeyGo`'s union arm rewrites a litunion member of a MIXED union to
`"string"` for KEYING, and dedups `K0 | string` down to one `"string"` render. Its comment
records the invalid-wasm finding that motivated it (fuzz-nightly `29875839073`, the
declared leg of `mix:{a: K0 | {w: i32}, …}` at seed 88370995 d6): without the widening a
declared and an inline spelling keyed differently, declined the struct-twin dedup, and
minted two byte-identical but iso-recursively DISTINCT heap types.

Under a compact rep that widening must invert — the member is an atom, not a string — which
**fragments struct-twin rows** and must not reopen that finding. The mirror at
`emit_rep.vl:522` moves with it, and `canonLitUnionArms`'s `hasOther` gate (which the
preserve ruling already emptied of its widening leg) states the rep distinction that would
now become load-bearing.

---

## 8. The three follow-on slices this filing hands off

None is a partial compact rep; all three are correctness fixes in the CURRENT rep, and each
adds a leg the compact rep also needs. **Slice C is the one to take first** — it is
rep-independent, it needs no ruling from §7, and its entire runtime half already works.

### 8.1 Slice A — the atom→box STORE boundary (F1, 24 cells)

`emitUnionCoerce` gains a leg above the value-atom ladder: an `exprIsLitAtom` value flowing
into a union with a litunion arm classifies `cak = 2` and lowers through `emitAtomToStr`
instead of falling to the numeric default.

**The hazard is the RESERVATION SCAN, not the emit.** `emitAtomToStr` stashes the atom id in
the string-op scratch frame (`setStrScrI`), and that frame is reserved by a scan
(`emit_classify`) whose five atom-widening predicates — `callWidensAtomToStr`,
`assignWidensAtomToStr`, `letWidensAtomToStr`, `retWidensAtomToStr`,
`globalInitWidensAtomToStr` — each key on the TARGET being spelled `string`. A union target
carrying a litunion arm is the missing sixth, at all five sites plus the positions the five
do not cover (a struct field, an array element, a map value). Adding the widen without the
reservation is invalid wasm — the exact scan-vs-handler mismatch that is this repo's
richest silent-invalid-wasm vein. The probe is DELETE THE BYSTANDER: remove one taught
predicate at a time and confirm a named witness moves.

A cheaper variant worth measuring first: for a **2-member** litunion the tower is one
`select_t` and the id is consumed exactly once, so no stash — and no frame — is needed. If
most real litunions are small, the reservation problem shrinks to the 3+-member case.

### 8.2 Slice B — the box→atom READ boundary (F2, 16 cells)

`if x is K { const y: K = x }` needs string→atom. Under the string rep that is a chain of
`__str_eq__` calls against each member constant; under the compact rep it is nothing at
all. **This slice should wait for §7's rulings** — it is the one place where doing it in the
current rep is throwaway work, and its 16 cells are `INVALID-WASM`, i.e. loud, not silent.

### 8.3 Slice C — FLATTEN `K | K2` — **SHIPPED (#1306)**, and it was NOT "entirely in the render"

A union all of whose members are literal unions is a literal union. On master the checker
rendered `K | K2` as `string`, so it repped as a bare string, `is K` const-folded false, and
16 of 20 grid cells were broken.

**The filing's premise was half right and the wrong half was the expensive one.** §7.3 is
correct that the runtime is free — the flattened target already runs — but it inferred from
that that "only the checker's render has to move", and **that is refuted by measurement**.
The render-only change is **2 cells UP and 12 DOWN**. The root cause is one arm the filing
never opened: **`tsToTyReal`'s `TS_UNION` arm (and its `nameToTyReal` twin) never flattened
a union member**, so `K | K2` interned as a `TyUnion` whose MEMBERS ARE UNIONS. `tyIsLitUnion`
is structural over `TyLit` members, so it answered NO for the whole annotation — which means
`litUnionInlineNameOfTy` declined, both renderers softened, and `anyLitUnionUsed` never set
`gLitUnionUsed`, turning off every atom classifier **in the module**. Teaching canon to
SPELL the flattened members while the arena still says "not a literal union" is strictly
worse than either alone: the annotation names an atom and the local slot is a string ref.

The shipped shape is therefore an ARENA change with a canon mirror, `annUnionInnerTy` +
`litUnionFlatten`, and four gates each of which was measured rather than reasoned:

| gate | what it excludes | what deleting it costs |
|---|---|---|
| every member `tyIsLitUnion` | the RUN-MERGE into a mixed union | `closures/closure-result-union-composed-carrier.vl` invalid wasm |
| `!hasNull` | the atom NICHE (`K \| K2 \| null`) | 3 cells DOWN — the nullable control's own holes |
| `litUnionAliasTyOfMembers` (EXACT set) | a structural twin at a fresh index | 5 named corpus cases; and `>=` is a silent TYPE WIDENING |
| canon keeps an ALIAS answer at every position | the inline spelling at `RC_ROOT`/`RC_FN_PARAM` | `P15atom_store` RUN-WRONG → INVALID-WASM |

**The scope question is RULED: all members, not the run.** The run-merge is what master
*already performs* whenever the flattened alias happens to be declared
(`mixedUnionLitAliasRegroup` regroups `K | K2 | f64` to `KA|f64`), so it is directly
measurable rather than hypothetical — and in that configuration it is **0 cells UP and 2
DOWN** (`==` over the regrouped box becomes `emitProgram: `==` over a struct union is not
supported yet`). It buys nothing and costs two.

**Outcome, 420 cells over four grids: 58 UP, 0 DOWN.** `K | K2` now scores exactly what the
un-aliased inline spelling of its flattened set scores (10 of 20) — the flatten's whole
claim is that the two are one type — and with a DECLARED alias for the flattened set it
scores 19 of 20, the same as the alias written directly. The residue is the inline-spelling
PARAM/FIELD valtype work (`ctxKeepsLitUnion`'s two excluded positions) and the nullable
niche's print holes, both filed with numbers.

Pinned by `tests/cases/literal-unions/union-of-litunions-flatten.vl`; the already-working
half stays pinned by `mixed-union-litunion-arm-floor.vl`'s `flattenTargetAlreadyWorks`.

### 8.4 Not a slice — the stale invariant

`tests/cases/unions/litunion-value-union-is.vl`'s comment claims `K0 | string` collapses so
the string tag never collides. §2.2 refutes it in six lines. The comment should be corrected
by whichever slice closes F3, and not before — a corrected comment with the defect still
live is worse than a stale one, because it removes the trail.

---

## 9. Where each piece lives

| | |
|---|---|
| the box, tags, bands | `compiler/emit_rep.vl` (`scalarTagOfKind`, `nullBoxTag`, `vbHeapIdxOfKind`, `atomEqOpcodeOfKind`), `compiler/emit_classify.vl` (`scalarTagOf`, `refArrSlotTag`, `mapSlotTag`) |
| the kind table (the root cause) | `compiler/typecheck.vl` `valueAtomKind`; arena twin `emit_classify.unMemAtomKind` |
| the coercion boundary | `compiler/wasmEmit.vl` `emitUnionCoerce` (9 call sites), `emitUnionBoxArg` (13), `emitUnionBox`/`emitUnionBoxAs` (2+2) |
| the `is` tag | `compiler/wasmEmit.vl` `isArmTagOfTy`, `emitIs` |
| the narrowed reads | `compiler/wasmEmit.vl` `emitValueUnionUnboxRead` (3), `emitRefArrayUnionUnboxRead`, `emitMapUnionUnboxRead` |
| the atom↔string conversion | `compiler/wasmEmit.vl` `emitAtomToStr` (10 call sites) + `emitAtomToStrChain`; the string pool is `collectStrPool` / `emitStr` |
| the reservation scan | `compiler/emit_classify.vl` `*WidensAtomToStr` (5 predicates) |
| the rep key | `compiler/emit_rep.vl` `repCanonKeyGo`'s union arm + its mirror at `:522` |
| the preserved spelling (#1300) | `typecheck.litUnionPreserve` / `nulLitUnionPreserve` / `mixedUnionLitAliasRegroup` / `litUnionInlineNameOfTy`; `emit_classify.canonLitUnionArms`; `unionRefArrayArmSlotForElemAtom` |
| the floor | `tests/cases/literal-unions/mixed-union-litunion-arm-floor.vl` |

---

## 10. How to re-verify each headline, from a clean checkout

Every claim above is reproducible with commands that need nothing but the repo and a built
compiler (`bash scripts/fetch-seed.sh && bash scripts/refresh-compiler.sh`). `VL` below is
`scripts/vl-host/target/release/vl`.

**`valueAtomKind` has no litunion arm.** Read `compiler/typecheck.vl` at `valueAtomKind` —
seven primitive compares, five list-element compares, `litUnionArrayElemOf` (arrays only),
`nulElemListAtomKind`, `nameIsFuncTypeAtom`, then `-1`. The workaround, with its reason, is
in `compiler/emit_base.vl` at `unionHasValueAtom`.

**42 call sites, 7 with a litunion leg.** The total:

```sh
grep -hoE '(^|[^A-Za-z0-9_.])valueAtomKind *\(' compiler/*.vl | wc -l   # 66 raw
grep -hcE 'function valueAtomKind *\(' compiler/*.vl                    # 1 definition
grep -hcE '^ *//.*[^A-Za-z0-9_]valueAtomKind *\(' compiler/*.vl         # 23 in comments
```

66 − 1 − 23 = **42**. For the split, walk each site's line number and test whether any of
`nameIsLitUnionType` / `tyIsLitUnion` / `exprIsLitAtom` / `litUnion` appears on a
non-comment line within ±6: **7 do, 35 do not**.

**The allocation refutation — one command.**

```sh
printf 'type K = "aa" | "bb"\nfunction go() {\n  const x: K | f64 = "aa"\n  if x is K { print("y") } else { print("n") }\n}\ngo()\n' > /tmp/w1.vl
$VL build /tmp/w1.vl -o /tmp/w1.wasm
wasm-tools print /tmp/w1.wasm | grep -A2 -m1 'i32.const 2$'
```

prints exactly

```wat
        i32.const 2        ;; the string TAG
        global.get 0       ;; the pooled "aa"  — a global READ, not an allocation
        struct.new 0       ;; the union box    — the ONE allocation
```

(Count on the whole module rather than the store and you get 4, because the string pool's
own three `array.new_fixed` global initializers run once at instantiation, not per store —
which is the point.)

**The equality cost.** Same program with `const b = x == "aa"` inside the narrow; the body
shows `struct.get 0 1` → `ref.cast` → `global.get` → `call <str-eq>`.

**`K | string` collides — six lines, prints `K`:**

```vl
type K = "aa" | "bb"
function go() {
  const x: K | string = "zz"
  if x is K { print("K") } else { print("O") }
}
go()
```

**`K | K2` folds `is K` false.** Same shape with `type K2 = "cc" | "dd"` and
`const x: K | K2 = "aa"`: the program prints `O`, `wasm-tools print` shows the `if`
condition is a literal `i32.const 0`, and the module contains **zero** `struct.new` — there
is no box at all.

**The atom-store miscompile.** `const k: K = "aa"; const x: K | f64 = k` prints `O`, and
the body contains `f64.convert_i32_s` applied to the atom id, under tag `i32.const 4`.

**`ref.i31` availability.** Assemble the six-line module in §5 with `wasm-tools parse`,
then: `wasm-tools validate` (default features) → rc 0; `deno run` a two-line instantiation
→ prints the payload; `$VL check any.vl --compiler that.wasm` → fails at *import
resolution*, which is past `Module::new`, i.e. wasmtime validated it. And
`grep -h -c i31 compiler/*.vl` sums to **0**.

**Fuzz reach, and its vacuity.** Run `scripts/fuzzgen.vl` with a `sed`-injected seed/count
(the recipe is in `scripts/fuzz-vl.sh`), then count non-declaration lines naming `K<n>`
beside a non-`null` `|`. Read three such cases: every one stores a member LITERAL.

**A reject would move cells down.** Build the `K | string` and `K | K2` rows of the grid
and count `RUN-OK`: 12 and 4 respectively.

---

## 11. Gate state for this filing

No file under `compiler/`, `std/` or `scripts/` changed, so the corpus and fuzz A/Bs are
vacuous **by construction** rather than by report — the compiler binary on both sides is
the same 1,108,097 bytes, which the fixpoint ladder proves (`compile(seed) == seed`, then
`compile(fixpoint) == fixpoint`). What was run:

| gate | result |
|---|---|
| `scripts/fetch-seed.sh` + `refresh-compiler.sh --prove-fixpoint` | *"the seed IS the fixpoint"*, 1,108,097 bytes |
| `scripts/native-fixpoint.sh` | stage3 == stage4 byte-for-byte |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | **3,578 passed / 0 failed / 7 ignored** (master: 3,576/0/7 — the +2 is this filing's floor fixture in the run and native-align tiers; the ignored SET is identical) |
| `scripts/lint-self.sh` | clean |
| `scripts/rep-fuzz-check.sh` | exact — 1 baselined (0 unsound, 1 reject), 0 new, 0 stale |
| fuzz reach probe (2 seeds × 400 cases × 2 legs) | 0 findings, and §2.4 explains why that is true and uninformative |
