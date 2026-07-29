# Free index operators — `function "[]"` / `function "[]="` (ROADMAP B14)

`x[i]` and `x[i] = v` on a user type, dispatched to a free function whose NAME is the operator:

```vl
function "[]"(self: F32View, i: i32): f32  { return getF32(self, i) }
function "[]="(self: F32View, i: i32, v: f32) { setF32(self, i, v) }

const y = x[i]
x[i] = v
```

This is the route `buffer-design.md` §L5 measured four candidates for and filed as "route 2, taken
generally, as B14". It closes webcraft **P1.1**'s bracket and is the mechanism **P1.2**'s
`stack[i].tt` will ride.

---

## 1. What it is, in one sentence

**The sugar is purely syntactic and the dispatch is nominal-free.** `x[i]` lowers to exactly the
call `"[]"(x, i)` lowers to — the emitter's pre-emit rewrite turns the bracket into a `Call` before
lowering, so no lowering, no representation and no emitter arm knows the bracket existed. What is
new is only *which* function the bracket names, and that answer comes from the receiver's **type**.

---

## 2. The five rulings, with the alternatives that lost

### R1. Spelling — a quoted string, not a token

`function "[]"(self: T, i: I)`. Two alternatives were live:

- **An operator TOKEN** (`function [](self, i)`). Refuted by the lexer: `[` and `]` open an index
  expression in every other position, so a bracket in name position is a genuine ambiguity, and
  `[]=` has no token sequence at all that is not also a legal expression prefix.
- **A magic method name** (`function index(self, i)`). Refuted because it collides with an ordinary
  identifier: any program with a function called `index` would acquire bracket dispatch.

The quoted form is also the spelling the B13 closure-FIELD trap already uses (`{ "[]": … }`), so the
two routes to the same operator now read the same.

**Widened deliberately:** the quoted form accepts *every* operator name, not just the brackets, so
`function "+"(self, b)` and `function +(self, b)` name the same function. This costs one predicate
and removes the "some operators are quoted and some are not" seam.

**A correction to §L5.** It reported that `function "[]"(self: V, i: i32)` does not parse *and
therefore* that `emit_rewrite.vl`'s `drwSelfFnOf(n.binOp, 2)` operator arm "is unreachable dead code
today: no function can be *named* an operator". The premise is right and the conclusion is wrong —
`isOpFuncName` has always accepted the operator SYMBOL tokens, so `function +(self: V, b: V)` parses,
runs, and is pinned by `tests/cases/objects/operator-self-method.vl`. Only the BRACKET operators
lacked a spelling. The arm was live the whole time.

### R2. Overloading — by receiver, because one per program is not enough

`std:buffer` has two view types in ONE module and both need `"[]"`. A second top-level `function` of
the same name is a redeclaration error (B16), and every name-keyed table in the compiler
(`fnDeclIx`, `lookup`, `fnIndexOf`) holds one entry per name — so several `"[]"` cannot share a name.

**The ruling: the parser mints a declaration name that carries the receiver** —
`"[]"` on `F32View` declares `[]@F32View`. `@` cannot occur in an identifier, so the encoding is
total in both directions: no ordinary name is ever read as an operator's, and a genuine duplicate
(same operator, same receiver spelling) collides on the minted name and is caught by the ordinary
redeclaration rule, which is exactly right.

Alternatives:

- **One `"[]"` per program.** Would have forced `std:buffer` into two modules to ship P1.1 — a
  library layout decided by a compiler limitation.
- **Relax the redeclaration rule for operator names and key the tables by (name, receiver).** A far
  larger change: every name-keyed table would grow a second key, and the overload set would have to
  be resolved at each of the ~15 sites that consult one.
- **An ordinal uniquifier** (`[]#0`, `[]#1`). Same mechanism, worse diagnostics, and not stable under
  a source edit that reorders declarations.

The name is a UNIQUIFIER only — **dispatch is by type, never by the spelling in the name.**

### R3. Dispatch — receiver `assignable` to the `self` parameter

The checker keeps a registry of every operator declaration and resolves a bracket by scanning it for
the first candidate whose `self` parameter ACCEPTS the receiver — the same `assignable` test UFCS
resolution uses (`ufcsCallTy`). Consequences:

- a structurally-typed receiver resolves (an inline `{base: i32}` finds `"[]"(self: V, …)` when the
  shapes match), so the operator is not annotation-gated at the USE site;
