# The `check_reject` audit — which of the 53 refusals does the DESIGN forbid?

**Measured 2026-09-03 on `76dfcc00`, a clean worktree with a seed refreshed from
`compiler/*.vl` by `scripts/agent-setup.sh`.** Every witness below was run VERBATIM out of its
filed row — extracted by `scripts/check-filed-witnesses.py`'s own parser so no program was
retyped — with `VL_STD` pinned to this worktree's `std/`.

This is a MEASUREMENT, not a fix. Nothing in `compiler/`, nothing in either inventory, and no
row status was changed. Status updates belong in a later PR.

## The question

CLAUDE.md §"The goal is `runs`" states the worry in its own words:

> **25 inventory rows closed in five days, every one by converting `check-clean invalid wasm`
> into a loud refusal.** Under "fix all miscompiles" each of those closes is correct and
> defensible. Under this goal **they are all still open.**

So: of the rows that now grade `check_reject`, how many refuse a program the DESIGN forbids,
and how many are a codegen gap wearing a checker's clothes?

## The population, named

**53 rows**, drawn from the 523 rows of `docs/internals/silent-class-inventory.md` (51) and
`silent-class-inventory-2.md` (2) that `check-filed-witnesses.py` grades `check_reject`. The
whole-doc grade on this tree is `523 graded · 523 as filed · 0 MOVED · 0 not graded` under
`--strict`.

This is the FILED population. It is not a measurement of VL: the distilled corpus holds 7,021
cells and contributes zero emit-side evidence, and `docs/internals/emit-refusal-reachability-2026-09.md`
puts ≈187–328 of the compiler's 504 emit-refusal sites reachable by a `vl check`-clean program.
53 filed rows is a notebook of what someone looked at.

## The three-way count

| verdict | rows | share |
|---|---|---|
| **DESIGN** — the program is genuinely illegal and a rule or a soundness argument says which | **36** | 68% |
| **CAPABILITY** — legal under the design; the refusal is a gap. Clause-2 violations | **15** | 28% |
| **UNDECIDED** — could not settle in the time box | **2** | 4% |

Cross the verdict with what the inventory itself claims, and the answer to the headline
question falls out:

| | DESIGN | CAPABILITY | UNDECIDED |
|---|---|---|---|
| **41 rows marked CLOSED / RULED** | 36 | **4** | 1 |
| **12 rows not marked closed** | 0 | **11** | 1 |

**Of the rows this project counts as CLOSED, the standing goal still considers 5 of 41 open
— 12%, not the ~21 of 53 the wording-based scan suggested.** The other side of that table is
worth as much: every row still filed as open in this population is a capability gap, so the
inventory's own open/closed labelling is nearly aligned with the goal already.

### The "was silent, now loud" signal is weak evidence, and this is how weak

The brief's starting hypothesis was that a row recording a conversion FROM a silent miscompile
or an emit refusal is a strong CAPABILITY signal. Measured over this population — a row counts
as recording a conversion if its title or status names `check-clean invalid wasm`,
`check-clean silently wrong`, `loud emit reject`, `loads then traps` or `trap_loads`:

| | rows | DESIGN | CAPABILITY | UNDECIDED |
|---|---|---|---|---|
| records a conversion from silent / emit | 33 | **28** | 4 | 1 |
| records no such conversion | 20 | 8 | **11** | 1 |

**The signal points the wrong way.** A row that records a conversion is 85% DESIGN; a row that
records none is 55% CAPABILITY. Narrowed to the exact phrase `check-clean invalid wasm`: 17
rows, **14 DESIGN and 3 CAPABILITY**.

The reason is one mechanism doing most of the work. Eleven of the 53 are a refusal the checker
owed at the DIRECT spelling and LOST at a monomorphization pin, so the instance built a module
the engine then refused. The program was **ill-typed all along**; nothing about it was ever
lowerable. `print(g("s", 2))` where `g<T>(a: T, n: i32): T { return n + 1 }` is not a
capability gap in any spelling, and neither is `.length` on a `boolean`.

That does not retire the CLAUDE.md paragraph — it locates it. The four closes it correctly
describes are all in one family (covariance over aliasing lists), and `DECISIONS.md` had
already written down, before they landed, that this was the family where it would happen.

## Rows that RUN today (free closes): NONE

