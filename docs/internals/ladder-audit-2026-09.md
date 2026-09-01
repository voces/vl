# Ladder audit, 2026-09 — fall-through and parallel-ladder census

A survey, not a plan. It answers two questions asked in one breath, and the answer to the
first constrains what the second is allowed to recommend:

1. Which `if`-chain LADDERS over a closed discriminator should be `match`?
2. Which PARALLEL ladders over one discriminator should be one ladder?

The prior art is `per-rep-ladder-audit.md`, which named this defect family ("a per-rep
ladder with a missing arm" is the emitter's recorded recurring defect shape), swept the
`VKind` and `Ty`-arena halves of it, converted 14 total-domain arena ladders to `match`,
and **measured and rejected a lint rule** over the arena population. This file does not
repeat that sweep. It measures `match` ITSELF first — which the prior audit assumed rather
than measured — and then covers the two populations that audit's own scans could not see:
the **AST** (`Node`) and the **i32 kind codes**.

**Nothing here is a code change.** Every claim is either a probe run against a seed
self-compiled from `23c376e7`, or a mechanical scan whose script is named. Three
sabotage measurements (§1.2) edited a type declaration, measured, and reverted.

---

## 1. What `match` enforces today — measured, not assumed

### 1.1 The scrutinee gate: two families in, four families out

`checkMatchExprNode` (`typecheck.vl:34497`) splits on `tyIsLitUnion(st)`
(`typecheck.vl:31149`); everything else is refused by `matchScrutRejectMsg`
(`typecheck.vl:34148`).

| scrutinee | `match` | measured |
|---|---|---|
| STRING literal union (`type K = "a" \| "b" \| "c"`) | **works**, exhaustive | `non-exhaustive match — missing "c" (add the arm or a \`_\`)` |
| struct / variant union (`A \| B \| C`) | **works**, exhaustive | `non-exhaustive match — missing C (add the arm or a \`_\`)` |
| bare `i32` | **REFUSED** | `match scrutinee must be a union, got i32` |
| bare `string` | **REFUSED** | `match scrutinee must be a union, got string` |
| NUMERIC literal union (`type N = 1 \| 2 \| 3`) | **REFUSED** | `match over a union with literal members is not supported — compare them with \`==\` in an if-chain, got N` |
| litunion with a `null` member (`"a" \| "b" \| null`) | **REFUSED** | same message, `got "a" \| "b" \| null` |
| `boolean` | **REFUSED** — `true`/`false` do not even parse as union members | `expected an identifier but found \`true\`` |

Read the numeric-litunion message with CLAUDE.md's rule in hand — *a refusal's sentence
describes the arm that fired, not the feature*. "a union with literal members is not
supported" is **false as written**: a union of STRING literals is the one thing `match` was
built for. `tyIsLitUnion` requires every member to be a `TyLit` with `litKind == "str"`, so
the sentence belongs to the non-string half of `TyLit` and to a `null` member, and it names
neither. (The numeric half is ROADMAP B21's known gap — an arm's test would be `n is 0`,
which does not lower. That is still true; the `| null` half is not recorded anywhere.)

**The consequence is the whole verdict.** Measured over `compiler/*.vl`
by **scan L** — the one this file's counts come from. It is thirty lines of throwaway Python
and is stated here rather than checked in, so it can be re-derived: strip comments
(string-aware), split each file at column-0 `function`, collect every `if` / `else if`
condition, extract `<scrut> == <literal|INT|CONST>` and `<scrut> is <Variant>` pairs, group by
`(file, function, scrutinee text)`, keep the groups with **≥ 3 distinct compared constants**,
then classify the constant set against the eleven declared literal unions, the 11 `Ty`
variants and the 37 `Node` variants. Re-running it after any discriminator change is the
difference between finding the next one by sweep and finding it by accident.

| discriminator family | ladders | `match`-eligible? |
|---|---|---|
| `Node` AST variants (37, `ast.vl:305`) | **206** | yes (struct union) |
| raw i32 kind CODES (`liBack[lix] == 11`, `mvValKind == 2`, …) | **129** | **NO** |
| `Ty` arena variants (11, `typecheck.vl:430`) | **106** | yes (struct union) |
| bare `string` (operators, pass names, intrinsic names) | **73** | **NO** |
| `VKind` (30, `emit_state.vl:536`) | **69** | yes (litunion) |
| `PrimName` (10) | 36 | yes |
| `TokKind` | 25 | yes |
| `i32` named constants (`HD_*`, `CSTR_*`, `ST_*`, `BM_*`, `TS_*`) | 13 | **NO** |
| `MfKind` (7) / `RtKind` (4) / `EqCmpKind` (2) | 13 | yes |
| **total** | **670** | **455 eligible · 215 not (32%)** |

*On the denominator.* Three independent scans were run over this tree with three slightly
different ladder definitions — this one (670 over all files), an emit-side sweep (386 over
10 files) and a front-end sweep (363 over 15 files). They do not sum, and they are not
meant to: the grouping key and the arm rule differ. **Every count in this file is scan L's
unless the sentence names the other scan**, because the prior audit's own lesson is that a
ladder row is not necessarily one dispatch.

Eligible is not convertible — §1.4 prices that — but the 215 are settled: **no i32
kind-code ladder can become a `match` today**, and neither can the operator vocabulary,
which is 16 ladders of raw `string`.

### 1.2 The guard is real, and it covers 0.5% to 13% of each population

The honest way to size a structural guard is to add a member to the discriminator and count
what breaks. Done three times against a self-compiled seed, each reverted:

| I added | sites that FAILED `vl check compiler/entry.vl` | population | coverage |
|---|---|---|---|
| a 31st `VKind` member (`"xprobe"`) | **2** — `fbValtypeNullable` (`emit_bytes.vl:1945`), `fbValtype` (`:2133`) | 69 chains + 2 matches = **71** | **2.8%** |
| a 12th `Ty` variant (`TyXProbe`) | **16**, all `non-exhaustive match` | 106 chains + 16 matches = **122** | **13%** |
| a 38th `Node` variant (`XProbeNode`) | **1** — `nodePos` (`fmt_util.vl:113`) | 206 chains + 0 matches = **207** | **0.5%** |

The `Node` row is the finding. **The AST is the discriminator that grows most often — it
grew for `MatchExpr` itself, and `match-design.md`'s "Pipeline touch-points" section is a
hand-written list of the sites that had to be updated, ending "Miss one → silent drop or
emit error"** — and it has the *least* structural coverage in the compiler: one site,
guarded not by `match` but by `ifChainExhausts`, and that guard hangs off a single return
annotation (§1.3).

### 1.3 `ifChainExhausts` is a second, cheaper mechanism — and four ways it switches off

`ifChainExhausts` (`typecheck.vl:23376`) computes union-member coverage for an else-less
chain over one place and names what is missing. It is **not** `match`-specific and **not**
variant-only: a literal-`==` arm counts too (`cond is BinExpr` + `litTyOfExpr`), so it
already covers the `VKind` family in principle. Measured:

    type K = "a" | "b" | "c"
    function f(k: K): i32 { if k == "a" { 1 } else if k == "b" { 2 } }
    // [ERROR]: non-exhaustive `is`-chain falls through with no `else`
    //          — missing "c" (add the arm(s) or an `else`; expected i32)

That is a real guard at zero rewrite cost. What switches it off, each verified by running
the two-line difference:

* **an INFERRED return type.** Dropping `: i32` makes the same program compile and run
  silently. *This is what guards the AST today*: `nodePos`'s annotation is the compiler's
  only structural AST-exhaustiveness guard, and deleting one `: i32` would remove it with
  no diagnostic anywhere. (`nodePos`'s header knows this and says so.)
* **the EARLY-`return` shape.** `if u is A { return … }` / `if u is B { return … }` /
  default is not a chain and is never checked. **559 of 670 ladders (83%) are this shape.**
* **an `else`.** By design — an `else` is the author saying "default" — but it means the
  guard is off for exactly the ladders with the class-(b) silent default this survey is
  about.
* **a non-Ident scrutinee.** `cond.isObj` must be an `Ident`. This is NOT the binding
  constraint: **615 of 670 (92%) already have a bare-identifier scrutinee.**

Combining the two that bite: **496 of 670 (74%) have an inferred return type**, and 83% are
early-`return`. The gate is essentially closed over the whole population — which is the
same fact the three sabotage counts measured from the other side.

### 1.4 What a conversion costs — five measured gotchas

For the eligible ladders, `match` is not a reindent. Each was run:

1. **Exhaustiveness over a litunion is computed against the DECLARED type — `==` flow
   narrowing does not apply, in any spelling.** An early-return guard (`if k == "a" {
   return 1 }`), an `else` branch, and a negated guard (`if k != "a" { … }`) all leave the
   following `match` reporting `missing "a"`. The cause is that `==` narrowing over a
   literal union is **not implemented at all**: after `if k == "a" { return 1 }`, passing
   `k` to a function taking `"b" | "c"` is `expected J, got K`. **This is asymmetric with
   the value-union path**, where `is` narrowing does remove the member and an arm for an
   excluded variant is a type error (the prior audit measured that on `assignableGo`).
2. **…and the dead arm you add to satisfy it is accepted silently.** `if k == "a" { return
   1 }` followed by `match k { "a" => 9, "b" => 2, "c" => 3 }` compiles, runs, and is never
   reported as unreachable. Redundancy checking catches a *duplicate* pattern (`redundant
   match arm: "a" is already covered`), not an arm the flow has excluded.
3. **An empty `{ }` arm — the readable spelling for "this member is deliberately a no-op" —
   is refused in TAIL position**: `emitProgram: empty block in tail position`. It works one
   statement earlier. The prior audit's recipe ("spell the deliberate leaves as empty arms
   WITH their reason") therefore needs a trailing statement after the match.
4. **A `_` arm restores exactly the silent default, and nothing warns.** An
   already-exhaustive `match` with a redundant `_` is accepted with no diagnostic. So
   "converted to `match`" is not by itself evidence of a guard; **`_`-lessness is.**
5. **The final arm is an UNTESTED `else` (D832).** `matchElseArmOf` picks the `_` arm if
   there is one, else the LAST arm, and lowers it unconditionally — correct only because
   exhaustiveness says so. D832 is filed CLOSED because the only route that could
   manufacture a value of no arm's type became a check reject (D853); the row says plainly
   *"the desugar hazard is unfixed and is now unreachable by the only route the corpus had
   to it."* Four hardenings were measured and all four refused. This is not an argument
   against converting — it means a `match`'s guarantee is a TYPE-SYSTEM guarantee, and a
   soundness hole upstream cashes out here as a wrong arm rather than a trap.

### 1.5 The compiler's own `match` use, and the pattern it already found

**26 `match` sites in `compiler/*.vl`, and 0 of them have a `_` arm.** Distribution:
`emit_bytes.vl` 9, `emit_rep.vl` 8, `typecheck.vl` 8, `emit_classify.vl` 1. Sixteen are the
11-arm arena conversions the prior audit landed; two are the 30-arm `VKind` valtype tables,
whose headers state the invariant outright — *"a new `VKind` member without an arm must be
a compile error, not a silent `0x7f` … no `_` arm, deliberately, because a wildcard
restores exactly the silent default."*

The remaining eight are the more interesting precedent, because they answer "my
discriminator is an i32 code / a `VKind` SUBSET, so `match` is out". They are not `VKind`
matches — they are matches over **narrow, purpose-minted literal unions**:

    export type MfKind = "i32" | "f64" | "ref" | "str" | "i64" | "f32" | "u8"   // emit_state.vl:1918
    type PushKind      = "i32" | "ref" | "str" | "f64" | "i64" | "f32" | "u8"   // emit_classify.vl:6820
    type BtKind        = "f64" | "f32" | "i64"                                   // emit_classify.vl:12535
    type RtKind        = …                                                       // emit_rep.vl:4064

**That is the mechanism this survey recommends over any lint, and the compiler invented it
without writing it down: give the SUB-DOMAIN its own litunion type, and the 7-arm question
gets a 7-arm exhaustive `match` instead of a 30-arm one.** The prior audit's "does not apply
where the domain is a documented SUBSET — a `match` there would demand 27 arms for a
4-member question" is true only if the subset must borrow `VKind`'s member set. It need
not. `PrimName`, `LitKind` and `EqCmpKind` are the same conversion applied to raw `string`
fields in the arena, and each header says so.

**And the sub-domains are already there to be named.** Measured independently: `compiler/*.vl`
declares **11 literal-union discriminators**, and **17 of `VKind`'s 30 members belong to at
least one other one** (`f64`/`i64`/`f32`/`str` are each claimed by six families). Of 136
`VKind`-vocabulary chains found by the lint prototype, **84 (62%) have an arm set that is
COMPLETE over a smaller family** — 63 fit `PushKind`, 12 `BtKind`, 5 `RtKind`, 4
`EqCmpKind`. Those 84 are not partial `VKind` ladders at all; they are total ladders over a
type that exists and that they are not typed to.

The cost is real: minting a type means every PRODUCER must be typed to it, which is where a
subset ladder's `-1` / `""` / `null` sentinel lives. `EqCmpKind` shows the shape that works
— `""` and `"none"` are both members, and its header records that they are different
answers and both load-bearing.

### 1.6 Verdict on `match`

**`match` is a real structural guard, it is not cosmetic, and it is unavailable for a third
of the population.**

* For the **`Ty` arena** it is doing its job — 13% coverage, 16 sites, because of the prior
  audit's conversion. The 106 partial arena ladders were measured and deliberately left;
  nothing here overturns that, and an independent re-run of that rule on today's tree
  (§4.1) reproduces its conclusion with worse numbers.
* For **`VKind`**, 2 sites of 71. The gap is not a language limit: 62% of the chains are
  total over a *smaller* litunion, and §1.5's minted sub-type is the available move.
* For the **AST**, the mechanism exists and is used **zero times**, across 206 chains, with
  one `ifChainExhausts` guard hanging off a single return annotation. **This is the largest
  structural gap the survey found**, and it is where the discriminator most reliably grows.
* For **i32 kind codes and raw-`string` vocabularies (215 ladders, 32%)** there is no
  mechanism at all. Mint the litunion (§1.5), or lint — and §4 measures the lint.

---

## 2. The fall-through census

### 2.1 Silence classes

* **(a) LOUD terminal** — `emitFail` / `tErr` / a diagnostic. Fine.
* **(b) DEFAULT VALUE** — a plausible answer for a different case. The D931-class hazard.
  Split: a **negative sentinel** (`-1` / `""` / `null` / `false`) that every caller is
  documented to test is materially safer than a **positive default** (`0` / `true` /
  `"i32"` / `lTypeIdx` / an unchanged node index) that reads as an answer.
* **(c) NO terminal** — control falls into the next statement, written for another case.

Two independent slice sweeps classified their own populations by hand. Emit side (10
files, 386 ladders): **(a) 24 · (b)-positive 52 · (b)-sentinel 163 · (c) 147**. Front end
(15 files, 363 ladders): **(a) 14 · (b)-positive 128 · (b)-sentinel 199 · (c) 22**. The two
(c) counts differ by an order of magnitude because the sweeps drew the "chain end" boundary
differently inside 300-line functions; treat the *classes* as sound and the (b)/(c) split
as definition-sensitive. **What both agree on: fewer than 5% of ladders have a loud
terminal.**

### 2.2 Top 5 fall-through findings

Ranked by (reachability of the discriminator) × (silence class), with reached programs
preferred over analysis. All five outcomes below were re-run and confirmed verbatim for
this file.

---

**F1 · The `u8[] | null` field/binding/global chain — check-clean INVALID WASM, class (b)
positive, REACHED at three spellings.**

`VKind` grew three members after the prior audit's vocabulary table was written —
**`u8list`, `nulu8list`, `nulvariant`** — and the emit-side ladders did not all grow with
it. Mechanically: **68** ladders test `f64` & `i64` & `f32` with no `u8` arm; **8** test the
three scalar lists with no `u8list`; **4** test the three nullable scalar lists with no
`nulu8list`; **13** test `variant` beside a nullable niche with no `nulvariant`.
`emit_collect.vl` and `wasmEmit.vl` contain **zero** occurrences of `"nulu8list"`.

Reached, with the `f64` twin as the one-thing-changed control:

    function f() { const b: u8[] | null = [1, 2, 3]  print(1) }   f()
    // vl check rc 0, then:
    //   Invalid input WebAssembly code at offset 245:
    //   type mismatch: expected (ref null $type), found (ref $type)
    // control, `f64[] | null`: prints 1.

    const g: u8[] | null = [1, 2, 3]        // module scope
    //   type mismatch: expected (ref null $type), found (ref $type) (at offset 0xeb)

    type S = { b: u8[] | null }             // struct field, read and narrowed
    //   type mismatch: expected (ref null $type), found i32

The mechanism is a five-ladder chain, each link a missing arm for one code:

| site | arms | class | the gap |
|---|---|---|---|
| `emit_classify.vl:17850` `isNulScalarListFieldCode` | 4 | **(b) positive `false`** | the body is literally `c == 31 \|\| c == 32 \|\| c == 33 \|\| c == 34`, while its two siblings immediately above (`nulScalarListFieldCode:17829` mints **35**, `nulScalarListCodeKind:17841` decodes **35**) both know it. The header still says "one of the **four**" and the code-range comment still says "31..34". |
| `wasmEmit.vl:2648` `pushFieldStorage` | 19 + `else` | **(b) positive `wU8(127)`** | code 35 falls to the i32 valtype byte — literally the struct-field witness's `expected … found i32` |
| `emit_bytes.vl:1934` `nulScalarListFieldWrapHeap` | 4 | (b) `-1`, but its VKind twin `nulScalarListWrapHeap:1921` **has** `nulu8list → bl8TypeIdx` | the pair drifted by exactly one arm |
| `emit_classify.vl:19337` `forceScalarListField` | 6 | **(c) no terminal** | `ba8Used` never set, so the storage type references an unallocated heap index |
| `emit_collect.vl:5912` `forceGenAppArgTypes` / `:6631` `collectA` | 4 ea. | **(c) no terminal** | no `nulu8list` leg, so a binding or global never forces `ba8Used` — this is the first two witnesses |

`fieldCodeOfSpelling`'s own deferral comment (`emit_classify.vl:19489`) states the rule this
family broke: *"a sixth code would be a silent wrong answer in each of them until every one
grew an arm … deferred here means REFUSED LOUDLY, not lowered wrongly."* Four lines on,
`nulScalarListFieldCode(t)` hands back 35 for `u8[] | null`, minting the sixth code the
deferral existed to avoid.

**Remedy:** grow the five arms together, or make `pushFieldStorage`'s `else` an `emitFail`.
The second alone converts three silent cells into loud ones, which is hygiene, not progress
on the goal — the first is the close.

**Doc staleness this found:** `std/base64.vl:68-77` records *"`u8[] | null` DOES NOT LOWER
on this compiler. Measured 2026-09-01"* with a minimal witness. Run **verbatim**, that
witness now runs, rc 0 — the RETURN spelling was closed by D979 (#2191) and the header did
not move. The gap relocated to the binding, global and field spellings, and it is now
*worse* than the loud refusal the header describes.

---

**F2 · `binOpDefinedFor` / `checkUnaryNode` — the generic-pin operator gate, class (b)
positive `true`, REACHED, check-clean INVALID WASM.**

`typecheck.vl:19271` `binOpDefinedFor` is the checker's "may these two operand types take
this operator" gate at a generic call site. Its own header states the default direction:
*"Operators not modelled here return true (no false reject — they keep today's
behaviour)."* It models 10 operators explicitly plus a `binIntOnlyOp` predicate arm. **The
logical pair is in neither.**

    function m<T>(a: T, b: T): T { a && b }   print(m("x", "y"))
    // vl check rc 0, then Invalid input WebAssembly code at offset 267:
    //   type mismatch: expected i32, found (ref $type)
    // control (direct spelling): [ERROR] operator '&&' expects boolean operands
    // control m(1, 2): runs.
    // the `||` twin: identical invalid wasm at the same offset.

`typecheck.vl:35236` `checkUnaryNode` is the same hole one operator class over, and worse:
**there is no `unOpDefinedFor` twin at all**, so its 4 arms fall through with `return arg`.

    function m<T>(a: T): T { ~a }   print(m("x"))   // invalid wasm, offset 247
    function m<T>(a: T): T { -a }   print(m("x"))   // invalid wasm, offset 247
    function m<T>(a: T): boolean { !a } print(m("x")) // invalid wasm, offset 244

This is D492/D493's family at the operators that row left unmodelled — it closed
`^ & | << >> >>>` and `%`, and `%`/`<<`/`|` at the same pin are loud today, which is the
control that separates the closed half from the open one.

**A third, smaller finding falls out of the same ladder:** `~` has no arm and falls into
`-`'s tail, so `~"x"` reports `unary '-' expects a numeric type, got string` — a message
naming an operator that is not in the program. Class (c).

**Remedy:** one logical arm in `binOpDefinedFor` mirroring `checkBinExprNode`'s order, and a
`unOpDefinedFor` beside it called from the same `validateBinCstrs` seam.

---

**F3 · `nodeChildren` — class (b) positive, complete today, unguarded, and 24 callers
inherit it.**

`ast.vl:1678` is the AST's `tyChildrenOf`, and unlike `tyChildrenOf` (one caller, per the
prior audit) it is **already adopted at ~24 call sites across 6 files** (`lint.vl` ×7,
`emit_collect.vl` ×8, `typecheck.vl` ×4, plus `wasmEmit.vl`, `emit_classify.vl`).
`lint.vl:842` states the intent: *"One shared walker carries the recursion … extending
`nodeChildren` once; every rule picks the new kind up."*

**It is complete today and nothing makes it stay complete.** Its 25 arms omit 12 variants:
`NumLit`, `StrLit`, `CharLit`, `BoolLit`, `NullLit`, `Ident`, `ErrExpr`, `TypeRef`,
`BreakStmt`, `ContinueStmt`, `UnionDecl`, `ImportDecl`. Checked field by field, **all 12 are
genuine leaves** — `UnionDecl.udVariants` and `ImportDecl.impNames` are `string[]`, and
`impNameToks` holds TOKEN indices. So the function is right, and a forgotten arm would be
indistinguishable from those twelve.

**Converting `nodeChildren` to an `_`-less `match` over `Node` is the single
highest-leverage edit this survey found**, and it is proven feasible rather than proposed —
the exact shape was run:

    function kids(u: U): i32[] {
      const out: i32[] = []
      match u { A => { out.push(u.a) }  B => { out.push(u.b) }  C => { } }
      out                                  // NOT tail position, so the empty arm is legal
    }

One edit, 12 empty arms carrying their "this variant is a leaf" reason, and the AST gets the
guard the arena has had since the prior audit — at the site 24 callers already share.

---

**F4 · The AST-walker family — 29 of 30 big `Node` ladders roll their own descent, and
29 of 30 fall through silently.**

30 ladders over `Node` with ≥ 12 arms. **Exactly one calls `nodeChildren`** (which is
`nodeChildren` itself). Terminals read one at a time:

| site | arms | terminal | class | what the default MEANS |
|---|---|---|---|---|
| `typecheck.vl:26210` `checkNodeReal` | 35 | `TY_ERR` | **b, positive** | a new node kind types as the hole — assignable to and from anything — with NO diagnostic |
| `emit_sections.vl:1140` `promoMark` | 21 | `0` | b, positive | "nothing here needs promotion" |
| `format.vl:1599` `expr` | 21 | `sliceFallback(ix)` | b, **benign** | prints its own source span; and it calls `nodePos`, the one guarded ladder |
| `emit_classify.vl:4226` `capScan` | 20 | `0` | **b, positive** | "this subtree captures nothing" — a free variable silently not captured |
| `emit_rewrite.vl:1355` `cboxWalk` | 20 | `ix` | b, positive | "return the node unrewritten" |
| `emit_rewrite.vl:1244` `cboxScan` | 19 | `0` | b, positive | "no capture box needed" |
| `wasmEmit.vl:2974` `nameUsedAsValueIn` | 19 | `false` | b, positive | "the name is not used as a value here" |
| `wasmEmit.vl:12537` `emitExpr` | 19 | `emitFailAt(…)` | **a** | loud |
| `emit_mono.vl:2426/2714/2896` `monoCloneGenericCalls` / `monoPinBinOps` / `monoFoldTyParamLayout` | 18 ea. | `ix` | b, positive | "no mono rewrite in this subtree" ×3 |
| `emit_mono.vl:4955` `monoWalk` | 18 | `0` | b, positive | "walked, nothing to do" |
| `emit_rewrite.vl:248` `drwWalk` | 18 | `ix` | b, positive | "no dispatch rewrite" |
| `emit_classify.vl:11567/11773/8777` `blockHasCallRef` / `blockHasVariantRebox` / `blockHasStrOpScan` | 17/17/16 | `false` | b, positive | "the block does not use this feature" ×3 |
| `emit_classify.vl:15314` `stmtIsTailValue` | 17 | `false` | b, positive | "not a tail value" |
| `emit_collect.vl:3224` `liftFnsInExpr` | 16 | — | b | lambda lifting skips the subtree |
| `emit_collect.vl:5075` `mfScan` | 15 | `0` | b, positive | "no map/filter use here" |
| `lint.vl:1117` `urcExprClean` | 15 | **`true`** | b, positive | lint's own default is "this expression is clean" — the direction that makes the rule FIRE |
| `driver.vl:3538/3398` `modRwExpr` / `modRwStmt` | 14/13 | `0` | **b, positive** | the module merge leaves an imported name at its bare spelling |
| `wasmEmit.vl:9786` `hoistSafeExpr` | 13 | `false` | b, **safe** | "not safe to hoist" — conservative, correct |
| `emit_collect.vl:4718/4966`, `emit_query.vl:401` | 12 ea. | `0`/`false` | b, positive | usage detectors |
| `format.vl:873` `emitStatement` | 12 | → `sliceFallback` | b, benign | |
| `wasmEmit.vl:18613` `emitStmt` | 12 | `emitFail(…)` | **a** | loud |
| `fmt_util.vl:77` `nodePos` | 37 | *(exhaustive)* | **guarded** | the ONE structural AST guard |
| `ast.vl:1682` `nodeChildren` | 25 | `out` empty | b, but complete | F3 |

**Histogram over the 30: (a) 2 · (b) 27 · guarded 1.** Of the 27, **24 are the positive
direction**, and **14 are the USAGE-DETECTOR shape** the prior audit named as the
highest-leverage one its scans could not see: the default is *"the program does not use
feature X"*, which turns off a whole downstream family at once rather than mis-answering
one question.

**Why this population and not the arena's 106.** The prior audit left the partial arena
ladders alone on a measured argument: each is a genuine 3-of-11 question with a
caller-tested sentinel. That does not transfer. These are not 12-of-37 questions — they are
*complete descents over the AST* that list only the variants with children, which is why a
dozen of them carry 17-plus arms. A missing arm is a hole, not a subset, and the default is
"absent", not "-1, ask someone else".

**All 14 pure scans are `nodeChildren`-routable**, which after F3 makes them one edit apiece
rather than 14 conversions. The rewriters (`drwWalk`, `cboxWalk`, the three `mono*`,
`modRwExpr`) REBUILD and cannot use a child-list visitor — the same reason the prior audit
gave for `substTyDeep` — so those want `match`.

---

**F5 · `collectFnValUse` — class (c), REACHED, loud emit reject (clause 2).**

`emit_collect.vl:12524` is a `P.nodes` usage detector setting `fnValUsed`. Its question list
has arms for `LetDecl`, `BinExpr(=/==/!=)`, `FieldInit`, `Call` args, `IfStmt` arms,
`TypeRef` and `ArrayLit` — **and none for `RetStmt` or a bare tail expression**.

    function inc(x: i32): i32 { x + 1 }
    function pick() { return inc }
    const g = pick()
    print(g(41))
    // vl check rc 0, then:
    //   emitProgram: function-value call arity has no interned signature
    // ABLATION: add `const seed = inc` anywhere in the file → prints 42.
    // The tail-expression spelling `function pick() { inc }` is identical.
    // The ANNOTATED twin `function pick(): (i32) => i32 { return inc }` → 42.

The ablation is what makes this a detector finding rather than a codegen one: the closure
rec-group interns fine, and the only thing missing is a node that says "this program uses a
function value". Same shape as D10, which added the map-value arm to this very ladder.

A companion at the same seam, one arm outside it: an un-annotated function whose body is a
closure-valued if-expression (`function pick(c) { if c { inc } else { dec } }`) is
`emitProgram: call to unknown function` while the annotated twin runs — audit row R3's shape
at a function RETURN rather than a `let` init.

### 2.3 Runners-up worth a row, not a top-5 slot

* `wasmEmit.vl:2602/2610/2618/2626/2634` — `scalarListWrap` / `scalarListBack` /
  `scalarListBlocktype` / `scalarListUsed` / `emitScalarValue`, plus
  `:16391/16399/17192` — **eight hand-copied 4-arm ladders over one scalar-list element
  table, every one defaulting POSITIVE to the i32-list wrapper/backing/blocktype.** A
  fifth scalar element kind silently gets the i32 rep at all eight. `emit_bytes.vl:1016/1031`
  is a ninth and tenth copy, and notably it *does* carry the `u8` arm — proof the table was
  maintained in one place and not the others.
* `emit_classify.vl:878` `retKindIsList` — 6 arms, no `u8list`, `false` in the permissive
  direction. **13 call sites in `criClassify`; exactly 2 (`:3437`, `:3455`) carry a
  hand-written `&& fRetKind[i] != "u8list"` workaround, and the reason is written out at
  exactly one of them** (`:3451`). Documented once, applied twice, absent eleven times — the
  workaround existing at all is the proof the gap is live, and its being spelled at the call
  site rather than in the ladder is why the other eleven do not have it.
* `wasmEmit.vl:2786` `emitObj` (21 field codes) and `:3234` `emitVariantStruct` (21) —
  class (c): an unlisted field code emits **no value**, then `fbStructNew` runs with the
  full field count. An operand-count mismatch, not a diagnostic.
* `cli.vl:1810` `cliNext` — 16 arms over 17 `ST_*` states, positive default `CMD_DONE`. A
  newly appended state with no arm ends the CLI pump *as if finished*. `ST_CHECK_VALIDATE
  = 16` shows states are appended routinely.
* `typecheck.vl:20562` `hdRenderName` — 4 arms over 5 `HD_*` codes, default = the `HD_GALT`
  render. The hole NAME is the hole's identity, so a sixth derivation kind silently aliases
  a different hole. `HD_BINOP` was added as recently as D532.
* `lint.vl:861` `lintWalk` — three bare `if`s followed by a four-arm chain over rule ids,
  class (c). A rule added without an arm visits no node and reports nothing, silently; a new
  rule id is the commonest edit to that file.
* `typecheck.vl:3746/3756/3722` — the fs-intrinsic family: five parallel ladders over `k ∈
  0..6` plus `fsIntrinsicCount(): i32 { 7 }` as a hard-coded third copy of the domain size.
  An 8th syscall needs six edits and the literal is the one that silently truncates.

### 2.4 Class-(b) defaults that are CORRECT, recorded so nothing chases them

* `wasmEmit.vl:9786` `hoistSafeExpr` → `false`. "Not safe to hoist" is sound for an unknown
  node. Note its partner `exprReboundsName`/`stmtReboundsName` (`:9862`/`:9891`) defaults
  `false` = "not rebound", which *permits* the hoist — **the pair defaults in opposite
  senses**, and only one of the two is safe.
* `format.vl:1599` `expr` → `sliceFallback(ix)`. An unknown node prints its own span, which
  is what a formatter should do; `sliceFallback` reads `nodePos`, so the guarded ladder
  backstops it.
* `driver.vl:1420` `lexClassOf` → `-1` = "no semantic token". A new token kind is simply
  uncoloured. (Its `MATCH` gap is a real bug — see §3, A3 — but the *direction* is safe.)
* `emit_classify.vl:32175` `memPropMutatesList` → `false`, but **total** over the compiler's
  22-name member vocabulary today.

### 2.5 The `MatchExpr` walker gap, and why it is UNREACHABLE — with the guard named

**`MatchExpr` is absent from every emit-side and collect-side `Node` walker** — `monoWalk`,
`drwWalk`, `cboxWalk`, `cboxScan`, `capScan`, `nameUsedAsValueIn`, the three `mono*`
rewriters, `blockHasCallRef`, `liftFnsInExpr`, `mfScan`, `leqScanExpr`,
`collectMemberPopRefSlotsExpr`. `emit_collect.vl` mentions `MatchExpr` **zero times**; so do
`symbols.vl` and `check_query.vl`.

**Guard: `desugarMatchAt` (`typecheck.vl`) overwrites the arena slot in place**, so emit and
lint only ever see if-chains. Verified with four programs (a list `==` in an arm, a `.map`
in an arm, a lambda in an arm, a match inside a lambda) — all run.

Two cracks worth recording rather than assuming:

* `desugarMatchAt` is called only under `if !inferQuiet` (`typecheck.vl:34492`, `:34654`) —
  exactly the kind of guard R11 warns is "one edit away from being wrong".
* **`promoMark` (`emit_sections.vl:1214`) HAS a full `MatchExpr` arm**, walking scrutinee,
  patterns, binds and bodies. One walker believes the node reaches emit and twenty do not.
  Today `promoMark`'s arm is dead code; the disagreement is the same shape as R11's
  `fbValtypeNullable`/`fbRefNullForKind` split, and it is what a reader will trip over.

`leqScanExpr`'s own header records this exact hazard firing for real once — *"Without this
arm the walk fell off the end of its dispatch … silently INVALID WASM"* — which is why the
guard is worth stating rather than assuming.

---

## 3. The parallel-ladder census

### 3.1 Method, and what did NOT work

Two mechanical passes: literal-set overlap between every pair of the 4,119 top-level
functions (Jaccard over each function's compared-constant set), and name-twin enumeration
(`*OfTy` twins, `node*`/`expr*`/`ty*`/`rep*` versions of one question, `*Go` helpers,
encoder/decoder pairs). Candidate pairs at ≥ 3 shared members: **5,558 over the `VKind`
vocabulary, 4,234 over the arena.** Drift band (0.50 ≤ J < 1.00, both differences
non-empty): **788 + 801.** About **109 sites were read**; **13 survived**.

**Record the negative result: the Jaccard scan is not what found the findings.** The
near-1.0 band is almost entirely genuine single-source delegation, and the 0.5–0.9 band is
dominated by unrelated functions that happen to name four reps. **Three of the four drifts
reached with a program came from name-twin and cross-language search, not from set
overlap.** A future sweep should spend its budget there.

### 3.2 Category A — unguarded parallel ladders, ranked

*Re-verified for this file, source and outcome both:* A1's four arm lists (`cliLineIsImport`
takes `export {`; `wasmChecker.ts:516` and `cases_wasm_test.ts:255` do not, both under the
same stale "Mirrors the Rust host's module gate" comment); A3's keyword split
(`driver.vl` contains the string `"MATCH"` **zero** times, `lexer.vl:411` mints it;
`const match = 1` refuses and `const new = 1` prints `1`); A8's absence of any test naming
either token function.

**A1 and A3 are CLOSED as of 2026-09-01 (#2219)** — their rows below carry the detail and the
guards. The measurements in this section describe the tree as of the audit and are kept as
filed; read a row's own CLOSED note before quoting its numbers. Two corrections the fixes
owe this file: A3's "over-claims `new`" was wrong (`new` is a real CONTEXTUAL keyword and the
row's own `const new = 1` probe only proves it is not a HARD one), and the row's five lists
were also all missing `flat` — a sixth keyword nothing in the survey named, found by reading
the parser rather than the lists. A1's "two TS copies may live in different bundles" was not
a real obstacle: `lsp/src/wasmChecker.ts` already serves both the LSP and the playground.

**A1 · The module-arming gate — 4 implementations in 3 languages, 2 missing the `export {`
arm. REACHED, and user-visible in the editor. — CLOSED (#2219).**

> **CLOSED 2026-09-01 (#2219).** The two TS copies are now ONE leaf module,
> `compiler/moduleGate.ts` (zero imports), imported by `lsp/src/wasmChecker.ts` — which
> serves the VS Code LSP *and* the browser playground, so the "different bundles" worry was
> not one — and by `tests/cases_wasm_test.ts`. The VL and Rust copies cannot import
> TypeScript and stay MIRRORED, now under a guard:
> `tests/module_gate_agreement_test.ts` **extracts each mirrored copy's arm set from its own
> source** (`cliLineStartsKwBrace(line, "kw")` / `strip_prefix("kw")`) and requires it to
> equal the shared module's `MODULE_LINE_KEYWORDS`, asserts neither TS consumer re-defines a
> twin, asserts no fifth copy has appeared, requires both template scans to keep their
> comment/quote/`${` anchors, and refuses the stale sentence tree-wide. The behavioural table
> is shared (`tests/support/moduleGateCases.ts`, 15 rows) and re-run by three executors:
> the pure TS gate, the native `vl check` (`tests/vl_module_gate_test.ts`, which exercises
> the Rust host's gate and `cliNeedsModules` in series), and the seed-backed LSP checker.
> After: `export { helper } from "./nope"` reports the diagnostic in the LSP, at every
> spelling probed (indented, no space before the brace, on a later line). Sabotage-tested
> 3/3 — dropping the VL arm, the Rust arm, or re-inlining the LSP copy each reddens a named
> test.

| site | arms |
|---|---|
| `compiler/cli_util.vl:190` `cliLineIsImport` → `cliHasImports` → `cliNeedsModules` | `import {`, `export {` |
| `scripts/vl-host/src/main.rs:1510` (inline, `stage_program`) | `import {`, `export {` |
| `lsp/src/wasmChecker.ts:516` `hasImports` → `needsModules` | **`import {` only** |
| `tests/cases_wasm_test.ts:255` `hasImports` → `needsModules` | **`import {` only** |

Discriminator: "does this source need the module fetch loop". Difference:
`export { … } from "…"`. Both TS copies carry the comment *"Mirrors the Rust host's module
gate: a LINE-LEADING `import {`"* — stale, because the Rust host took the `export` arm in
#2182 and the TS copies did not. Measured on `export { helper } from "./nope"` + `print(1)`:

    LSP  (checker.check):  0 diagnostic(s)
    CLI  (vl check):       [ERROR]: Cannot resolve import "./nope" (no module .../nope.vl)

with the `import {` control reporting the diagnostic in both. **Guard: NONE at the time of
the audit** — `tests/lsp_wasm_checker_test.ts:930` guarded only the *template* half of the
same gate. Unification: export `cliNeedsModules`'s decision across the seed ABI, or one
shared TS helper the test and the LSP both import. *(The second option is what shipped; the
seed-ABI one stays unbuilt — the gate has to answer BEFORE the source is staged, so routing
it through the seed would add a staging round trip to every check for a two-token scan.)*

**A2 · `retAtomKindOf` vs `valueAtomKind` — the list-atom codes. REACHED; the missing arm
buys the LOUD outcome and the present arms produce SILENT invalid wasm.**

`typecheck.vl:26601` `retAtomKindOf` knows list codes 7, 8, 9, 10, 12. `typecheck.vl:32736`
`valueAtomKind` knows those plus **13 (`u8[]`)**, 11 (closure) and the niche-element lists.
`retAtomKindOf`'s own header calls itself *"the structural dual of
`valueAtomKind(tyToStr(leaf))`"*, and its consumer `tyIsValueUnion` repeats the claim.
Difference: `u8[]`, the closure atom, the nullable-element lists. The litunion exclusion is
documented (`:26661`); the `u8[]` gap is not — code 13 was appended to one side.

Measured over one program shape with only the element type varied:

    u8[]  | i32 inferred  → 'pick' infers the union return type u8[] | i32 — type-valid,
                            but an inferred return of this shape is not yet supported by codegen
    f32[] | i32 inferred  → vl check rc 0, then Invalid input WebAssembly code at offset 421
    i64[] | i32 inferred  → vl check rc 0, then failed to compile: function[5]::pick
    u8[]  | i32 ANNOTATED → runs

**The outcome class flips exactly on the missing arm, and the missing arm is the one that
produces the LOUD result.** Guard: NONE. Unification: `retAtomKindOf`'s `TyArray` leg is a
re-spelling of `valueAtomKind`'s `arrElemNameRaw` cascade; one shared
`elemNameToAtomCode(elemName)` retires both.

**A3 · The keyword vocabulary — 5 independently maintained lists, and a live LSP rename
bug. REACHED. — CLOSED (#2219).**

> **CLOSED 2026-09-01 (#2219).** All five lists now reconcile against sets DERIVED from the
> compiler by `tests/keyword_vocabulary_test.ts`: **19 hard** from `lexer.vl`'s `keywordKind`
> (its `return "KIND"` arms, with each derived spelling required to be evidenced in the same
> body, so the "TokKind is the spelling uppercased" convention is enforced rather than
> assumed) and **7 soft** from `parser.vl`'s `.text == "word"` guards, minus the documented
> `then` (removed from the language; its site is a targeted refusal) and plus the documented
> `from` (positional-only — `parseImport` scans to the path STRING and never text-tests it).
> `match` added to `driver.vl`'s `lexClassOf`, to `VL_HARD_KEYWORDS` and to Monarch; `fn` and
> `elseif` removed from Monarch; `flat`/`to`/`step` added to TextMate; `new` and `flat` added
> to `VL_SOFT_KEYWORDS`. Both grammars now paint EXACTLY hard ∪ soft — a partial soft rule is
> what "some softs, chosen by nobody in particular" was, and it is unfalsifiable. Sabotage-
> tested 4/4, one list at a time, each failure naming the entry.
>
> **This row's "over-claims `new`" was wrong, and running the program is what showed it.**
> `const new = 1` runs (so `new` is not reserved — the row's own measurement) *and*
> `type Id = new i32` runs (so it IS syntax): `new` is a CONTEXTUAL keyword, deliberately so
> — `parser.vl:1629`'s comment says a hard keyword "would have been free against the corpus …
> but reserves a common word language-wide for one declaration form". Reading only the first
> half of that pair turns a correct grammar entry into a filed defect. The same probe found
> `flat` (`flat type R = { … }`, `parser.vl:3033`), a contextual keyword **no list had at
> all** and which no reading of the five lists could have surfaced. The genuine inventions
> were Monarch's `fn` and `elseif`, neither of which is VL syntax at any position.

| site | count | `match`? |
|---|---|---|
| `compiler/lexer.vl:356` `keywordKind` (the authority) | 19 | yes |
| `compiler/driver.vl:1419` `lexClassOf` (LSP semantic tokens) | 15 | **no** — `driver.vl` contains the string `"MATCH"` zero times |
| `lsp/src/typeFeatures.ts:1069` `VL_HARD_KEYWORDS` | 18 | **no** |
| `lsp/syntaxes/vital.tmLanguage.json:207` | — | yes, but **over-claims `new`** |
| `playground/src/main.ts:120` (Monarch) | — | **no**; carries `fn`, `elseif`, `to`, `step`, none of which are VL hard keywords |

Consequences, measured: `const match = 1` → `expected an identifier but found \`match\``,
while `const new = 1` **runs and prints 1**. `VL_HARD_KEYWORDS` feeds `rename.ts:74` (refuse
a reserved new name), `rename.ts:306`, `signatureHelp.ts:192` and `keywordCompletions`, so
**renaming a binding to `match` is accepted by the LSP and produces a file that does not
parse**, and `match` is never offered in completion nor painted as a keyword.

`typeFeatures.ts`'s header documents the *copy* as deliberate (*"rather than importing the
lexer's `KEYWORDS` map so this module stays free of runtime dependencies"*) — a deliberate
copy with an undocumented divergence. **Guard: NONE at the time of the audit**;
`tests/playground_lsp_parity_test.ts` guards provider *wiring*, not vocabularies.
Unification: `driver.vl` already ships `builtinScan`/`builtinCount`/`builtinNameCharAt`
across the wasm ABI; the same shape for `keywordKind` feeds all four consumers — the exact
move that made `printDomainStr` correct. *(What shipped is one step short of that: the lists
stay copies and a PURE test derives the expected sets from `lexer.vl` and `parser.vl` and
fails every list that disagrees. The ABI export remains the better end state for the LSP's
two lists — it would make them derived rather than checked — but it cannot serve the TextMate
grammar or the Monarch table, which are static data read by the editor before any seed
loads, so a derivation-from-source guard is needed for those two either way.)*

**A4 · `builtinScan` vs the lowered-intrinsic set. REACHED.**

`driver.vl:1290` offers 14 linear-memory intrinsics as LSP completions under its own stated
rule *"Only lowered ops are listed"*. The checker/emitter set
(`typecheck.vl:3656/3682/3646` + `wasmEmit.vl:13838/13851/13865`) includes four more:
**`__store_i8__`, `__store_i16__`, `__memory_copy__`, `__memory_fill__`** — all four lower
and execute correctly (measured: `65 / 513 / 7 / 7`), and none is offered in completion.
`builtinScan`'s own header names the shape: *"Hand-written rather than rendered … which is
exactly the shape that drifts."* Guard: NONE.

**A5 · `collectMapFilterUse` vs `mfResultKindOf` — audit row R4, STILL LIVE.**
`emit_collect.vl:12642` (5 kinds, forces `aUsed`/`lUsed` on fallthrough) vs
`emit_classify.vl:37246` (9 kinds). Filed repro reproduces verbatim: `emitProgram: .map
result is i64[] but i64 list type not collected`. Only the string-list arm is shared
(`mfCbResultIsStrList`). Guard: NONE — the precise message is the only backstop.

**A6 · `annRetKind` — audit row R9, and THE FILED WITNESS NO LONGER REPRODUCES.**
Six `$fnsig` producers; five (`cloParamTok`, `cloRetKeySuffix`, `annParamKind`,
`paramTokOfTy`, `retTokOfTy`) have a `variant` arm and `emit_classify.vl:35712` `annRetKind`
has none. **R9's filed repro now RUNS** — the arena twin `retTokOfTy` (added by the
destringify-D3 slice) covers it. The source asymmetry stands; **the audit row's status is
stale and should be re-filed or closed.** The headers cite dual-write measurements (*"95
agree, 0 disagree, 199 decline"*, *"275 agree, 0 disagree"*) — those were development-time
comparators, not standing tests.

**A7 · `nulbool` — 1 of 3 cell-kind ladders has it. NOT reached.**
`emit_classify.vl:2819` `letInitCellKind` [25 kinds] returns `nulbool`; `:17963`
`vtKindOfType` [24] and `:18589` `globalCellKind` [24] do not, and `globalCellKind`'s header
says it *mirrors* the other two. A `boolean | null` global runs today, so this is
DANGEROUS-UNPROVEN in the audit's sense.

**A8 · `repSigTokOfKind` / `repKindOfSigTok` — exact inverses today, guard MISSING.**
`emit_rep.vl:176` / `:262`, 21 arms each. The header asserts *"an encoder arm without its
decoder twin (or vice versa) cannot exist"* — that is a comment. No test, no
`lint-self.sh` rule, no `compiler/lint.vl` rule references either name; only `.vl`
test-case *comments* mention them. **Filed here as category A, not B**, because an
asserted invariant with no enforcement is not a guard. (The C5 audit row is the worked
instance of this pair drifting.)

**A9 · `isStmtKeyword` has no `MATCH` arm.** `parser.vl:2715`, 10 arms, while `match` is a
live statement-position construct. Correctly shared by `parseImport` and `modScan` since
#2182 — so the missing arm is missing at both. Not reached.

### 3.3 Category B — mirrored sets, each with its guard named or marked MISSING

| set | sites | guard |
|---|---|---|
| `hasTemplateHole` ×4 (`cli_util.vl:221`, `main.rs:1448`, `wasmChecker.ts:535`, `cases_wasm_test.ts:275`) | 4 | **PARTIAL.** `tests/lsp_wasm_checker_test.ts:930` proves the *LSP* arms for one template case; nothing compares the four implementations and nothing exercises the Rust copy. Byte-equivalent today. |
| `repSigTokHasSlot` (slot-carrying kinds, 5 arms) | `emit_rep.vl:222` | **Genuinely single-source.** Every encoder mints through `repSigSlotTokOfKind:250`; every decoder skips through this predicate. |
| Intrinsic reservation: `nameIsEmitterIntrinsic` (30) vs the `initChecker` signature registry (28) vs `emitCall` dispatch | `typecheck.vl:3593`, `:3227`, `wasmEmit.vl:14175` | **No test, but coherent and documented.** closure − registry = `{__trap__, __array_new__, __array_new_default__, __array_copy__}` (checked at `typecheck.vl:21985`); registry − closure = `{__log_string__, __store_string__}` = exactly `nameIsUnimplementedIntrinsic:3789`. #2184's third-list bug is fixed. |
| `printDomainStr` (one string, two consumers) | `typecheck.vl:26781` → `driver.vl:1331`, `printRefRefusal:26792` | **GUARDED** by `tests/selfhost_native_diag_code_test.ts:146` and `tests/lsp_member_completion_wasm_test.ts:247`, both reading the compiler's own string. The model. |
| `isStmtKeyword` shared by `parseImport` / `modScan` | `parser.vl:2715`, imported `driver.vl:97` | **Unified by import** (#2182). The arm list itself is A9. |
| `scalarTagOfKind` / `vbHeapIdxOfKind` / `atomEqOpcodeOfKind` / `valBlockTypeOfKind` | `emit_rep.vl:2649`–`2775` | Genuinely single-source; each header names the hand-copied ladders it retired. **Keyed on integer codes, so the string scanners are blind to them** — worth noting for the next sweep. |
| `binPrec` (parser, `TokKind`) vs `binPrecOf` (fmt_util, raw `string`) + `binOpcode`/`binOpcodeI64`/`binOpcodeF64`/`binOpcodeF32` + `upePureBinOp` (lint) + `binOpDefinedFor`/`checkBinExprNodeReal` (typecheck) | 16 ladders, 7 files | **ONE of the sixteen is guarded**: `tests/cases/operators/precedence-ladder.vl` pins `binPrec`'s 19 rungs by value, and its header names the failure mode (*"a DROPPED arm answers 0 … quietly truncates the expression"*). Nothing guards the other fifteen or compares any two. `binPrecOf` lacks `??` and `=` and runs on a different numeric SCALE (4–16 vs 1–11) while its header says it *"mirrors the parser"*. Measured latent, not live: `vl fmt` round-trips `a ?? b`, `a ?? b + 1`, `~x` byte-identically, because `??` happens to be the lowest-precedence operator so `0` is self-consistent, and `a ?? b \|\| c` is refused outright by `coalesceMixOp`. **The accident is the guard** — the next low-precedence operator falls to `0` too. |
| The pass table vs `runEmitPass` | `emit_sections.vl:4394` / `:4176` | **HALF-GUARDED.** 33 rows, 33 arms, in exact agreement today. Table → dispatcher is guarded (`emitFail("unknown pass in the pass table")`) *and* prerequisite-checked; **dispatcher → table is not**, and its failure mode is a pass that silently never runs. |
| `fieldCodeOfSpelling` vs `fieldCodeOfTy` | `emit_classify.vl:19414` / `:22265` | **Deliberate and documented — and the MODEL for the others.** `fieldCodeOfTy` returns **`−2` = "the arena declines, ask the name"**, so a missing arm cannot be mistaken for an answer. This is the one convention in the tree that makes a twin pair safe by construction. |

### 3.4 Top 3 unification candidates

1. **One kind→atom-code table for the four value-atom classifiers** (`valueAtomKind`,
   `valueRowKind`, `retAtomKindOf`, `printAtomKindOf`). Retires 4 arm lists over a 14-code
   closed vocabulary and closes A2. **Adopt `fieldCodeOfTy`'s `−2` decline convention** so a
   twin's silence is typed differently from its answers — that convention is already in the
   tree twice and it is what makes the arena/name split safe.
2. ~~**Export the lexer's keyword vocabulary across the wasm ABI.**~~ **A3's bug is CLOSED
   (#2219) and this candidate is DOWNGRADED, not taken.** The five lists reconcile under a
   pure derivation guard (`tests/keyword_vocabulary_test.ts`) instead. The reason the ABI
   move is not the answer here, and `printDomainStr`'s was: **two of the four consumers
   cannot call the seed.** The TextMate grammar is JSON the editor reads before any server
   starts, and the Monarch table is static data in the playground's bundle — so a
   derivation-from-source guard is needed for those two whatever the LSP's own two lists do,
   and once it exists it covers all five for the cost of one file. The ABI export is still
   the better end state for the LSP's lists (derived beats checked) and is now a cleanup, not
   a bug fix.
3. ~~**One module-arming predicate, exported from the seed.**~~ **A1 is CLOSED (#2219) by the
   audit's own second option** — one shared TS helper (`compiler/moduleGate.ts`) that the LSP,
   the playground and the corpus oracle import — plus a source-extraction guard over the VL
   and Rust copies. The seed-ABI variant stays unbuilt and probably should: the gate must
   answer BEFORE the entry source is staged into the wasm, so routing it through the seed
   adds a staging round trip to every `check` in order to run a two-token scan.

---

## 4. What a lint could enforce — measured, and the answer is "not this"

### 4.1 The prior audit's rule, re-run on today's tree

`per-rep-ladder-audit.md`'s arena numbers were reproduced against **the commit that filed
them** (`801b8a17`) before being pointed at HEAD, so the scanner is calibrated rather than
assumed:

| | filed | @ `801b8a17` | @ HEAD |
|---|---|---|---|
| `X is Ty*` sites | 993 (±8) | **986** | **1,319** |
| ladders `(file, fn, scrutinee)` | 564 | **556** | **780** |
| ≥ 3 arms | 81 | **80** | **106** |
| **≥ 3 arms, no else, SILENT default** (rule (a)'s firing count) | **58** | **60** | **92** |

**The numbers did not hold — they grew.** `compiler/*.vl` went 108,683 → 159,598 lines
(+47%) in two weeks and rule (a) went **58 → 92 (+59%)**. `emit_rep.vl` alone dropped
104 → 68 sites, which is the 14 `match` conversions landing; everything else outgrew them.

Re-audited a random 20 of today's 92: **15 FP, 5 TP → 75% FP** (filed ~83%). All 5 TPs are
**one family** — descent walkers missing `TyNeg` (`tyReachesFuncD`, `listWriteReaches`,
`collectTyReachRegister`, `tyReachesHole`, `tyHasRepHoleAt`) — i.e. exactly the set the
prior audit's recommendation #2 retires by routing through `tyChildrenOf`. **A lint firing
92 times to point at one already-named family is strictly worse than the refactor.**

### 4.2 Four new rule spellings, over the families the prior audit did not cover

FP definition: the domain is a documented subset with a caller-tested sentinel, **or** the
scrutinee is not the discriminator, **or** the "chain" is the `(fn, scrutinee)` grouping
artefact the prior audit already names.

| rule | hits | audited | FP | FP rate | convertible to `match` | not convertible |
|---|---|---|---|---|---|---|
| arena `Ty` (rule (a), re-run) | 92 | 20 | 15 | **75%** | 92 | 0 |
| **L1** `VKind` chain, ≥3 arms, silent default | **136** | 24 | 24 | **100%** | 110 | 14 (+12 unresolved) |
| **L2** `Node`-variant chain | **198** | 20 | 20 | **100%** | 198 | 0 |
| **L3** i32 kind-code chain | **135** | 20 | 19 | **95%** | **0** | **135** |
| **L4a** L1 + scrutinee *resolves to* `VKind` | 58 | 34 | 32 | **94%** | 58 | 0 |
| **L4b** L4a + ≥ 60% coverage (≥ 18 of 30) | 5 | 5 | 4 | **80%** | 5 | 0 |
| **L4c** L4b + scrutinee annotated in-function | **3** | 3 | 2 | **67%** | 3 | 0 |

**561 firings across the four families, 75–100% false positives.** L3's 135 are
unfixable-by-`match` by construction (§1.1), which is the number that decides whether a lint
is the *only* available mechanism for the i32 codes — and even there it is 95% FP.

### 4.3 Why the rules misfire — four archetypes, so the next attempt does not repeat them

* **FP-A · the discriminators share an alphabet (49% of L1).** 11 literal-union
  discriminators; **17 of `VKind`'s 30 members belong to at least one other**; `f64`/`i64`/
  `f32`/`str` are each claimed by six. **84 of 136 L1 firings (62%) have an arm set complete
  over a SMALLER family.** `isNumeric(t.primName)` over `{i32,i64,f32,f64}` is a complete
  4-arm `PrimName` ladder and is byte-identical, to a grep, to one arm of a 30-member
  `VKind` ladder. *This archetype is not only the FP cause — it is §1.5's recommendation,
  measured from the other direction.*
* **FP-B · partial by design with a documented sentinel (20 of L4a's 24).** The prior
  audit's archetype (`nulScalarListWrapHeap`, `-1`) plus 19 more: `nulScalarListBuildKind`,
  `listIdxKindOf` (header: *"`scalarListElemKind` only ever yields the four scalar members
  of `VKind`"*), the six-member `scalarList*` family, and `retKindIsList` — whose two call
  sites spell `!retKindIsList(k) && k != "u8list"`, i.e. **the missing arm is compensated
  caller-side**, exactly the invariant the audit's SAFE-LOUD rows verify one at a time.
  (That same compensation is §2.3's finding when read as a defect rather than as a guard —
  which is the point: the lint cannot tell the two readings apart.)
* **FP-C · the rule fires on the fix.** `fbValtype` and `fbValtypeNullable` are *already*
  `_`-less exhaustive `match` statements. The rule still fires, because each carries an
  out-of-bounds pre-guard of six `kind == "struct" || kind == "reflist" || …` tests with no
  loud fall-through — indistinguishable, textually, from a 6-arm ladder.
* **FP-D · the `(function, scrutinee)` grouping artefact.** The prior audit names this for
  `tyEqGo`/`assignableGo`. Today it accounts for every large L1 hit: `emitForInStmt(ek)` 22
  "arms" over 276 lines, `declareForInLocals(fiEk)` 23 over 128, `emitStartFnCode(gck)` 16
  over 371, `emitDirectCall(cpvk)` 8 over 430. Many independent lowering guards, not one
  dispatch — there is no single fall-through for a rule to classify.
* **FP-E · an AST walker is partial by definition (100% of L2).** All 20 audited L2 hits are
  visitors handling the kinds their question needs and returning a conservative default —
  including **`lint.vl`'s own `urcExprClean` and `nameVisit`**, whose header states the
  policy the rule would flag: *"unknown leaves are clean — the conservative direction."*
  The two ≥60%-coverage hits are FP too: `nodeChildren`'s 12 omissions are all childless
  leaves, and `checkNodeReal`'s two (`FieldDef`, `FieldInit`) are reached through parents.

  **Note the tension with §2.4 and §F3-F4, and do not resolve it in the lint's favour.** A
  walker's conservative default is correct *for the variants that exist today* and wrong
  *for the variant added tomorrow* — which is precisely the distinction a textual rule
  cannot make and a `match` makes for free.

### 4.4 The L4 verdict, and the two facts that kill it even at 3 firings

The tightest implementable rule is **L4c**: an if-chain of ≥ 3 `VKind` member literals
against one scrutinee that is a param/local annotated `VKind` in the same function, covering
≥ 60% of the 30 members, with a non-loud fall-through. It fires **3 times**, audited 3/3:
`fbRefNullForKind` (25/30, the 5 missing are scalars its header documents as never reaching
it) **FP**; `repSigTokOfKind` (21/30, `""` is the documented answer "no token") **FP**;
`retKindPri` (18/30, silent `0`) **TP** — and that one is already audit row R11, whose own
comment records a bug caused by exactly a missing arm there.

* **`scripts/lint-self.sh` gates the compiler graph at `--severity info`, and `lint.vl` has
  no per-site suppression.** The only escape hatches in the file are a `_` name prefix
  (unused-* rules only) and `export`. Shipping L4c means rewriting two *correct* functions
  to silence it.
* **The repo's own bar for a new lint rule is ~zero firings on the tree, and it is stated in
  the source.** #2098 (`unused-pure-expression`) shipped after a scoping run of *"std/ 0
  findings, the compiler module graph 0 findings, scripts/*.vl 0 findings"*;
  `union-let-no-melt`'s header says *"It fires ZERO times across `compiler/ std/ bench/
  tests/` as measured before it was written… a diagnostic that cries wolf is one nobody
  reads."* L1/L2/L3/L4a fire 136/198/135/58.

### 4.5 What `lint.vl` can and cannot see — the implementability floor

* **It is a single-file, post-parse AST pass with no types.** `driver.vl:797` `lintGraph()`
  re-parses each module in isolation into a fresh arena and calls `lint(root)` per module.
  Its own header: *"the native front end carries NEITHER"* symbol metadata nor spans;
  `guardProbeRecv`'s comment states the consequence: *"This pass is AST-only, so it cannot
  tell a MAP from an ARRAY."*
* **The coverage-fraction rule is NOT implementable.** `VKind` is declared in
  `emit_state.vl` and **0 of 136** L1 firings are in that file; `Node` is declared in
  `ast.vl` and **1 of 198** L2 firings is. For 136/136 and 197/198 firings the
  discriminator's member list is simply not in the arena being linted, so the rule cannot
  compute "misses 5 of 30". A same-file `UnionDecl.udVariants` lookup *would* work — it just
  never applies here.
* **The scrutinee test degrades from 58 to 24.** Resolving `const k = letCellKind(…)` or
  `fRetKind[i]` to `VKind` needs the checker; `lint.vl` sees only `Param.parType` /
  `LetDecl.letType` → `TypeRef.tyName`.
* **"No loud terminal" is name-keyed guesswork.** `lint.vl` has `stmtDiverges`
  (return/break/continue) but no notion of a diverging *call*; recognising `emitFail`/`tErr`
  means hard-coding compiler-internal names into a rule that ships to every VL user.
* **Cost:** chain collection ≈40 lines; enclosing-function/annotation resolution ≈50
  (`lintWalk` is pre-order with no parent stack); same-file `UnionDecl` member set ≈25 (dead
  for this tree); loud-terminal heuristic ≈25; message ≈20 — **≈160–200 lines in `lint.vl`**,
  in line with #2098's +143, plus LSP wiring and fixtures (#2098 total: +358 across 9 files).

### 4.6 The recommendation

**A lint is not the mechanism, and the prior audit's item-5 sentence can be strengthened**
from *"a lint rule (58 firings, ~83% false positives)"* to:

> a lint rule, measured over all four discriminator families: **561 firings, 75–100% false
> positives**, and the tightest implementable variant is **3 firings at 67% FP**, whose one
> true positive is an already-filed row.

What to do instead, in cost order:

1. **`nodeChildren` → an `_`-less `match` over `Node`** (F3). One function, twelve empty
   arms, proven feasible by probe. Gives the AST a structural guard at the site 24 callers
   already share, and makes the 14 usage detectors (F4) one-edit conversions afterwards.
2. **Mint the sub-domain litunions the ladders are already total over** (§1.5). 62% of
   `VKind`-vocabulary chains are complete over a smaller family that mostly already exists
   (`PushKind`, `BtKind`, `RtKind`, `EqCmpKind`). Each conversion is an exhaustive `match`
   of its own natural size, not a 30-arm one.
3. **Adopt `fieldCodeOfTy`'s `−2` decline convention across the twin families** (§3.3). It
   is the one convention in the tree that makes "the arena declines" typed differently from
   "the arena answers", and it costs a constant.
4. **Widen `ifChainExhausts` to the early-`return` shape and to an inferred return type**
   (§1.3) — the prior audit's recommendation 4, still not taken, and now measured: it would
   reach **83%** of the ladder population by shape and **74%** by annotation, without
   rewriting a single ladder. This is the largest blast radius of anything in this file and
   wants its own measured slice.
5. **A loud terminal is the cheap half of every finding in §2**, and it is not the goal.
   Converting a class-(b) default into an `emitFail` moves a silent cell to a loud one,
   which CLAUDE.md's standing bar scores at zero. Do it where it is one line and the
   capability is genuinely absent; do not report it as progress.

---

## 5. Corrections to `per-rep-ladder-audit.md` this survey owes it

* **The `VKind` vocabulary is 30, not 27.** `u8list`, `nulu8list` and `nulvariant` arrived
  after that section was written. Its "27 members" table and the 11-niche list are stale,
  and the staleness is load-bearing: **68 / 8 / 4 / 13 emit-side ladders** never grew the
  `u8` / `u8list` / `nulu8list` / `nulvariant` arm, and finding F1 is that gap reaching a
  program.
* **Row R9 (`annRetKind`) is stale — its filed witness RUNS.** The arena twin `retTokOfTy`
  covers it. The source asymmetry is real and unguarded (A6); the row's status is not.
* **Rule (a)'s numbers moved with the tree**: 58 → 92 firings, 81 → 106 ladders at ≥ 3 arms,
  993 → 1,319 arena dispatch sites (§4.1). The conclusion is unchanged and the numbers are
  not; quote the date with the count.
* **The C4 usage-detector sweep the audit asked the next sweep to run has now been run**
  (§2.2 F5, §4.3 FP-E, and the 34-detector inventory behind them). It found one reached
  clause-2 gap (`collectFnValUse`, no `RetStmt` arm) and confirmed `cwProgramHasWrite`'s
  `false` = "no write anywhere" as the dangerous direction on the covariance gate.
* **`per-rep-ladder-audit.md`'s recommendation 2 (route the descent walkers through
  `tyChildrenOf`) has an exact AST twin, and the AST one is further along**: `nodeChildren`
  already has 24 callers where `tyChildrenOf` has one. §4.1's re-audit found that **all 5
  true positives of the arena rule are that same walker family**, which is the second
  independent measurement recommending the refactor over the lint.