- **two nominal newtypes dispatch apart** — `F32View` and `I32View` have the identical structure and
  only the brand differs, and `assignable` is where the brand rule lives. This is the whole reason
  P1.1 needed P1.5 first (§L2), and it is now load-bearing rather than incidental;
- first-declared wins on a genuine ambiguity, which requires two receivers that both accept one
  value — impossible between brands, possible between two structural types where one is assignable
  to the other. Stated, not diagnosed.

The `self` parameter's **annotation is required** (a parse error otherwise). An un-annotated `self`
is an inference hole that accepts every receiver — an unpredictable catch-all, and an un-mintable
name.

### R4. Merge-mangling — the registry is built from the MERGED program, so there is nothing to alias

§L5 called this out as the reason the route is "a language feature to design, not a views feature to
bolt on", and it is the axis that decides the whole design. **Measured on master:**

```
lib.vl:   export function +(self: V, b: V): V { return { a: self.a + b.a } }
entry.vl: import { V } from "./lib";  x + y
          → type error: operator '+' is not defined for {a: i32} and {a: i32}
```

The existing `+` route consults `lookup(op)` with the RAW name, so a merge-mangled `+$m1` is invisible
to it. The UFCS route survives the merge only because `ufcsAliasOf` laundries a plain member property
to the mangled function.

**Index operators need no such alias, and the reason is structural: a bracket names nothing.** A UFCS
call site carries a property STRING that the merge deliberately leaves plain (so a field of the same
name keeps precedence), which is what creates the plain→mangled gap. A bracket carries no name at
all, so there is nothing to launder — the registry is populated by the checker's top-level hoist,
which runs on the already-merged program, and therefore holds `[]@F32View$m1` from the start.
`tests/cases/modules/index-operator-import/` pins it, including a local and an imported operator
coexisting.

**Not fixed here, and filed:** the cross-module `+` defect above is real, pre-dates this work, and
the registry mechanism would fix it in a handful of lines. It is left alone deliberately — routing
`a op b` through the registry changes the resolution of a construct that ships today, which is a
separate change with its own swallow to measure.

### R5. Checker resolves, emitter reads — one decision, banked

