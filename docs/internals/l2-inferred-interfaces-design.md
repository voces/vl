# Inferred interfaces for un-annotated functions: design, 2026-11-15

Engineering review item L2 (`engineering-review-2026-11.md` §6). This note is docs only and changes no
compiler code. It was measured at master `bcc1a353`, and every count names its command in §A. The
owner ruled on 2026-11-15 that exports are frozen at the module boundary (DECISIONS.md, "Exports are
frozen at the module boundary"), and this design is written for that ruling.

It builds on four other lanes' designs:
- `relate` → `Coercion`, lane M3 (`refactor-notes/2026-11-15-relate-recorder-design.md`);
- the typed IR, L1 (`ir-design-2026-11.md`);
- `TyId`, lane H (`refactor-notes/2026-11-14-type-hashcons-design.md`);
- the phase products, lane Q (`refactor-notes/2026-11-14-phase-products-design.md`).

## 0. Summary

- **What a hole is today (§1, measured).** An un-annotated parameter is a type variable. Each
  operation on it in the body defers itself, in two forms:
  - as a row in one of **11** constraint tables (`check_cstr_rows.vl`; the review counted ten);
  - as a **derived hole**, one of **15** `HD_*` kinds (`check_hole_pins.vl`).

  At every call, `callFtyPinCstrs` (357 lines) replays the callee's rows against that call's argument
  types, with 26 steps in a fixed order. Deliveries that meet a hole are judged by **145** `hole*`
  functions in `check_relate_core.vl` (about 3,500 lines), and by **293** across `check_*.vl` (about
  5,800). A body is re-checked under quiet modes: `inferQuiet` has 214 read sites, and there are 8 `RB_*`
  rollback site sets.
- **The proposal (§2–§4).** Each un-annotated function gets one **interface**: a scheme `∀ᾱ. B ⇒ τ̄ →
  ρ`, whose bounds `B` are today's deferred demands written as types.
  - The body is checked **once**, generically, in callee-first SCC order of the un-annotated call
    graph. That body check produces the scheme.
  - A call instantiates the scheme, unifies parameters with arguments, solves `B` with **one solver**,
    and reports a failure **at the call**, against the printed signature.
  - Monomorphization stays the backend strategy, keyed by the solved instantiation.
- **The bounds alphabet is the derived-hole alphabet (§2.2).** Every `HD_*` kind and every constraint
  table maps to one of eight bound kinds:
  - row: `α has x: β`, read or written;
  - arrow: `α callable (β̄) → γ`, one per call shape;
  - container: `α ≤ List β`, `Map κ ν` or `Iter`;
  - operator: `α ⊕ β → γ`;
  - lower: `β ⊒ τ`, from a write;
  - narrow: `α ∖ τ`, `α?.x`;
  - member: a deferred method resolution;
  - instance: a nested generic call.

  Nothing new is inferred. What changes is that the demands become a value the caller checks, instead
  of tables a call replays.
- **Exports (§5).** An exported function's scheme is computed from its own module. An importer only
  instantiates it, and the scheme is the interface hash S5 needs. This is the ruling, implemented.
- **Acceptance (§6).** 34 bucket-(c) rows (32 open, 2 closed) plus D16342. Each is mapped to the
  design element that closes it: instance-local generalization 8, narrowing bounds 7 (8 with D16342),
  SCC order 5, contextual lambdas 4, container bounds 3, arrow bounds 2, row bounds 2, generic
  function values 2, nested return recursion 1. Eleven rows do not fit the bucket cleanly, and §6.2
  lists them.
- **Retires (§7).** The 11 tables (a lower bound of 2,405 lines that exist for one table only, about
  2.8k with shared plumbing) and the per-position `hole*` judges. Also `callFtyPinCstrs`'s replay,
  `paramSolveProbe`, `cstrProbe`, and the `RB_CSTR_PROBE`/`RB_SOLVE` re-checks. Estimate: about −14k
  to −22k lines net, inside the review's 15–25k.
- **Migration (§8)** has eight steps:
  - S0 prints the scheme in shadow, byte-identical, and measures coverage.
  - S1 is the SCC order, graded.
  - S2 replaces the tables with the scheme record, byte-identical.
  - S3 is one solver at the call, graded.
  - S4 is instance-local generalization.
  - S5 deletes the judges.
  - S6 freezes exports.
  - S7 retires the probes.
- **Language-visible choices (§9):** five, each settled from an existing ruling or the review's text.
  One, monomorphic recursion within an SCC, stays conditional on S0's measurement.

## 1. What a hole is today

### 1.1 The deferred demands

An operation on a hole that the checker cannot judge until the hole is pinned is written to a table,
keyed by the owning function (`fn` column). The call replays it.

| table | columns | what it defers | consumer (lines) |
|---|---|---|---|
| `binCstr` | lt, op, rt, fn, node, shape | `a + b` with a hole operand | `validateBinCstrs` (128) |
| `argCstr` | at, exp, who, fn, form, node, call | a hole passed to a parameter | `validateArgCstrs` (116) and 10 helpers |
| `retCstr` | got, want, ix, fn, wOnly | a hole returned at a declared result | `validateRetCstrs` (81) |
| `letCstr` | got, want, ix, fn, name, seq | a hole bound at an annotated `let` | `validateLetCstrs` (65) |
| `bmCstr` | seq, got, want, ctx, ix, fn, form, label | a built-in method's argument (`push`) on a hole | `validateBmCstrs` (66), `pinBmCstrElems` (60) |
| `memCstr` | ty, prop, ix, fn, dem | a field read or write on a hole | `validateMemCstrs` (131) |
| `ufcsCstr` | ty, prop, ix, fn, p0, more | a method call resolved by the receiver | `validateUfcsCstrs` (114) |
| `isCstr` | ty, chk, name, ix, fn | `x is T` on a hole | `validateIsCstrs` (43) |
| `printCstr` | ty, ix, fn | `print(hole)` | `validatePrintCstrs` (56) |
| `arrDefCstr` | ty, ix, fn | `Array(n, hole)`'s default | `validateArrDefCstrs` (48) |
| `nestCstr` | ty, ix, fn | a nested generic call's argument | `validateNestCstrs` (51) |

Writers and readers, by the count in §A.1: 58 push sites, 606 other references, 67 writer calls.
The functions that name exactly one table total 2,405 lines.

### 1.2 The derived holes

A read off a hole is a new hole, minted once per derivation (`hdMint`, `check_coal.vl:379`) and
resolved at the pin (`substHoleTy`):

| kind | the read | kind | the read |
|---|---|---|---|
| `HD_FLD` | `a.x` | `HD_COALD` | `c ?? a`, concrete left |
| `HD_RET` | `a(…)`'s result | `HD_TVW` | a written type-parameter place |
| `HD_ELEM` | `a[i]` storage | `HD_HWR` | a hole place holding a concrete write |
| `HD_ELEMV` | `a[i]` value | `HD_OFLD` | `a?.x` |
| `HD_PARAM` | `a`'s parameter `i` | `HD_ITER1`, `HD_ITER2` | a `for` variable over `a` |
| `HD_BINOP` | `a ⊕ b` | `HD_GNOT` | `a`'s `is` complement |
| `HD_COAL` | `a ?? d` | `HD_GALT` | `a`'s guarded alternative |

The five files of this machinery total 6,462 lines (§A.2). Two side tables carry the demands the
`HD_*` kinds do not: the demanded shape (`holeShape*`) and the demanded map (`holeMap*`, `holeArrayDemand`).

### 1.3 The call

`checkCallOnFuncTy` (`check_calls.vl:1346`) handles each argument through `callFtyCheckArg` and
`callFtyHoleParamDemands`, which runs eight demand checks. Then `callFtyPinCstrs` (`:2460`) replays the
callee's rows in 26 fixed steps: lambda pins, literal adoption, `pinBmCstrElems`, then the eleven
`validate*Cstrs` in a hard-coded order, then escape joins, then the return. Between steps it toggles
`substSelfOwnerSet`, `substNestModeSet` and `cstrOwnedStrictSet`. The order is part of the semantics:
`pinBmCstrElems` must run before every validation that reads an element (D2218).

### 1.4 The re-checks

When a body must be seen at a call's types, the checker re-checks it under a quiet mode and rolls the
side effects back. The flags involved:

| flag | role | reads / writes |
|---|---|---|
| `inferQuiet` | suppress diagnostics and record nothing | 214 / 36 |
| `quietDepth` | nesting of quiet scopes | 33 / 32 |
| `paramSolveProbe` | a probe that solves a parameter | 6 / 2 |
| `cstrProbe` | a probe that adjudicates constraints | 4 / 2 |
| `monoRecheckDepth` | mono's instance re-check | 17 / 1 |

The rollbacks use 8 exported site sets over 23 one-bit families. `PRB_TABLES` lists 145 tables, and
a table missing from a mask is a silent stale-state bug (review §4.2).

## 2. The interface

### 2.1 Shape

```vl
// The interface of one un-annotated function: checked once, instantiated at each call.
type Iface = {
  vars: i32[],      // the quantified type variables, one per hole and per derived hole kept
  params: i32[],    // each parameter's type over `vars`
  ret: i32,         // the result's type over `vars`
  bounds: Bound[],  // what the body requires of `vars`, in body order
  fn: i32,          // the declaration
}
type Bound = { kind: i32, on: i32, a: i32, b: i32, site: i32 }  // BK_*, the var, operands, node
```

Type variables are `TyId`s from lane H's intern table, not names. Because the `fn` column of every
constraint row becomes the `Iface` that holds the bound, `callFtyPinCstrs`'s first hundred lines
(review §4.2: "working out which declaration owns a constraint") have nothing left to do.

### 2.2 The bound kinds

| bound | meaning | today |
|---|---|---|
| `BK_ROW` | `on` has field `a: b`; a flag says read, written or optional (`?.`) | `memCstr`, `HD_FLD`, `HD_OFLD`, `holeShape*` |
| `BK_ARROW` | `on` is callable at parameters `a` (a tuple) with result `b`, one bound per call shape | `HD_RET`, `HD_PARAM`, `argCstr` with `form` = call |
| `BK_CONT` | `on` is a list, map, set or iterable of `a` (and key `b`) | `HD_ELEM`, `HD_ELEMV`, `HD_ITER*`, `holeMap*`, `holeArrayDemand`, `arrDefCstr` |
| `BK_LOWER` | `on` must accept `a`: a write, a push or a store | `bmCstr`, `letCstr`, `retCstr`, `HD_HWR`, `HD_TVW` |
| `BK_OP` | `on ⊕ a` has result `b`, by the operator table | `binCstr`, `HD_BINOP` |
| `BK_NARROW` | `on`'s remainder after `is a`, or its `??` result | `isCstr`, `HD_GNOT`, `HD_GALT`, `HD_COAL`, `HD_COALD` |
| `BK_MEMBER` | `on.a(…)` resolves by the receiver's type at the instance | `ufcsCstr`, `printCstr` |
| `BK_INST` | a nested generic call's instantiation, solved with the outer one | `nestCstr`, `argCstr` with `form` = nested |

A body produces only bounds. It never pins an argument. A pin is what the solver does with a bound at
a call.

### 2.3 What stays the same

- **Monomorphization.** A call's solved instantiation is the instance key (§4.2). Each instance is
  still a separate function in the output.
- **Function sets** (lane S's slot store, `fnTagDecide`). A set of functions handed to a parameter
  meets the parameter's `BK_ARROW` bounds, one per call shape. That is today's tag decision with its
  inputs named. D16209's relay sets are `BK_ARROW` bounds whose result is a variable another bound
  reads.
- **No annotation is required anywhere.** `vl` prints a scheme (§9, choice 5). It never asks for one.

## 3. Inference: checking a body once

### 3.1 Order

Un-annotated functions are checked in callee-first order of their strongly connected components in
the call graph. Inside one component the members share monomorphic variables, as in HM: a recursive
call sees the variables, not the scheme. The component generalizes when it closes.

Today a top-level statement checks the later-declared functions it reaches before itself
(`eagerCheckable`, `progCheckCalleeFirst`, #8201). An un-annotated parameter is exempt, because its
facts come from the statement. Under L2 those facts are bounds on the parameter, not inputs to the
body, so the exemption goes. This closes the ORDER rows (§6): D16424, D16426, D16368, and the
D16301 declaration-order family.

S1 retires it for every parameter except one whose calls decide it (`callDecidesParam`): a
parameter used as a map, or one written into a binding. A call closes a map parameter's open key or
value, and `holeDemandOk` refuses to pin a demand the body was already checked against, since the
body's node types would be stale. A binding written a parameter holds a function set's id only when
every call hands it a member (D15053). Both are the solver at the call, so that exemption goes at S3,
with D16630 as its acceptance witness. A call cycle keeps source order and today's fixpoint in
S1, so choice 3 (§9) does not gate it. Measured in `refactor-notes/2026-11-15-g80-l2-s1-callee-first.md`.

### 3.2 What a body check records

The checker walks the body once. Each operation on a variable appends a bound instead of writing a
table row. At the end the bounds are closed:
- a variable that appears only in bounds of one site and nowhere in `params` or `ret` is solved in
  place, as today's local holes are;
- the rest are quantified;
- a body-local value whose type depends on a quantified variable becomes part of the scheme.

The last rule is what instance-local generalization means. D16423's inner `[]` is a list of `β`, and
`β` is quantified, so each call gets its own `β`.

**When a scheme closes.** A scheme is built once, when the body's loud check ends (`bodyChecked`).
- The quiet return-inference pre-pass does not close it. A pre-pass read sees a partial body, and
  its answer is the pre-pass's own (`refactor-notes/2026-11-15-l2-close-and-storage.md`).
- A lambda or nested function closes with its enclosing top-level declaration. Its bounds belong to
  that declaration's scheme.
- A function value bound at module level, with no enclosing declaration, closes at the statement
  that binds it.

M3's census found that a body walk asked after the close gives one answer in every frame, instance
re-checks included. So S2 reads each walk once, at the close.

### 3.3 Literals

`let t = 0; t = t + x` makes `t` a variable bounded below by the literal `0` and by the type of
`t + x`. The scheme leaves it open. At a call over `f64` it solves to `f64`; with no other bound it
defaults to `i32`, as the literal does today. That is settled choice 2 (§9).

## 4. Checking a call

### 4.1 The solver

At a call, the solver:
1. instantiates the scheme with fresh variables;
2. unifies each parameter with its argument's type, pinning the scheme's variables itself. `relate` was
   measured to pin no hole, but static paths to a pin exist, so a pin inside a fit question fails
   loudly (§10);
3. solves the bounds in body order.

| bound | solved by |
|---|---|
| `BK_ROW` | width subtyping (L3's row rule) |
| `BK_ARROW` | the argument's function type, or its set's members, each at the call shape |
| `BK_CONT` | the argument's container shape |
| `BK_LOWER` | the join rule today's push and store adoption apply (D2218's first-write rule is the order of bounds) |
| `BK_OP` | the operator table |
| `BK_NARROW` | `subtractTy` at the solved operand |
| `BK_MEMBER` | method resolution at the solved receiver |
| `BK_INST` | a recursive instantiation of the inner scheme |

The 26-step replay is this loop. The order constraint of §1.3 is kept by keeping bounds in body order:
a `BK_LOWER` from the first push precedes the reads that depend on it.

### 4.2 Diagnostics and instances

A bound that fails reports at the call, naming the parameter and the bound, against the printed
signature. For example: "`sum` needs `xs` to be a list of numbers; got `string[]`". This replaces "the
body of `f` at the call's argument types" (review §3.1, §9, choice 1). The solved instantiation is a vector
of `TyId`s, which is H stage 5's instance key and lane Q's `InstReq` type part (§10).

### 4.3 Function sets at a call, and hand-backs (settled 2026-11-16)

These are the two facts the single storage decider reads (§10), built at check time by
`check_set_bind.vl` (`refactor-notes/2026-11-16-store-set-bind-sources-1.md`).
- **A set reaching a parameter at a call is solver output, keyed by the call, never in an `Iface`.**
  - It is the call's instantiation of the parameter's `BK_ARROW` bounds. One row per (call,
    parameter, set): `on` the parameter's type, `a` its position, `b` the set, `c` the caller's
    parameter it is handed on from (-1 direct), `site` the call, `fn` the callee.
  - It uses `Bound`'s field names but lives beside `InstReq`, because an `Iface` must not depend on
    its callers.
- **A hand-back is a bound of the body: `BND_HANDBACK`**, appended to the owner's `Iface` when the
  body closes.
  - Every value the body returns reads parameter `a` (of type `on`), which nothing else reads. The
    `site` is the body.
  - The test is `check_hand_back.vl`, the one the elaboration reads.

## 5. Exports

The ruling: "an export's types and layouts are inferred from its own module alone". Under L2:
- An exported un-annotated function's `Iface` is computed with its module's checker state only. No
  importer's call can add a bound or pin a variable.
- An importer instantiates the `Iface` and solves it at its own call. The exporter's body is not
  re-checked (DECISIONS: "It never re-checks or re-types the exporter's body").
- The `Iface`, with exported types' shapes, is S5's interface hash
  (`incremental-compilation-design.md` §S5). An edit that leaves an export's `Iface` unchanged does not
  re-check its importers. That reverses Q4 (A)'s cost, as the ruling intends.
- `half()` (review §3.1) prints `0` in every program. Its scheme is `() → i32`, from `lib.vl` alone.

An exported binding (`export let origin = …`) already takes its type from its own module (2026-11-14
ruling). L2 adds functions to it.

## 6. Acceptance

### 6.1 The rows and the element that closes each

These are the 34 rows whose status names bucket (c), plus D16342. The commands are in §A.5.

| element | rows | witness shape |
|---|---|---|
| instance-local generalization (§3.2) | D15041, D16272, D16423, D16425, D3286, D4173, D4719, D4883 | a body-local value (`[]`, an `if` join, a nested lambda) takes one type for every call |
| narrowing bounds (`BK_NARROW`) | D12602, D16325, D16338, D16339, D3216, D3299, D3436, and D16342 | `is`, `?.`, `??`, or assignment narrowing, over a hole or a type parameter's field |
| SCC order (§3.1) | D16368, D16424, D16426; closed: D16430, D16431 | a call before its un-annotated callee's body |
| contextual lambda (`BK_ARROW` read back) | D15771, D16291, D16295, D16337 | a lambda's parameter typed by the bound its use imposes |
| container bounds (`BK_CONT`) | D15161, D16207, D3368 | a map of functions, a generic's `Map()` argument, an `if` of two lists |
| arrow bounds (`BK_ARROW`) | D16336, D3183 | a hole function parameter called at a second type, or recursively |
| row bounds (`BK_ROW`, `BK_MEMBER`) | D16384, D3818 | a std method on a hole, an overloaded member on an alias |
| generic function values | D16411, D16412 | a generic or un-annotated function passed to `(x: A) => A` with `A` unbound at the call |
| nested return recursion | D1968 | a nested un-annotated recursive function |

### 6.2 Rows that do not fit the bucket cleanly

- **The ingredient is a declared type parameter, not a hole:** D12602, D15041, D16207, D16325,
  D16337, D4173 and D4883. `<T>` is a scheme with no bounds, so L2's solver serves both. These are
  in, but each needs its generic spelling graded too.
- **No parameter at all:**
  - D16368: a global's open element read before its push;
  - D16272: a returned `[]` iterated;
  - D1968: nested return inference.

  They need §3.1's order and §3.2's local solving, not a scheme.
- **Annotating does not fix it:** D4719, D3286 and D16342. Their mechanism is a body check that L2
  makes generic. They are re-ablated before S0's go/no-go, and are claimed only on that ablation.
- **D16411** has no hole. Its ingredient is an unbound `A` at the call. It needs §4.1's instantiation
  of a generic function value, which today's mono does not do.
- **D15161** has no ablation table, so it must be ablated before S3 grades it.

### 6.3 The gate rows

At each step that claims a row, the row's witness runs (`check-filed-witnesses --strict`). Its
spelling with the parameter annotated keeps running, and so does its declarations-first order. The
capability matrices whose names hold `hole` or `infer` (224 templates, §A.6) lose no
`runs` cell.

## 7. What retires

| what | measured now | step |
|---|---|---|
| the 11 constraint tables and their writers and validators | 2,405 lines (one table each), about 2.8k with shared plumbing | S2, S3 |
| `callFtyPinCstrs`'s 26-step replay | 357 lines | S3 |
| `hole*` judges in `check_relate_core.vl` | 145 functions, about 3,500 lines | S5 |
| `hole*` functions in other `check_*.vl` | 148 functions, about 2,300 lines | S5, partly |
| derived-hole resolution at the pin (`substHoleTy`'s `HD_*` arms, `holeShape*`, `holeMap*`) | part of 6,462 lines | S3, S5 |
| `paramSolveProbe`, `cstrProbe` and their re-checks (`RB_SOLVE`, `RB_CSTR_PROBE`) | 10 reads, 2 site sets | S7 |
| `PRB_TABLES` entries for the retired tables | of 145 | S2, S5 |

The functions matching `/hole|cstr|demand|pin|^hd|coal/i` across `check_*.vl` total 15,334 lines,
which is an upper bound on what L2 touches. Not all of it deletes:
- pins remain, as the solver's writes;
- coalescing and literal adoption remain, as bound rules.

Estimate: about −14k to −22k lines net. Most of the deletion falls at S3 and S5, and S0–S2 add about
+2k to +3k. Each step reports its own figure.

**L2 does not retire:**
- the slot store (lane S);
- `relate`'s delivery recorder (M3);
- the emitter's capability refusals (L1);
- `inferQuiet`'s six whole-body re-check brackets (L5 step 3, M3 §4.3).

## 8. Migration

The gates for every step:
- two `refresh-compiler.sh` runs give cmp-identical seeds;
- `regress.vl` reports 0 `runs → not-runs`;
- `decl-order-ab.vl` shows no new clause-1 mover;
- the full `GATE_IN_WORKTREE=1 scripts/gate.sh` passes;
- the 224 hole and inferred matrices lose no `runs` cell.

A step marked **identical** must also reproduce its predecessor's seed byte for byte. A step marked
**graded** reports the rows it closes.

| step | what | gate | lines (est.) |
|---|---|---|---|
| **S0** | Shadow schemes: build an `Iface` from today's tables at the end of each un-annotated body, print it under `vl check --ifaces`, and measure how many corpus functions' demands it covers | identical | +600 to +900 |
| **S1** | Callee-first order: retire `eagerCheckable`'s un-annotated-parameter exemption, except a parameter its calls decide (§3.1) | graded: the ORDER rows | +40 |
| **S2** | The scheme is the record: the table writers append `Bound`s to the owning `Iface`, and the validators read them back in today's order | identical | +500, −1,500 |
| **S3** | One solver at the call: `callFtyPinCstrs`'s replay becomes §4.1's loop, and a failure reports at the call | graded: container, row, arrow and narrowing rows; diagnostics move | +1,200, −4,000 to −6,000 |
| **S4** | Instance-local generalization (§3.2) and literal bounds (§3.3, settled choice 2) | graded: the instance rows | +400, −300 |
| **S5** | Delete the `hole*` judges the solver subsumes, one prefix family per PR (`holeSlot`, `holeBind`, `holeLet`, `holeFn`, `holeSet`, …) | identical per PR where possible, else graded | −5,000 to −8,000 |
| **S6** | Freeze exports: an importer instantiates the exporter's `Iface`, and S5's interface hash includes it | graded: the module-boundary population (`incremental-compilation-design.md` §S5's differential test) | +300, −500 |
| **S7** | Retire `paramSolveProbe`, `cstrProbe`, `RB_SOLVE` and `RB_CSTR_PROBE` | identical | −600 to −1,000 |

Order: S0 first, because it is the measurement. S1 and S2 are independent of each other. S3 needs S2 and
the storage decision with lane S (§10). S4 needs S3. S5 needs S3. S6 needs S3. S7 needs S5.

**S0 is the go/no-go.** If the shadow schemes cannot express a measurable share of the corpus's
un-annotated functions (5,397 of the corpus's 28,208 named functions have one, §A.7), the bound
alphabet is incomplete. S0 names the missing kind before any table moves. Before the go/no-go,
D4719, D3286 and D16342 are re-ablated (§6.2). S0 also counts the corpus programs that run today and
recurse polymorphically through an un-annotated function: choice 3's condition (§9).

## 9. Language-visible choices, settled

Each choice follows from an existing ruling or from the review's text (coordinator, 2026-11-15). Only
the condition on choice 3 can reopen one as an owner question.

1. **A failure is reported at the call**, with the bound's body site as a note. Review §6 L2 says
   "check calls against it and report at the call site". Today a caller gets "the body of `f` at the
   call's argument types".
2. **`let t = 0` in an un-annotated body is per instance** (§3.3). At a call over `f64` it solves to
   `f64`, and with no other bound it defaults to `i32`. This is D16293 (a) together with ruling 4.3.
   #8250 already makes `sum([1.5, 2.5])` print `4`, and L2 states the rule as a bound.
3. **Recursion inside a strongly connected component is monomorphic**, as in HM. This holds on one
   condition: S0's measurement must show that no program that runs today depends on polymorphic
   recursion through an un-annotated function. If one does, that program is the owner question, and
   a component's shared variables (S3) do not land until it is answered. S1 orders acyclic callees
   only, so it does not wait on it.
4. **One `BK_ARROW` bound per call shape of a hole function parameter.** For example,
   `g(1, 2) + g("ab", "c").length` (D16209) gives two bounds, which a generic argument satisfies by
   instantiating twice. This preserves what runs today; one arrow per parameter would lose runs, which
   the gates veto.
5. **The inferred signature is printable, not writable, in v1.** It uses a spelling such as
   `sum(xs: List<N>) → N where N: Num` or `{x: f64, ..r}`. A bound annotation syntax is a separate
   language decision.

## 10. Coordination

Replies received 2026-11-15:

- **M3** (relate → Coercion):
  - **Relate pins no hole, measured dynamically, not by construction** (#8323,
    `refactor-notes/2026-11-15-relate-c1-quiet-brackets-measured.md` §3).
    - On the 20,384-program corpus, a counter in `holeSolve`/`holeLink` saw 0 hole writes across
      445,464 loud `assignableExpr` deliveries.
    - It saw writes in 2,003 programs overall, which validates the counter: holes are pinned outside
      the delivery relation.
    - Static paths from `relate` to a pin do exist: `substTyDeep` → `substHoleTy` → `joinTys` →
      `constrainEmpty` → `tyPin*`/`tyLink*`, and the generic-alias fill (`applyGenAliasTys`). Neither
      was observed inside a fit question.
  - **What L2 takes from this:**
    - A scheme's bounds come from the deferred demand rows (`*Cstr`, `HD_*`), from today's rows at S2.
    - The solver makes the pins itself at the call. M3 builds no ask-mode hole log.
    - L2 does not rely on `relate` never pinning. Two things catch a pin if one happens:
      - **S3's assertion.** While the solver asks a fit question, `holeSolve`/`holeLink` refuse a write
        loudly, by a compiler trap with the site, and the full corpus runs under it in S3's gate.
      - **The seal.** Lane H's stage 4 seals arena types after `arenaFinal`. L2's own seal marks a
        closed scheme's variables, so a write to one outside the solver's instantiation fails at the
        writer instead of retyping the scheme.
    - If either catches a pin, M3 owns the small PR beside `holeSol` that returns it as data.
  - **Coercions stay per instance:** the IR builder asks `coercionAt(ix, inst)`, a pure query, and L2
    adds no checker-side coercion table. The four position seats (box, unbox, atomstr, numeric) are
    applied by the builder.
  - **Caveat for L2 and L1:** the per-instance records come today from mono's re-check of each
    instance body (`RB_MONO`). "Checked once, generically" moves where those records come from. S3
    must keep producing them per instance, either from the solver's instantiation or from a retained
    instance re-check, until L1 builds from the template (phase B).
- **IR lane** (L1):
  - **The instance key is the scheme's solved instantiation**, with one caveat. The key is
    (template `SymId`, argument `TyId[]`), plus the importer `ModId` for an exported `const` copy
    only. That is H's stage-5 id-vector key, as long as H's pins are exactly the scheme variables'
    solutions.
  - Under L2, `InstReq`'s call-site facts leave the key. `delivery` and `argLit` become coercions on
    the call edge. `retTy` and `retWidenTy` become part of the scheme, or a coercion at the result.
    `frame` and `call` stay as provenance. So no new field is needed.
  - **Storage versus type identity, settled 2026-11-15.** Two calls with the same `TyId` vector can need
    different storage for a function-typed parameter (`RClosure`, `RSetId` or `RDirect`).
    - The scheme is storage-free: a `BK_ARROW` bound solves to types only.
    - The instance key carries the storage decision of each function-typed parameter, from whoever
      decides it.
    - Storage has one decider: the tag-decision layer (`fnTagDecide`, `check_fn_tag.vl`). Its re-run
      after the elaboration (`fnTagRedecide`, `emit_sections.vl`) is a second decision. The goal is
      that it goes before L2 S3, so S3 never decides storage. Owner: lane G. `fnTagRedecide` is
      removed in its own PR before S3.
    - S3's solver produces the closed per-shape signatures of a hole function parameter's calls.
      The bundle-or-not decision over them is storage.
    - The discriminators H plans to fold into nominal `TyId`s (`monoAnonPinDiscrim`, the set and
      literal-union discriminators) are part of the same question.
  - **S** (slot store) agrees with the storage-free scheme, and with storage in the key in
    principle. Its slot store does not decide storage. It produces closed delivered types: what a
    slot's function leaf is called and bound at (`epl*`, `elabSlotTyAt`, `eplSlotSig`,
    `eplSlotBound`). Those facts follow flow, not argument types alone: which values reach the
    slot, the calls through it at each instance's arguments, written destinations and copies. So a
    key of template, argument `TyId`s and the call's set membership is complete only because set
    membership is itself a decided input, `fnTagDecide`'s output. S's plan deletes the delivery walk
    (`elabSlotDeliveries`), not either tag decision.
  - **Order hazard: IR I9 after S6.** Phase A lowers mono's instance set as it is, including instances
    of an exported un-annotated function pinned from an importer's call. S6 changes that set, so the
    function section moves, and the cause is L2. If I9 (phase B, per-module `Lowered`) lands before S6,
    its key for an un-annotated export must carry the importer's `ModId` until S6.
- **H**: type variables are `TyId`s, and binder identity (stage 1) has landed.
- **S**: function sets meet `BK_ARROW` bounds (§2.3), and the storage question above is open with S.
  Lane J's D16278 rooting work in `fnTagDecide` is unaffected until S3.

## A. Commands

Run at master `bcc1a353` from the checkout root. A function's lines run from `^(export )?function` to
the next line starting with `}`.

### A.1 Constraint tables

```
grep -nE "^export (const|let) [a-zA-Z]+Cstr[A-Za-z]*\s*[:=]" compiler/check_cstr_rows.vl   # 12 lines: the 11 tables and nestCstrSeen
grep -nE "\bvalidate[A-Za-z]*Cstrs\(" compiler/*.vl                                       # replay sites
sed -n 2460,2817p compiler/check_calls.vl                                                 # callFtyPinCstrs
```

### A.2 Derived holes

```
grep -nE "^export const HD_" compiler/check_hole_pins.vl
wc -l compiler/check_hole_pins.vl compiler/check_coal.vl compiler/check_hole_rows.vl compiler/check_hole_links.vl compiler/check_demands.vl
```

### A.3 The `hole*` judges

```
grep -cE "^(export )?function hole" compiler/check_relate_core.vl                          # 145
awk '/^(export )?function hole/{c++; inf=1; n=0} inf{n++} inf && /^}/{t+=n; inf=0} END{print c, t}' compiler/check_relate_core.vl
awk 'FNR==1{inf=0} /^(export )?function hole/{c++; inf=1; n=0} inf{n++} inf && /^}/{t+=n; inf=0} END{print c, t}' compiler/check_*.vl
```

### A.4 Quiet modes and rollback

```
grep -nE "^export const RB_" compiler/check_rollback.vl
grep -nE "checkRollback\(|checkMark\(\)" compiler/*.vl
grep -wc inferQuiet compiler/*.vl | awk -F: '{s+=$2} END{print s}'
```

### A.5 The acceptance rows

```
grep -l "bucket (c)" docs/internals/inventory/*.md docs/internals/inventory-2/*.md        # 34
for f in $(grep -l "bucket (c)" docs/internals/inventory/*.md) docs/internals/inventory/D16342.md; do grep -m1 '^\*\*' $f; done
```

### A.6 The matrices

```
ls scripts/capability-probes/matrix/ | grep -E "hole|infer" | wc -l                        # 224
```

### A.7 The un-annotated population

A named function counts if any parameter has no `:` annotation. The command matches
`function NAME(<…>)?(params)` over `tests/cases/**/*.vl`, `compiler/*.vl` and `std/*.vl`:
- tests/cases: 5,397 of 28,208;
- compiler: 102 of 17,370;
- std: 4 of 318.