All 53 witnesses are `vl check` rc 1 and `vl run` rc 1 on this tree; the `(check_rc, run_rc)`
histogram over the population is `{(1,1): 53}`. Nothing regressed either — no row that files
`check_reject` now emits a module, and the whole-doc grade is `0 MOVED` across all 523 rows in
both inventories.

**Two things a whole-doc `0 MOVED` cannot see, and both are here:**

* **D35 and D421's ORIGINAL witnesses now RUN, and the rows were re-pointed at maps.** Both
  rows filed a `Circle[]` operand; D751/D752 built the compare cores, so today
  `[{r:7}] == [{r:7}]` prints `true` at the direct spelling AND through a `T[]` pin. The filed
  repro was rewritten to `{[string]: i32}`, which is refused for an unrelated reason (the map
  equality ruling). The grader sees a row still refusing and reports `as filed`. That is
  correct and it hides a real close.
* **D957 is graded on PROSE, not on a program.** The row has no `Repro:` block, so the parser
  takes its first indented block — an English paragraph — and runs it. The result is
  `(parse error)`, which maps to `check_reject`, which matches the declared status, so the row
  passes `--strict` for entirely the wrong reason. It is the only one of the 53 with this
  shape (checked: keyword-density plus lexer tells over all 53 repros).

## How each verdict was reached

Four instruments, in order of how often they settled a row:

1. **The direct / neighbouring spelling.** A design rule does not usually distinguish two
   spellings of one type. `{[string]: i32} | null` inferred RUNS and `{[i32]: i32} | null`
   inferred does not (D1108). `if y is T` RUNS and `match y { T => … }` does not (D1118).
2. **An owner ruling in `DECISIONS.md`.** Nine of the 36 DESIGN verdicts rest on one.
3. **Contract vs mechanism in the refusal's own sentence.** "operator dispatch binds the LEFT
   operand to `self`" is a contract. "the two element storages differ, so the destination
   would have to hold a converted copy" is a mechanism.
4. **Is there a lowering that would make the refused program run CORRECTLY?** This is what
   splits the covariance family in half; see below.

---

## The strongest CAPABILITY findings

### 1. The written-through covariance rule refuses SOUND programs, and its own ruling predicted this (D774, D821, D823, D852)

`DECISIONS.md` §"Array covariance over ALIASING lists" prices four answers, adopts none, and
closes with a section headed *"What the compiler should NOT do, and this is the trap"*:

> **Re-word the emit refusal into the checker.** It looks like a clause-2 close … It is not
> one. The rule it would state is the storage partition wearing type-shaped clothes … **That
> is strictly worse than leaving it at emit**, where at least it is counted.

Four rows landed after that paragraph and did exactly it. The message is

> a Circle[] cannot be assigned to Shape[] here: the list is WRITTEN THROUGH somewhere in this
> program, and a covariant list assignment is read-only. **The two element storages differ, so
> the destination would have to hold a converted copy** …

**The neighbouring-spelling evidence is a five-cell grid** (`_scratch/pack-cov.txt`, run on
this tree):