The checker BANKS the resolved function name on the site node (the `Index` for a read, the assignment
`BinExpr` for a write) and the emitter's rewrite reads it back. The alternative — both sides
re-deriving the choice — has the emitter re-implementing `assignable` over a registry it would have
to rebuild, with a silent miscompile whenever the two disagreed. The bank follows the `isVarTyIx`
precedent (the checker resolves an `is` test's type, the emitter consumes the answer).

The bank is a SPARSE pair of arrays, not a table sized to the node arena: a program that declares no
index operator banks nothing and allocates nothing, which is this feature's inertness statement.

---

## 3. Compound assignment, and what it inherits

`x[i] += v` desugars in the PARSER to `x[i] = x[i] + v` sharing one target node, so the receiver and
the index are evaluated TWICE. §L5 filed this as "one consequence to design in". **Measured: it is
already the language's behaviour for a native array** —

```vl
a[idx()] += 10   // idx() runs twice; k == 2
```

so the operator route inherits an existing rule rather than introducing one. It works, it is pinned,
and it is documented rather than fixed: fixing it means introducing a temporary for the target across
every indexed compound assignment, which is a change to array codegen, not to this feature.

The two halves resolve independently and are banked on different nodes — the READ on the shared
`Index`, the WRITE on the assignment `BinExpr` — which is what lets the same target node serve both.

---

## 4. What is deliberately NOT touched: the swallow

**Built-in indexing is untouched.** A receiver that is an array, a map, a string, an unpinned
inference hole, or the error type reaches the built-in arms exactly as it does with no operator
declared anywhere — the operator arm sits behind `tyBuiltinIndexable`, and behind an inertness gate
that is false for any program with no operator declaration.

A newtype over a built-in indexable is deliberately INCLUDED in the built-ins (a `new i32[]` still
indexes as an array): a brand renames a type, it does not re-open a primitive's syntax.

Measured (`abcorpus3` six-channel differential, master seed vs this one, both resolving `std:` to the
same sources): **1,638 files, all six fields identical, zero rows differing.** The inverted control
on the same instrument — the same two compilers with the NEW `std/` — moves 22–23 rows, so the zero
is a real zero and not a dead instrument.

---

## 5. `std:buffer`, and the one call the bracket costs

Each of the four operators is a one-line forward to the accessor of the same name:

```vl
export function "[]"(self: F32View, i: i32): f32 { return getF32(self, i) }
```

**Measured**, `x[i]` against `getF32(x, i)` over the same loop: the two modules are the same size and
differ in exactly TWO bytes, both the immediate of a `call` — the bracket calls the wrapper, the
accessor spelling calls the accessor. So the bracket costs ONE extra direct call at `-O0`, and §O1's
measurement is what removes it (`-O3 --closed-world` inlines these wrappers; `-O` alone does not).

The alternative — giving the operators the full body and letting the accessors forward, or
duplicating the four-line bounds policy into both — was rejected: §L3's bounds policy is stated once
on purpose, and forwarding the NEW spelling to the OLD one cannot regress anything that already
ships.

---

## 6. Where each piece lives

| Piece | File |
| --- | --- |
| Declaration-name encoding (`opDeclName` / `opDeclOpOf` / `opDeclLabel`) | `compiler/ast.vl` |
| Quoted-name grammar + the receiver-carrying mint | `compiler/parser.vl` |
| Registry, `assignable` dispatch, the site bank, the diagnostics | `compiler/typecheck.vl` |
| Bracket → direct call | `compiler/emit_rewrite.vl` |
| Reprinting the SOURCE spelling | `compiler/format.vl` |
| Unused-function exemption | `compiler/lint.vl` |
| The four view operators | `std/buffer.vl` |

**The minted name never reaches a user.** Every diagnostic that would print it routes through
`opDeclLabel`, which renders `[]@F32View` as `"[]" for F32View`; the formatter reprints
`function "[]"` and recovers the receiver half from the `self` annotation it prints anyway.

---

## 7. What the corpus pins

- `tests/cases/index/operator-read-write.vl` — the read and the write, on a plain struct.
- `tests/cases/index/operator-overload-by-receiver.vl` — two receivers with the IDENTICAL structure
  told apart by brand alone; binding / argument / condition / arithmetic contexts; the compound form;
  and `g[i][j]`, which composes because the outer receiver is the inner operator's return type.
- `tests/cases/index/operator-builtin-unaffected.vl` — the swallow, as a fixture: array, string, map
  and nested-array indexing in a program that DOES declare operators, with the same program's user
  receiver dispatching as the inverted half.
- `tests/cases/index/operator-{unannotated-self,quoted-name-not-an-operator,arity,write-without-read,wrong-key-type}.vl`
  — the five rejects, each naming the rule it enforces.
- `tests/cases/modules/index-operator-import/` — the merge axis: operators declared in a module, used
  in an entry that imports none of them by name, alongside an operator the entry declares itself.
- `tests/cases/std/buffer-view-bracket.vl` — P1.1's acceptance: `x[i]` / `x[i] = v` over both views,
  mixed with the accessor spelling, in a loop.

## 8. Known gaps, filed rather than fixed

1. **Cross-module `a op b`** (§R4) — a pre-existing defect for the arithmetic/comparison operators;
   the registry would fix it, and doing so is a separate change with its own swallow.
2. **A write-only receiver** (`"[]="` with no `"[]"`) is rejected rather than supported. The
   assignment form checks its target as an ordinary index expression, so supporting it means teaching
   the checker that an `Index` in target position may be write-only. The diagnostic names the missing
   half, so the rejection is not confusing.
3. **The LSP symbol/completion list** shows minted names. `opDeclLabel` exists for exactly this and is
   not yet threaded there.
4. **The two §L7 closure-field defects** were re-measured against this change (both routes are
   independent and neither touches the other). Defect 1 — an f32-returning `"[]"` closure field
   emitting an invalid module — reproduced UNCHANGED here and is **now fixed**: the f32 expression
   classifier lacked the field-closure `Call` arm its f64/i64 twins carry, and the trap's minted
   call node has no checker-recorded type to fall back on. The free route was never affected —
   its rewrite mints an IDENT callee, which the arm the classifier *did* have resolves. Defect 2
   — a `"[]="` closure whose body is a memory store "storing nothing" — **does not reproduce on
   master**: the filed program prints `11`, the value it wrote. Whatever it described is either
   fixed or was mis-measured; the entry is stale. A third, still live: `v[0] += 3` on a
   closure-field trap TRAPS (`cast failure`) — the free-function route handles the same spelling
   correctly.
