# Initialization order: the compile-time rule and the reordering rule

> Status: design, Phase 1 of ROADMAP "Next" item 3. No compiler or std source changes with this
> note. Every "today" claim is a program run on a seed self-compiled from master `26f7a8fbb`
> (2026-11-16), or a line of the tree cited by path. The owner ruling it builds on is DECISIONS.md
> "Initialization order: a read before the initializer is an error, and the goal is a compile
> error" (2026-09-26). §5 lists the language-visible choices for the owner. Nothing in §5 is
> decided here; each item there has options, code and a recommendation.

**The ruling, restated.** A read or write of a module global before its initializer ran is an
error. Today it is a runtime error (D2652, D2653, D2654, D14360). The goal is a compile error
wherever init-before-read is not statically guaranteed. Initializers are also reordered at
compile time wherever that preserves behaviour, for globals and for locals.

**The short answer.**

- **The check is definite assignment carried through calls.** The checker already walks
  top-level code with a definite-assignment set (`compiler/check_definite.vl`). Extend it in two
  ways. First, an initialized global joins the set when its declaration statement completes.
  Second, at every point where top-level code can run a function body (a call, or a function
  value escaping), it checks that function's transitive read set: every module global the
  function, or anything it can call, reads or writes. Each global in that set must already be
  in the definite set. D14360 and D14361 both fall out of this as special cases, with no
  progress cell.
- **The read set is computed over resolved callees, not names.** `initGuardScan` matches by name.
  §2.3 shows that half of the corpus programs it guards and that run are guarded only because of
  name-matching artifacts.
- **Reordering only rescues.** A program that the rule accepts in source order runs in source
  order. An initializer moves only when the source order would be rejected. It moves only as far
  as the first statement that needs it, and only when the initializer has no effects. Statements
  never move.
- **Measured cost:** 0 of 18 std modules and 0 compiler modules would be rejected. In the corpus,
  31 of 15,787 programs that build get a guard today. Of those 31, 21 already trap and 10 run.
  With the precision fixes in §2.3, 5 of the 10 would become newly rejected. All 5 depend on
  values: a call on a branch the run never takes. Reordering rescues 6 of the 21 programs that
  trap today. Locals: 11 programs get the capture trap today; 9 already trap, and the 2 that run
  stay accepted under §5 Q6's recommendation (§4).

---

## 1. What exists today

### 1.1 The runtime guard (module globals)

`initGuardScan` (`compiler/emit_sections.vl`) walks top-level statements and global declarations
in source order (`globalStmtOrd`/`startStmtOrd`). At each position it marks every function
reachable from what it has walked so far:

- **By name.** `igMention` reaches every `fnStmts` slot declared under the mentioned name. That
  includes a member name: `.k` reaches a free function `k`.
- **Lambda bodies.** `igWalk` walks them inline, at the position where the lambda is created.
- **Named functions.** A function's body is walked once, at its first mention.

A global's position `gInitAt` is its declaration. A no-initializer `let` takes the first
top-level statement after which `daTopAssignedAt` finds it assigned on every path (D14360).
`igSettle` then guards a global in two cases:

- guard 1: a read reached it before its position, and its value arrives at run time;
- guard 2: a write reached a folded `let` before its position.

A guarded read or write first checks a progress cell. A no-initializer `let` that top-level code
assigns checks a per-binding bit instead (`gInitBitIdx`, D14361). If the check fails, the
program calls `__init_fail__`, which prints "`n` read before its initializer ran (line 4),
via rn".

Some globals are never guarded, because their value exists from instantiation:

- a literal `const` (DECISIONS.md, the exact-constant ruling: "a literal `const` has no dead
  zone");
- a folded constant expression (`const n = 3 + 4`);
- an `extern let`.

Two rules are already compile errors. A direct top-level read before the declaration is a check
error ("`b` is used before it is assigned"). So is a direct top-level write ("`g` is written
before its declaration", `moduleBeforeDecl`).

### 1.2 The runtime guard (locals)

Local scope is sequential, so a later local is not in scope earlier: `const a = b + 1` above
`const b = 2` inside a function is "undeclared identifier 'b'". Nested `function` declarations
are not hoisted either: a call above the declaration is undeclared, and two nested functions
cannot call each other. So a local can be read before its value only through a **closure that
captures a `let` with no initializer**. Since D16023 such a `let` is a `T | null` cell, and a
read through the closure is `cell ?? __trap__("`x` read before it is assigned")` (`cboxUnsetRead`,
`compiler/emit_rewrite.vl`). That guard applies to every captured no-initializer `let`, with no
reachability test at all.

### 1.3 Modules and exports

- Modules merge in dependency-first order, and an import cycle is a parse error (DECISIONS.md H0
  sub-question (b); `docs/internals/open-rulings.md`, `modules-cross-module-init-order`). Every
  dependency's top level has therefore finished before an importer's top level starts. A
  dependency cannot name its importer's functions, so it cannot read an importer's global early.
  **Cross-module init order needs no analysis of its own.** The whole-program call graph covers
  callbacks the importer passes into a dependency, because those run in the importer's time.
- Host-callable wasm exports come only from the entry module (DECISIONS.md "Host-callable wasm
  exports"). The top level runs as the wasm **start function** (section 8, `emit_sections.vl`),
  so it runs inside instantiation. A JS host gets no instance until the start function returns,
  so it cannot call an export during init. Wasmtime's `Caller::get_export` can, from inside an
  import the start function calls. That is the one host re-entry path (§5 Q4).

### 1.4 The effect summary

`compiler/check_effect_rows.vl` already computes a bottom-up per-instance summary over the
resolved call graph, with Tarjan SCCs (function-effects-design.md §C1). For each function it
records:

- the first write, allocation, host call and unknown call it reaches;
- the first module `let` it reads (`readLet`).

The reordering rule's "effect-free" test reads these columns. The init check needs one more
column: the **whole set** of module globals reached, `let` and computed `const` alike, as reads
and as writes. Today's columns keep only the first.

## 2. The static analysis

### 2.1 Definitions

- **Init point** of a global `g`:
  - with an initializer: the end of its declaration statement;
  - with no initializer: each point where the top-level definite-assignment walk finds it
    assigned on the current path;
  - a literal `const`, a folded constant or an `extern let`: the start of the program (always
    initialized).
- **Touch set** `T(f)` of a function `f`: the module globals `f`'s body reads or writes,
  including a read that feeds a mutation (`g.x = 5`, `g.push(5)`). It is joined over everything
  `f` can call, computed bottom-up over resolved callees with SCCs, like the effect summary.
  "Can call" includes:
  - direct calls;
  - user operators (`a + b` resolving to `function "+"`);
  - getters (`v.r`) and method calls (`p.show()`);
  - a function value created in `f`'s body that escapes (§2.2).
- **Run points**: each place top-level code can start running a function body.
  - a call to a resolved function `f`: it needs `T(f)`;
  - the escape of a function value `v` (a named function used as a value, or a lambda): it needs
    `T(v)` at the escape point, unless every use of `v` is a direct call through a `const`
    binding, in which case each such call is the run point;
  - a global's initializer: its own calls, as above;
  - an `extern` call: it needs the touch set of every entry-module export (§5 Q4);
  - the end of the top level: it needs the touch set of every entry-module export (§5 Q3).

**The rule.** At every run point, every global in the needed set has passed an init point on
every path that reaches it. Otherwise the program is rejected, unless a reorder (§3) fixes it.

Initialization is monotone along an execution: a global once initialized stays initialized. So
checking a function value where it escapes is sound for every later call of that value. Checking
a run point inside a loop at the loop's first iteration is sound for every iteration.

### 2.2 Function values

A function value can be called wherever it flows. The rule checks it where it **escapes**, which
is the earliest point it can run. Escaping includes:

- being passed as an argument;
- being stored in a binding that is not only called directly;
- being stored in a container, record field or global;
- being returned.

The precision exception is a lambda or function alias bound to a `const` and used only in direct
calls. That binding acts like a named function, so its calls are its run points. That case is
`tests/cases/closures/module-binding-of-hole-fn-called-in-earlier-function.vl`: a `const lam`
created before `q` and called after it.

The flow analysis already exists (`fn-value-flow-design.md`, the finite function-set tag work),
and it could narrow an escape to the calls a set reaches. That is not proposed for acceptance.
function-effects-design.md §I's principle applies: "inference that decides ACCEPTANCE must be
local and stable". So the precision line for function values stays at escape plus direct calls
by name.

### 2.3 Precision: what today's scan over-approximates, by ablation

The runtime scan may over-approximate, because a guard that never fires costs only a load. A
compile error may not, because every over-approximation becomes a rejected program. The runtime
guard fires in 10 corpus programs that run correctly. Ablation programs show four causes:

| cause | witness (ablation) | corpus programs | fixed by |
| --- | --- | --- | --- |
| A member name reaches a free function of the same name | `print(lo.k)` before `const u = [3]`, with `function k() { print(u[0]) }`: guarded. Renaming the field to `kk`: not guarded | 2 (`opt-call-computed-receiver-in-assignment.vl`: `.get` reaches `function get`; `union-field-literal-row-positions.vl`: `.k` reaches `function k`) | resolved callees |
| A lambda's body counts as run at creation | `const lam = () => { print(q) }` above `const q = id(3)`, with `lam()` after: guarded, prints `3` | 1 (`module-binding-of-hole-fn-called-in-earlier-function.vl`) | §2.2 const-binding calls |
| The assigning statement counts as a read of its own target | `let n: i32` / `n = 1` / `function readN() { return n }` / `print(readN())`: guarded. The walk mentions the left-hand `Ident` with bit 1 as well as bit 2 | 1 (`uninit-let-module-cell.vl`) | the assignment target is not a read |
| Granularity is the statement, not the path | D14361's witness: a call after the write inside the assigning `if` | 1 (`read-after-assign-inside-statement.vl`) | checking at the run point inside the definite-assignment walk |
| A call on a branch the run never takes | `maybe(false)`, where `maybe` calls readers only when its argument is `true`; `let gc = fc(false)`, where `fc`'s other arm writes `gc` | 5 (`read-after-assign-unaffected.vl`, `inferred-map-return-if-arm-tail-caller.vl`, `tail-if-arm-cells-cycle{,-generic,-local}.vl`) | nothing static: these are the rule's real price |

The analysis does not evaluate conditions. That matches the checker's definite assignment today:
`let n: i32` / `if true { n = 1 }` / `print(n)` is already "used before it is assigned". §5 Q5
asks whether literal conditions should be folded.

### 2.4 Soundness of the call graph

The touch set must include every way a body can run. I probed the implicit calls. In each, a
call above a computed global's declaration traps today with the right name, so the runtime scan
sees all of them:

- a user `"+"` reading a computed `const`;
- a getter reading a computed list `const`;
- a getter reading a computed scalar `const`;
- a `self`-method called with dot syntax.

The checker version must see them before the pre-emit rewrite turns them into `Call`s. That is,
it must read the checker's resolution of each operator site, getter read and member call, never
the source spelling. Default arguments are substituted at the call site, so they belong to the
caller's run point. That is the rule `igWalk` already follows.

### 2.5 Locals

The local form of the rule applies to captured `let`s with no initializer, the only local that
can be read before its value (§1.2). A closure or nested function that reads such a binding is
checked like a module function:

- **Run points:** its direct calls by name, and its escape.
- **Requirement:** the binding is definitely assigned at each run point.

`tests/cases/variables/definite-assign-nested-fn-capture-ok.vl` (declared before the write,
called after it) is accepted. So is `capture-param-and-no-init-writes.vl` (created after the
write). D16023's witness, `const g = () => u` / `print(g())` / `u = 7`, is rejected at the
call. Swift's simpler rule is §5 Q6.

### 2.6 What the error says

Each rejection names three places: the global and its init point, the run point, and the chain of
calls from the run point to the read. Where a reorder was tried and refused, it also says why:

```
error: `n` may be read before its initializer runs
  --> a.vl:3:7   print(rn()) calls `rn`
  --> a.vl:2:30  `rn` reads `n`
  --> a.vl:4:7   `n` is initialized here
  note: the initializer cannot run earlier, because `four` prints (a.vl:1:28)
```

A cycle is reported once, at its first declaration in source order: "initialization cycle: `a`
needs `b` (via `f`), and `b` needs `a` (via `g`)". A write or mutation before the declaration
keeps D2654's verb: "`g` may be written before its initializer runs".

## 3. The reordering rule

### 3.1 What moves

Only a **module-level declaration that has an initializer** moves: the evaluation of its
initializer together with the store into its cell. Top-level statements never move: expression
statements, assignments, `if`, `match` and loops. A no-initializer `let` has nothing to move.
Moves stay inside one module's top level, since cross-module order is already right (§1.3).

### 3.2 When a declaration moves

A declaration `g` moves only when the rule would otherwise reject the program at a run point `p`
needing `g`. It moves to just before the top-level statement that contains `p`. All of these must
hold:

1. **The initializer is effect-free**, by the summary: no write to state it did not create, no
   host call (so no `print`), and no call of unknown effect (no call through a function value).
   Allocation is allowed, because a fresh object has no observable creation time. Traps and
   unbounded loops are §5 Q8.
2. **Its dependencies are available there.** Every global the initializer touches is initialized
   at the new position, after its own dependencies have moved by this same rule. A module `let`
   it reads must not be written by any statement between the new position and the old one.
3. **Nothing between the new position and the old one writes or mutates `g`.** Such a write is
   an error in source order anyway (D2654), and moving the initializer above it would change
   which value the program prints (§5 Q9).
4. **No cycle.** If `g`'s initializer needs `g`, through any chain, that is a cycle error.

Moved declarations run in dependency order, with ties in source order. A program the rule accepts
in source order is never reordered (§5 Q7). That is what keeps behaviour preserved: every program
the rule accepts in source order runs exactly as today.

### 3.3 Examples

```vl
function four(): i32 { return 4 }
function rd(): i32 { return n }
const k = rd()        // run point: needs `n`
const n = four()      // effect-free: moves above `const k`
print(k)              // 4
```

Today this traps: "`n` read before its initializer ran (line 4), via rd".

```vl
function four(): i32 { print("four"); return 4 }
function ra(): i32 { return a }
print("start")
print(ra())
const a = four()      // prints: never moves. Compile error, with the note naming `four`
```

```vl
function setN() { n = 99 }
setN()
let n = 3 + 4         // a write before the declaration: stays an error (rule 3)
print(n)
```

### 3.4 Locals

A later local is out of scope (§1.2), so nothing exists to reorder until scope changes. The only
local read-before-value is the captured no-initializer `let`, and §2.5 handles it with no
reorder. §5 Q11 asks whether the ruling's "for locals" meant something more.

## 4. Measurement

**Method.** I built every corpus program with `vl build --names` from master `26f7a8fbb`'s
self-compiled seed. A program counts as guarded when its name section holds the
`__init_fail__` helper function. The helper is emitted only when some global is guarded. For the
compiler, which carries the helper's name as a string literal, I read the disassembly's function
list instead. A program counts for locals when its code holds the `i32.const` byte run of
"`` ` read before it is assigned ``". I ran every program found, and ablated each runs-today
program to its cause (§2.3).

The corpus is `tests/cases/**/*.vl` (8,241 files) plus the distilled `cells/` and `named/`
(12,172 files): 20,413 files in all. 15,787 build. The rest are check-error fixtures, imported
modules, and files `vl build` does not accept on their own.

**Module globals:**

| population | count |
| --- | --- |
| programs with a guarded global | **31** of 15,787 (all in `tests/cases`; 0 in the distilled corpus) |
| of those, trap today (`@trap` fixtures: D2652–D2654, D14360, `mutate-folded-*`) | 21 |
| of those, run today: newly rejected at today's precision | 10 |
| newly rejected with §2.3's precision fixes | **5**, all a call on a branch the run never takes |
| trapping programs reordering rescues (effect-free initializer, read-only, no cycle) | 6 (`read-before-init-{scalar,string,nullable,in-loop,via-closure,from-initializer}-traps.vl`) |
| trapping programs that become check errors | 15: 10 writes or mutations before the declaration, 5 no-initializer `let`s read before assignment |
| std modules with a guarded global | **0** of 18. Each module was built once from a one-line importer, and the 779 corpus programs that import std were built too |
| compiler (`compiler/entry.vl`) | **0** guarded globals. There is no `__init_fail__` among the seed's 18,427 functions |

Only reordering could have rescued the 5 newly rejected programs, and it rescues none of them:

- `read-after-assign-unaffected.vl` reads no-initializer `let`s.
- In the other four, the initializer itself reaches a write of its own global, which is a cycle.

The four `maps/` fixtures exercise a return-type inference cycle and keep the dead self-write on
purpose. Phase 2 would re-spell them so the dead call stays and the global is not written before
its initializer, or mark them as check errors and keep the inference witness separately.

**Locals:**

| population | count |
| --- | --- |
| programs where a captured no-initializer `let` carries the trap | 11 |
| of those, trap today (`shared-let-read-early-traps-*`, D16023) | 9 |
| of those, run today | 2. Both are accepted under §2.5. Swift's rule (§5 Q6 (a)) rejects 1, `definite-assign-nested-fn-capture-ok.vl` |

**How the measurement relates to the proposed rule.** The touch set and run points of §2.1
reach no more than `initGuardScan` does: resolved callees are a subset of callees found by name,
and an escape point is never earlier than a mention. The two new requirements are the export
end-point and the extern re-entry point:

- The export end-point adds nothing in the corpus. It matters only for a no-initializer `let`
  that no top-level statement assigns, and today's guard already covers that case (D14360's
  "never").
- The extern re-entry point adds nothing either. None of the 17 corpus programs that declare an
  extern also exports a function that reads a computed global.

So the counts above bound the strict rule from above. The precision-fixed figure of 5 is a hand
classification by ablation, not a run of the new analysis.

## 5. Choices for the owner

Each question is language-visible. The recommendation is the lane's, and nothing is decided.

**Q1. Is a possibly-uninitialized read an error or a warning?** "Possibly" means not provably safe
and not provably reached either.

```vl
function rd(): i32 { return n }
function maybe(b: boolean) { if b { print(rd()) } }
maybe(false)              // the read never runs, but the call is written
let n: i32
n = 1
```

- (a) Always an error. That is the ruling's goal as written.
- (b) An error when the read is certainly reached. When it is only possibly reached, a warning,
  and the runtime guard stays for that global.
- (c) Always a warning, keeping the runtime guard.

*Recommendation: (a).* It costs 5 corpus programs, all fixtures that keep a dead call on purpose.
The runtime guard is deleted once (a) lands, except under Q4 (b). (b) makes acceptance depend on
whether the compiler could prove the read reachable, which is a precision fact, not a property a
reader can see.

**Q2. Does a write inside a called function count as initializing a no-initializer module
`let`?**

```vl
let n: i32
function fill() { n = 5 }
fill()
function rd() { return n }
print(rd())    // today: traps "read before its initializer ran"
print(n)       // today: check error "used before it is assigned"
```

- (a) No. A no-initializer `let` counts as assigned only where top-level code assigns it, as the
  checker already rules for the direct read.
- (b) Yes. A function that assigns the binding on every path counts as an assignment at each of
  its calls, through an interprocedural "must-write" summary. That makes both reads above
  accepted.
- (c) Keep the runtime bit for this case only.

*Recommendation: (a).* The direct spelling and the function-hop spelling then agree, and the fix
is `const n = fill()`. It costs 1 corpus program, which traps today. (b) changes a ruling that is
already in force (a top-level `print(n)` after `fill()` is refused today) and makes acceptance depend on another
function's body.

**Q3. Must a global that an entry-module export touches be initialized when the start function
ends?** This matters only for a no-initializer `let` that only functions assign: a host-driven
`init()` protocol.

```vl
let state: Config
export function init(c: i32) { state = { c: c } }
export function step(): i32 { return state.c }
```

- (a) Yes, a compile error. Write `let state: Config | null = null` and handle `null` in `step`.
- (b) No. An export keeps a runtime check for such a binding, and the host owns the protocol.

*Recommendation: (a).* It follows from Q2 (a), and it makes the protocol visible in the type.
No corpus program has this shape.

**Q4. What happens when the host calls an export while the top level is still running?** That is
an extern called from top-level code that calls back into an export, which Wasmtime allows.

```vl
extern function hostHook(): void      // host calls `get` back from here
export function get(): i32 { return n }
hostHook()
const n = 3 + four()
function four(): i32 { return 4 }
```

- (a) Every extern call in top-level code counts as a call to every entry-module export. This is
  static and sound, and reordering can still rescue `n`.
- (b) Re-entry during init is outside the language. Each export keeps a one-load check that traps
  "called during initialization".
- (c) Ignore it. This is unsound on Wasmtime.

*Recommendation: (a).* No corpus program is affected (§4). (b) is the fallback if (a) proves too
coarse for real host bindings.

**Q5. Does the analysis fold literal conditions?**

```vl
const DEBUG = false
function rd(): i32 { return n }
if DEBUG { print(rd()) }      // today: guarded, runs, prints nothing
const n = 3 + four()
function four(): i32 { return 4 }
```

- (a) No. Every call written in top-level code counts.
- (b) Fold `true` and `false`, and literal `const`s that are those (the exact-constant ruling
  already makes them literals at each read).

*Recommendation: (a).* That is what definite assignment does today
(`let n: i32; if true { n = 1 }; print(n)` is refused). Folding here would make two flow
analyses answer one question differently. In this example, reordering already rescues `n`.

**Q6. When is a closure that captures a no-initializer local legal?**

```vl
function outer(): i32 {
  let x: i32
  function inner(): i32 { return x }    // declared before the write
  x = 4
  return inner()                        // called after it
}
```

- (a) Swift's rule. Capturing the binding before it is definitely assigned is an error, wherever
  the closure is called. This rejects `outer`.
- (b) Check at run points (§2.5). Direct calls by name are checked where they happen. An escape
  is checked at the escape. This accepts `outer`.
- (c) Keep the runtime trap.

*Recommendation: (b).* It is the same rule as module globals, it is local to one function body,
and it keeps `definite-assign-nested-fn-capture-ok.vl`, which the corpus pins as sound.
(a) is simpler and costs 1 corpus program.

**Q7. Does reordering only rescue, or always use dependency order?**

```vl
function two(): i32 { return 2 }
const a = 1
const b = two()     // no one reads `b` early: (a) leaves it here; (b) is free to move it
```

- (a) Rescue only. A program valid in source order runs in source order. An initializer moves
  only when the source order is rejected, and only as far as needed.
- (b) Like Go: every effect-free initializer runs in dependency order, whatever the source order.

*Recommendation: (a).* No valid program changes behaviour, and a reader's source order stays the
run order except where it would have been an error. (b) and (a) differ only in when a trap or a
hang happens, which is Q8.

**Q8. May a moved initializer that can trap, or loop without bound, move above a statement with
effects?**

```vl
function rd(): i32 { return table[0] }
print("loading")
print(rd())
const table = build()   // effect-free, but may trap (index, `as!`, division)
```

- (a) Yes. This is D1510's rule that a trap is not an effect. If `build` traps, the program traps
  before "loading" is printed.
- (b) No. Only an initializer whose summary is trap-free and bounded may move above an effect.
  Otherwise the program is a compile error that names why.

*Recommendation: (a).* The source-order program is rejected under Q1 (a), so no prior behaviour
exists to preserve, and D1510 already ruled this question for evaluation order. (b) rejects any moved
initializer that indexes, divides or casts with `as!`.

**Q9. May reordering rescue a write or mutation before the declaration?**

```vl
function w() { g.push(5) }
w()
const g = [1, 2]
print(g.length)     // source order says 2; moving the initializer up would print 3
```

- (a) No. A write or mutation before the declaration stays a compile error, which is D2654's
  ruling moved to compile time.
- (b) Yes. Move the declaration above the first write.

*Recommendation: (a).* (b) makes the printed value differ from what the declaration says at the
point it is written. That ambiguity is the reason the write was ruled an error. It covers 10
corpus fixtures, all of which trap today.

**Q10. Does the compiler say when it moved an initializer?**

- (a) Silent. Editor hover on the declaration shows where it runs.
- (b) An info-severity hint at the declaration: "initialized before line 3, where `rd` first
  reads it".
- (c) Require a written marker on a declaration that may move.

*Recommendation: (a).* A move only ever turns an error into the program the author evidently
meant (Q7 (a)), and (b) would add a `@hint` line to every fixture that relies on a move.

**Q11. Does the ruling's "for locals" ask for local declarations that are visible block-wide?**
Today, local scope is sequential:

```vl
function m() {
  function a(n: i32): i32 { return if n <= 0 { 0 } else { b(n - 1) } }  // undeclared 'b'
  function b(n: i32): i32 { return a(n - 1) }
  print(a(3))
}
```

- (a) No. The local half of the ruling is Q6. Local scope stays sequential, so no local
  reordering is needed.
- (b) Yes. Nested functions, or all local declarations, become visible throughout their block.
  The §2 rule and the §3 reorder then apply to locals as they do to globals.

*Recommendation: (a) for this item.* Block-wide local scope is a scope change with its own
questions, such as whether shadowing an outer name becomes ambiguous. It deserves a ruling of its
own.

## 6. Phase 2 order, after the rulings

1. **The touch-set column.** Add every module global touched, not only the first, to the effect
   summary rows. The rows already exist per instance.
2. **The check, behind no flag**, run inside the top-level definite-assignment walk. Its
   rejection set must equal `initGuardScan`'s guarded set minus §2.3's artifacts. Grade it on the
   §4 population: 31 global programs and 11 local programs, each with a stated outcome.
3. **The reorder**, as a rewrite of the start function's statement order. A program's bytes move
   only when a reorder fires. Check that with a byte-identity diff over the 15,787 programs that
   build.
4. **Delete the runtime guards** once the check covers their population: `initGuardScan`'s
   emission half, `__init_fail__`, the progress cell and bit, and `cboxUnsetRead`'s trap. Under
   Q1 (a), D14361's mechanism goes with them.

The `@trap` fixtures in §4 become `@error` fixtures, or `@run` fixtures where a reorder rescues
them. The 5 value-dependent fixtures are re-spelled.