| program | today |
|---|---|
| `Circle[]` → `Shape[]`, no write | **runs** (prints `1`, `7`) |
| `Circle[]` → `Shape[]`, `b.push({s:3})`, then only `.length` | **check reject** (D821/D774's shape) |
| two DIFFERENT unions over one list, write, then only `.length` | **runs** (prints `1`) |
| two SAME-member-set unions over one list, write, element read + match | **runs** (prints `203`) |
| single destination, element read + match | **runs** (prints `107`) |

Row 2 is the finding. Its only observation is `a.length` / `b.length`; VL lists alias, so the
program has one correct answer and the compiler can state it. It is refused. Row 3 is the same
covariant-write shape with elements that happen to share a box, and it runs — **so "a covariant
list assignment is read-only" is not the rule the compiler applies.** The rule it applies is
"the element reps differ", which is a representation fact, and D741's own 36-cell grid already
measured that no rule in the type system's vocabulary is co-extensive with it.

Note the asymmetry between the two rules in this family, because it is the cleanest evidence
of all: the two-different-unions rule (D853) IS gated on an element READ, and spares
`d741_w5_no_narrow` for exactly that reason. The two-element-storages rule (D821) is gated on
nothing of the kind, and so refuses the `.length`-only programs above.

**What the four rows would each print:** D774 `1` then `1`; D821 `1` then `1`; D823 and D852
`2` then `2` — and D823's own filed comment says so (*"SHOULD PRINT 2 then 2 — VL lists alias,
so the push is visible through `a`"*).

The other five rows of the same family (D661B, D741, D793, D832, D834, D853) are DESIGN: their
witnesses READ an element through a handle whose annotation the stored value does not satisfy,
so `a[0]` has no correct value under any representation. Refusing them is forced.

### 2. `%` over `f64` is refused by a sentence the compiler's own comment contradicts (D493 — filed UNDECIDED, and this is why)

The refusal says `operator '%' is integer-only`. `compiler/typecheck.vl:36827` says:

> `%` is here for a DIFFERENT reason than the bitwise ops … **Float remainder is a meaningful
> operation — it is just one wasm has no instruction for** … Exact float remainder needs a
> scaled shift-and-subtract helper, and **when it lands** it belongs … a float intrinsic,
> beside `sqrt`/`trunc`/`copysign`.

Both halves are in one comment: the operation is meaningful (capability language) and its home
is an intrinsic rather than the operator (design language). `DECISIONS.md` records only the
predicate-duplication fix, not a ruling on the spelling. **What would settle it:** an owner
ruling on whether float remainder is spelled `%` or `fmod`. Until then the row's own close is
right for its own question — the pin now agrees with the direct spelling — while the direct
spelling's legitimacy is unmeasured.

### 3. Two blank diagnostics refuse programs whose direct spelling runs (D1004, D1221)

Both print `[ERROR]: ` and a caret with no sentence. Both instantiate at a type that HAS the
member.

```
function getN<T>(x: T): i32 { x.n }      print(getN({ n: 1 }))     → [ERROR]:  (blank)
function getN(x: { n: i32 }): i32 { x.n } print(getN({ n: 1 }))    → runs, prints 1
```

```
type Boxed = { tag: () => string }
function g<T>(x: T): string { x.tag() }   print(g(b))              → [ERROR]:  (blank)
function g(x: Boxed): string { x.tag() }  print(g(b))              → runs, prints fld
                     … plus a `function tag(self: Boxed)` in scope → runs, prints fld
```

A refusal that cannot state its rule is not a design rule. D1004 is on ROADMAP's *"Awaiting
owner rulings"* list; D1221 is filed clause-2 OPEN.

### 4. An import makes a legal program stop checking (D981)

```
import { toString } from "std:fmt"       // the import is never used
function f(x: i32) { return x }
function g(e: i32) { return if e > 0 { f(e) > 0 } else { false } }
print(g(5))                              → [ERROR]: undeclared identifier 'f'
```

Delete the import line and the identical program checks clean and prints `true` (measured).
Not a codegen gap and not a rule — a scope-resolution defect that refuses a legal program, so
clause 2 by construction. The row says so itself; this audit confirms it reproduces on
`76dfcc00`.

### 5. A read-only callee retires a narrowing (D452, inventory-2)

```
function look(ys: (i32[] | null)[]) { print(ys.length) }   // reads only
… if xs[0] != null { look(xs); print(xs[0].length) }
→ 'xs[0]' was narrowed by a guard, but the call to 'look' on line 6 can write it
```

`look` cannot write it. Move the read ahead of the call and the same program runs, printing
`2` then `1`. The row's own title — *"a write-effect summary has no vocabulary for an index
sub-path, so an aliasing call over-retires"* — is the diagnosis, and it is filed as a
refinement deliberately not built. Its sibling D341 in the same inventory is DESIGN: there the
callee **does** write `ys[0] = null`.

### 6. Four refusals concede codegen in their own words (D957, D1108, D1190, D1194, D1198)

These need no argument beyond running the neighbour, and all are already filed clause 2:

| row | refusal | neighbour that runs |
|---|---|---|
| D1108 | `'pick' infers the nullable return type {[i32]: i32} \| null — type-valid, but … not yet supported by codegen` | the `{[string]: i32}` twin runs; the ANNOTATED `{[i32]: i32}` twin runs |
| D1194 | `'wrap' infers the union return type i32 \| "err" — type-valid, but … not yet supported by codegen` | annotated return runs (prints `10`); plain-`string` union inferred runs (prints `10`) |
| D1190 | `a deep `is` arm that rebinds or writes `r` is not supported yet` | drop the `r = null` and it runs, printing `3` |
| D1198 | `` `Tree` is recursive; a recursive JSON shape has no walker yet `` | ROADMAP carries it as named serde residue behind D1197 |
| D957 | `… is not yet supported by codegen; annotate the return type` | the row records a fix BUILT with all four leaves measured running, then reverted |

### 7. The un-annotated face of a narrowing that works annotated (D1243), and the `match` face of an `is` that works (D1118)

```
function take(a: i32 | "err") { if a is "err" { print(0) } else { print(a * 2) } }  → 10
function take(a)              { if a is "err" { print(0) } else { print(a * 2) } }  → check reject:
        argument 1: operator '*' is not defined for i32 | "err" and i32
```

```
function pick<T>(x: T, y: T | null): T { if y is T { return y } return x }   → runs, prints 2
function pick<T>(x: T, y: T | null): T { match y { T => y, null => x } }     → check reject:
        match pattern `T` is not a member of T | null
```

Two spellings of one capability, one annotation or one keyword apart. CLAUDE.md's "two faces,
two clauses" rule, twice.

---

## Every row, with its verdict

`msg` is the refusal's operative sentence, trimmed. `evidence` names what settled it.

### DESIGN — 36 rows

Grouped by the rule that forbids the program.

**Operator declarations that nothing can reach (8) — `DECISIONS.md` §"A declaration nothing can
reach is refused AT ITSELF (D444/D445)" and §"An operator reject's PLACEMENT is a language
decision (D425, D443, D444, D445)".** The refusal is by construction the negation of the
dispatch gate.

| row | msg | evidence |
|---|---|---|
| D46 | `` `==` is not overloadable — every type compares structurally `` | ruling §"`==` and `!=` are NOT overloadable" |
| D425 | ``operator `+` can never dispatch: `self` is the LEFT OPERAND and dispatch needs an object, but i32 is not one`` | ruling §3441 |
| D444 | ``operator `-` takes 2 parameters (self, other), got 1 — operator dispatch is binary only`` | ruling §2952; parser-resident because arity is syntactic |
| D445 | `operator "[]" for i32[] can never dispatch: indexing i32[] is the language's own` | ruling §2952; the gate CALLS `tyBuiltinIndexable` |
| D471 | ``operator `-`'s first parameter must be named `self`, got `z``` | same family |
| D491 | ``operator `+` never dispatches: `self` is a TYPE PARAMETER … every `+` site in this program took the language's own lowering`` | **measured**: add one object `+` site and the same declaration compiles and prints `99` |
| D521 | ``operator `+` never dispatches: `self` has NO ANNOTATION`` | **measured**: same — with a live site it prints `99` |
| D541 | ``operator `+` can never dispatch: a binary operator must be declared at MODULE SCOPE`` | same family. NOTE: module-scope-only operator declaration has no ruling of its own; it is the status quo of dispatch stated as a contract |

**A refusal LOST at a monomorphization pin, where the direct spelling was always illegal (11).**
Each of these was `check-clean invalid wasm` or a `loud emit reject` because the checker
declined to re-ask a question at the instance. The program is ill-typed at the instance.

| row | msg | evidence |
|---|---|---|
| D492 | `operator '^' is not defined for string and string (the call's argument types)` | bitwise xor over `string` has no reading; direct spelling refuses |
| D551 | `return type mismatch: expected V, got i32 (the return of `g` …)` | `return a` where `a: i32` and the declared return is a struct |
| D561 | `return type mismatch: expected string, got i32` | `return n + 1` under `: T` pinned at `string` |
| D572 | `cannot assign i32 to 'r' of type string` | `const r: T = n + 1` at `T = string` |
| D581 | `cannot assign i32[] to 'xs' of type string[]` | `const xs: string[] = [self]` at `T = i32` |
| D582 | `push: cannot add i32 to string[]` | `xs.push(self)` at `T = i32` |
| D651 | `member access '.length' on non-object i32` | `.length` on an `i32`; direct spelling refuses |
| D691 | `member access '.length' on non-object boolean` | same, at the parameter itself |
| D952 | ``no `foo` on `T` — its bound `Showable` grants `toString()``` | the bound does not grant `foo`; constraints phase 1 |
| D1001 | ``{s: f64} does not satisfy `Showable`: no `toString(): string``` | the argument does not satisfy the declared bound |
| D1005 | `no field 'toString' on {s: f64} — the `toString` in scope takes Circle` | the UFCS receiver does not fit at this instance |

**Documented domain and tag rules (6).**

| row | msg | evidence |
|---|---|---|
| D401 | `` `g` prints its type parameter here: print expects one scalar or string value … got i32[] `` | ruling §"`print`'s DOMAIN is a design rule (D711/D712)" and §"PRINTABILITY is the fourth deferred capability (D401)". Direct `print(v)` on `i32[]` refuses identically; `print` of a boxed value union RUNS today, which is the D712 split the ruling names |
| D711 | `print expects one scalar or string value (…), got i32[]` | same ruling, ABLATED: both sites lifted → 19 cells `loud check reject` → invalid wasm and **zero run** |
| D754 | `{[string]: i32} isn't equatable — a map has no defined value equality: its entries are insertion-ORDERED and observable that way` | filed **RULED**; rationale in `docs/internals/identity-critique-crosslang.md:198` |
| D35 | same sentence, at a `T` pin | direct spelling refuses identically (measured). See the free-close note above: the row's ORIGINAL `Circle[]` witness now RUNS |
| D421 | `{[string]: i32}[] isn't equatable (a field is not value-comparable)` | same rule one constructor up; `Circle[] == Circle[]` runs at BOTH spellings (measured) |
| D221 / D228 | `` `is` check type 'i32' is not a variant of f64 \| null `` | ruling `DECISIONS.md:657` (2026-08-28): *"`x is T` asks a TAG question, so `assignable` is the wrong predicate for it — a numeric WIDENING is not a variant"*, with the alternative considered and rejected and the price named (44 programs that ran, named set `d228-is-widen`) |

**Soundness, forced (9).**

| row | msg | evidence |
|---|---|---|
| D661B | `a Circle[] cannot be assigned to Shape[] here … WRITTEN THROUGH` | the witness stores an `Sq` and then reads `a[0].r` — no representation makes that read correct. **Caveat**: the RULE that fires is the capability-shaped one; with the element read removed the same program is still refused and its correct answer is `1` (measured) |
| D741, D793, D832, D834, D853 | `a {r: i32}[] cannot be assigned to Other[] here: this list is ALSO declared with a DIFFERENT element union … and it is written through` | all five witnesses store a `Tri` and then read the element through a `Shape` handle. `wasm trap: cast failure` / the wrong `match` arm before the close. The rule IS gated on the element read, and spares the read-free program (measured: it runs, printing `1`) |
| D938 | `an object of type OW cannot flow into ON: they agree on field names but differ INSIDE a field, and a struct field is mutable` | mutable-field invariance. Neighbours measured: TOP-LEVEL width flow `{a,b}` → `{a}` runs (prints `1`), and the message's own advice (rebuild the value) runs (prints `1`). **Caveat**: the rule fires on a read-only callee too, and has no ruling of its own in `DECISIONS.md` |
| D341 (inv-2) | `'xs[0]' was narrowed by a guard, but the call to 'clr' on line 6 can write it` | `clr` genuinely writes `ys[0] = null`. Contrast D452 below |

**Name resolution (2) — `DECISIONS.md` §"UFCS is never implicit: the compiler resolves `x.f(…)`
only against names IN SCOPE".**

| row | msg | evidence |
|---|---|---|
| D1230 | `'toEqual' is not imported — a free `toEqual(self: …)` … a UFCS call resolves only names in scope` | the ruling; the row files itself as diagnostic-quality, neither clause |
| D1191 | `no field 'hidden' on Box` | the same ruling, from the other side: an un-exported `self`-function was leaking across modules |

### CAPABILITY — 15 rows

Every one is a clause-2 violation. Eleven are already filed as open; four (D774, D821, D823,
D852) are filed CLOSED.

| row | filed | msg | why capability |
|---|---|---|---|
| D774 | CLOSED | `a {r: i32}[] cannot be assigned to Shape[] here … a covariant list assignment is read-only. The two element storages differ` | the program's only observation is `.length`; correct answer `1`, `1`. The same shape with same-rep elements runs (measured) |
| D821 | CLOSED | same | correct answer `1`, `1` |
| D823 | CLOSED | same | correct answer `2`, `2` — the row's own comment says so |
| D852 | CLOSED | same | correct answer `2`, `2` |
| D957 | open | `… is not yet supported by codegen; annotate the return type` | message concedes; a fix was built with all four leaves measured RUNNING and reverted for a seed-scoping reason the row names. ALSO: this row has no `Repro:` block — see the instrument note |
| D981 | open | `undeclared identifier 'f'` | deleting the unused `import` makes the identical program check clean and print `true` (measured) |
| D1004 | open | `[ERROR]: ` (no text) | `getN(x: {n: i32})` runs and prints `1` (measured) |
| D1108 | open | `'pick' infers the nullable return type {[i32]: i32} \| null — type-valid, but … not yet supported by codegen` | the string-keyed twin and the annotated twin both run (measured) |
| D1118 | open | ``match pattern `T` is not a member of T \| null`` | the `is T` spelling of the same program runs and prints `2` (measured) |
| D1190 | open | ``a deep `is` arm that rebinds or writes `r` is not supported yet`` | drop the rebind and it runs, printing `3` (measured) |
| D1194 | open | `'wrap' infers the union return type i32 \| "err" — type-valid, but … not yet supported by codegen` | annotated return runs; plain-`string` union inferred runs (both measured, both print `10`) |
| D1198 | open | ``a recursive JSON shape has no walker yet`` | message concedes; ROADMAP carries it as serde residue behind D1197 |
| D1221 | open | `[ERROR]: ` (no text) | the direct spelling and the `self`-function spelling both run and print `fld` (measured) |
| D1243 | open | `argument 1: operator '*' is not defined for i32 \| "err" and i32` | the annotated parameter twin runs and prints `10` (measured) |
| D452 (inv-2) | open | `'xs[0]' was narrowed by a guard, but the call to 'look' … can write it` | `look` only reads; reorder the read ahead of the call and it runs, printing `2`, `1` (measured) |

### UNDECIDED — 2 rows

| row | msg | what was tried | what would settle it |
|---|---|---|---|
| D493 | `operator '%' is not defined for f64 and f64 (the call's argument types)` | Read `compiler/typecheck.vl:36822`'s 16-line rationale and `DECISIONS.md` §"A MIRROR is a claim about ORDER". The comment calls float remainder *"a meaningful operation … one wasm has no instruction for"* and prescribes an intrinsic rather than the operator. `DECISIONS.md` records only the predicate-duplication fix | an owner ruling: is float remainder spelled `%`, or `fmod` beside `sqrt`/`trunc`/`copysign`? DESIGN if the latter, CAPABILITY if the former |
| D1091 | `cannot infer a type for 'zs' — add a type annotation` | Measured three spellings: `const zs: i32[] = mk(6)` runs (`0`); `function mk(len: i32): i32[]` runs (`0`); the bare `const zs = __array_new_default__(6)` refuses identically, so the rule is applied consistently. The row's real defect is that `vl check --fix` DELETED the annotation, which is not a check-reject question | an owner ruling on whether `__array_new_default__`'s element type must be annotated at some binding, or whether local inference is expected to ground it from the use. Separately: the row is mis-shelved in a check_reject audit — grade it on the autofix |

---

## What this audit does NOT say

* **It does not say VL has 15 clause-2 violations.** It says 15 of 53 FILED rows are.
  `goal-scoreboard.py` reads the corpus, which contributes zero emit-side evidence, and
  `scripts/capability-probes/run.py --sites` is the finer instrument for the unfiled ones.
* **It does not re-derive the "25 rows in five days" number.** That claim's population was
  never written down; this one's is.
* **It grades the WITNESS, not the family.** D661B's witness is unsound and its verdict is
  DESIGN, while the rule that refuses it demonstrably over-refuses. Where a row's verdict and
  its rule's verdict differ, both are stated above rather than averaged.

## Reproducing this

```sh
python3 scripts/check-filed-witnesses.py --strict --json out.json \
    docs/internals/silent-class-inventory.md docs/internals/silent-class-inventory-2.md
# then: the 53 rows whose `actual` is `check_reject`, each repro run verbatim with
# VL_STD pinned to the worktree's std/.
```

The neighbouring-spelling grids are small enough to retype from the tables above; each is one
program per row and each names the value it must print.
