# Variadics and spread — one rule, and spread falls out of it

> Status: **BUILT** (this PR). Owner ruling 2026-09-06 night, `docs/internals/open-rulings.md`
> §"variadics-then-spread": option **(A)** — variadics land as ONE rule and spread falls out.
> ROADMAP row 21 (H4.6 / B6).

A **rest parameter** packs a call's trailing arguments into a list. A **call-site spread**
unpacks a list into a rest parameter. `[...a, ...b]` in a list literal is the same operator, and
`push` becomes variadic so `xs.push(...ys)` needs no special case. This file is the design: the
grammar, the checker's rules and its refusal sentences, the lowering, and the four interactions
the ruling did not settle (function types, UFCS, defaults, `readonly`).

Every premise below was RUN on the merge-base seed before it was written, not read off a doc.

---

## 0. What the tree looked like before

Four probes on `180d67365`, verbatim output:

| program | outcome |
| --- | --- |
| `xs.push(...ys)` | `parse error … expected an expression but found DOT` |
| `xs.push(4, 5)` | `type error … push expects 1 argument, got 2` |
| `function f(a: i32, ...xs: i32[])` | `parse error … expected an identifier but found `.`` |
| `const c: i32[] = [...a, ...b, 4]` | `parse error … expected an expression but found DOT` |

So: no `...` token (it lexes as three `DOT`s), no variadic function, `push` is arity-1, and no
list-literal spread. Nothing in the tree uses `...`, which is why the byte-identity control over
`tests/cases` is meaningful.

---

## 1. Grammar

```
param      := IDENT "?"? (":" type)? ("=" expr)?        // unchanged
            | "..." IDENT ":" type                      // NEW — the rest parameter
argument   := (IDENT ":")? expr                         // unchanged
            | "..." expr                                // NEW — a call-site spread
element    := expr                                      // unchanged
            | "..." expr                                // NEW — a list-literal spread
```

`...` is a **new three-character token, `ELLIPSIS`**, taken by maximal munch ahead of `DOT`.
`1...5` still lexes `NUMBER("1")` then `ELLIPSIS`, because the number scanner takes a fraction
only when a digit follows the dot — so the token cannot change what any existing program means.

`...` is parsed in **exactly two places**: before a call argument (`parseOneArg`) and before a
list-literal element (`parseArrayLit`). Anywhere else it is a parse error naming the two places,
so `const x = ...ys` never reaches the checker as something it has to invent a rule for.

### Why a `Spread` NODE and not a parallel column

`Call` already carries a parallel per-argument column (`callArgNames`), and a second one
(`callArgSpread`) would have been the smaller diff. It was refused: `callArgs` is read in 14
files (169 sites in `wasmEmit.vl` alone), and every one of those sites would have gone on
compiling while silently dropping the marker. A `Spread` node makes the same paths fail LOUDLY —
and it puts the new form under `kind-ladder-incomplete`, which is the instrument that finds the
walkers. `Node` goes 37 → 38 members and `klNode` in `compiler/lint.vl` follows.

Reusing `Unary` with `unOp: "..."` was the third option and is rejected for the same reason plus
one more: a spread is not an operator on a value, and `binPrec`/`parsePrimary` would have
admitted it in every prefix position.

---

## 2. The checker

### 2.1 A rest parameter

* **At most one, and last.** Checked at the declaration, so the refusal names the declaration
  rather than a call site.
* **Its type is a list.** `...xs: i32[]` — inside the body `xs` is an ordinary, mutable `i32[]`.
  Not a `readonly` view: the packed list is FRESH at every call, so nothing the callee does to
  it is visible to the caller, and a view would only forbid writes that are already private.
  (`readonly` remains the right spelling for an ordinary parameter the callee must not write.)
* **No default and no `?`.** A rest parameter with no arguments is the empty list, which is what
  a default would have said; two spellings for one meaning is what `?` already costs elsewhere.
* **`self` may not be a rest parameter.** UFCS binds the receiver to the FIRST parameter and a
  rest is last, so `function f(...self: T[])` is a contradiction spelled two ways.

### 2.2 Arity

`fnRequiredArity` establishes `[required, params.length]` as the accepted range today. A rest
parameter makes the high end unbounded:

| declaration | accepted arity |
| --- | --- |
| `f(a: i32)` | exactly 1 |
| `f(a: i32, b: i32 = 0)` | 1 to 2 |
| `f(a: i32, ...xs: i32[])` | **1 or more** |
| `f(...xs: i32[])` | **0 or more** |

`arityWantText` gains the third rendering, `at least N`, so the message reads
`wrong number of arguments: expected at least 1, got 0`.

### 2.3 Arguments

Fixed parameters are checked exactly as today. Each TRAILING argument is checked against the
rest parameter's **element** type, and the diagnostic keeps its ordinal, so a bad third argument
reads `argument 3: expected i32, got string`.

A **spread argument** `...e` is checked differently: `e`'s type must be a list (or a `readonly`
view of one) whose element is assignable to the rest element type. It is not checked against the
element type itself — `f(...ys)` passes `ys`'s elements, not `ys`.

Mixing is allowed wherever it is unambiguous, which — because a rest is last and a list's length
is unknown — is everywhere: `f(1, 2, ...ys, 3)` packs everything after `a` into `xs`.

### 2.4 Generic binding

`bindGenWalk` is called off the same parameter slot in two different ways, and this is the one
subtlety in the whole checker change:

* a plain trailing argument binds the **element** hole: `bindGenWalk(elem(T[]), argTy, …)`;
* a spread argument binds the **array** hole: `bindGenWalk(T[], argTy, …)`, the existing
  `TyArray` arm.

**The element hole binds from the PACKED LIST, so it inherits the list literal's own join**,
which is the whole of the "packs into a list" promise: `[1, 2.5]` is `f64[]` and `[1, true]` is
`(i32 | boolean)[]`, so `f(1, 2.5)` and `f(1, true)` pin `T` to exactly those and run. This is
measured; an earlier draft of this section said the second argument was refused by first-use-wins,
which was read off `bindGenWalk` rather than run, and is false.

What a type parameter cannot be pinned to is a union that **boxes**. `(i32 | boolean)` rides the
i32 spine — both arms are i32-repped — and runs; `(i32 | string)` needs a box, and the instance
the monomorphizer mints for that pin builds a module that does not validate. So a boxed join is
refused at the pin, naming the concrete spelling that runs:

> ``a rest parameter's element is inferred from the arguments, and these join to `i32 | string` — a boxed union a type parameter cannot be pinned to. Spell the element out, `...xs: (i32 | string)[]`, or pass one element type``

The refusal is the CHECKER's on purpose. Left to the monomorphizer it is check-clean invalid
wasm (D1851's twin, `g([1, "x"])` into `g<T>(xs: T[])`, is a loud emit reject at the explicit
spelling — so the rest reached a pre-existing gap by a silent route).

### 2.5 The refusals, and the sentence each one prints

Every sentence names the fix, per the goal's clause 2 — none of these is a capability gap, they
are all the design's.

| what | sentence |
| --- | --- |
| spread into a fixed-arity function | ```...` unpacks a list into a rest parameter, and `f` has none — VL has no tuple type, so a list's length is not known at the call. Declare the last parameter `...xs: T[]`, or pass the elements one by one`` |
| a second rest parameter | ``a function has at most one rest parameter, and `xs` is already `f`'s`` |
| a rest that is not last | ``a rest parameter must be last — `...xs` is followed by `y``` |
| a rest with no list type | ``a rest parameter packs its arguments into a list — write `...xs: T[]``` |
| a rest with a default / `?` | ``a rest parameter is the empty list when no argument reaches it, so it cannot carry a default`` |
| `...self` | ```self` is the receiver and comes first, so it cannot be a rest parameter`` |
| spread of a non-list | ```...` spreads a list, and this is `string` — a string is not a list of characters in VL`` |
| a spread named argument (`f(xs: ...ys)`) | ``a spread fills the rest parameter by position, so it cannot be named`` |
| `...` anywhere else | parse error: ``` `...` may only appear before a call argument or a list element ``` |

---

## 3. The lowering

Three lowerings, and the first one is what makes the other two small.

### 3.1 Packing at the call — an AST rewrite in the CHECKER

The call's own argument list is rewritten, once, in place:

```
f(a, b, c)        with   f(x: i32, ...xs: i32[])      ->    f(a, [b, c])
f(a, ...ys)                                            ->    f(a, [...ys])
f(a)                                                   ->    f(a, [])
```

The synthesized argument is an ordinary `ArrayLit`, so **the entire existing call path serves
it**: this function's own index-parallel argument loop, `orderedDirectArgs`, the emitter's
380-line argument loop, `pendingListKind` seeding from the parameter's own rep, `monoBindCols`'
positional `tyCol`, and every list-literal arm in `emitArr`. Not one of those had to learn about
arity, and `bindGenWalk` binds a generic rest element through its existing `TyArray` arm.

**The checker and not `emit_rewrite.vl`**, which is where a pre-emit rewrite would otherwise
belong, for one reason: a node minted after checking carries no recorded type, and the emitter's
rep machinery reads exactly that. Minting it where the types are is what makes the packed list a
first-class list rather than a shape the emitter has to re-derive.

The rewrite is **idempotent by a mark** (`callRestPacked`, a side table on `nodeToks`' contract),
because after it a packed call's arity already equals its parameter count and nothing about the
argument list itself would distinguish it from an unpacked one. That matters: the checker runs
speculatively (`inferQuiet`, a demand-driven return inference re-entering a call), and a second
pack would wrap the packed list in another list.

**Allocation count: one fresh list per call that reaches a rest parameter**, including the
zero-argument case, whose `[]` is a two-instruction empty list. A caller that passes nothing pays
for an empty list; that is the price of the rest parameter being an ordinary list inside the
body, and it is the same price `[]` pays anywhere.

### 3.2 A list literal with spreads

The primitive. `[...a, 1, ...b]` cannot use `array.new_fixed`, whose length is a compile-time
constant. It lowers on `emitArrSlice`'s shape instead — allocate once, `array.copy` the runs:

```
L = { array.new_default <back> N0, len 0, cap N0 }      // N0 = the plain-element count
for each item, in source order:
    plain    ->  append one value          (grow if len == cap, then array.set)
    spread   ->  s = <source>              (one shared scratch local, reused)
                 need = L.len + s.len
                 if need > L.cap { grow L to need }      // one array.new_default + array.copy
                 array.copy L.backing L.len s.backing 0 s.len
                 L.len = need
```

Each source expression is evaluated **exactly once, in source order** — the eval-order contract
(D1510) — which is why the length is not summed in a first pass. A spread of an empty list copies
zero elements and is correct without a guard.

**A spread source must share the destination's element REP.** `array.copy` relates two arrays of
one wasm type; a `Circle[]` into a `Shape[]` destination is a different heap type and needs
D791's element-converting loop. See §5.

`u8[]` is the one rep with no element that spells it — the backing is `(array (mut i8))` where
every other i32-element list is `(array (mut i32))` — so every classifier that reads a literal's
elements has to ask `spreadDestKind` instead. The module-global cell ladder is where that was
missed (D1850); a mixed `[...bs, 9]` is still a loud refusal (D1852).

### 3.3 `push`

`push` becomes variadic — conceptually `push(self: T[], ...vs: T[])` — but it is a builtin, not
a declared function, so §3.1's rewrite does not reach it and it keeps its own lowering:

* **one plain argument** keeps today's element-wise sequence, byte for byte. This is what makes
  the variadic path free: it is only reached by a spelling that did not compile before.
* **anything else** — several arguments, or a spread — builds the arguments as ONE list at the
  receiver's own rep (so a spread argument is §3.2's business and needs no case here), grows the
  receiver once to `len + new.len`, and appends with a single `array.copy`. That is the loop
  `extend` uses rather than N pushes, and it is why `xs.push(...ys)` needs no special case.

A bulk append grows to EXACTLY the length it needs; the `cap == 0 ? 4 : cap * 2` doubling a
one-at-a-time push amortizes over has nothing to buy when the final length is already known.

`push` in value position still yields the new length (D1592); with several arguments that is the
length after all of them.

**A nullable or literal-union element list keeps the one-argument spelling.** `(K | null)[]`,
`(boolean | null)[]`, `(string | null)[]` and a literal-union `K[]` ride an i32 or string SPINE
whose list literal needs value seeds this path does not thread, so a multi-argument push on one
is refused rather than built at the wrong backing. It is the one place the rule is narrower than
it reads, and it is named in §5.

---

## 4. Interactions the ruling did not settle

Each of these is a choice this PR made. The alternative is named so a later ruling can take it.

### 4.1 Function types — a rest is NOT part of the type

**Chosen:** `function f(a: i32, ...xs: i32[])` has the type `(i32, i32[]) => i32`. Assigning it
to a function-typed binding is legal, and calling THROUGH that binding takes a list explicitly:
`g(1, [2, 3])`, not `g(1, 2, 3)`. There is no `(...i32[]) => i32` spelling.

**Why:** this is exactly how defaults already behave, and the mechanism is already built.
`checkCallOnFuncTy` reads defaults from `calleeDeclParams` — the AST — and its own comment says
*"a call through a function value has no declaration to read defaults from and keeps its
exact-arity gate."* A rest marker lives on the `Param` node beside `parOpt` and `parDefault`, and
`TyFunc` (`{ fnParamTypes, fnRet }`) carries no parameter names, defaults or arity metadata at
all. Making a rest part of the type would have been the first thing in that struct that is not a
type.

**The alternative:** a `(...i32[]) => i32` spelling with a rest flag on `TyFunc`, so a callback
can be variadic. It costs a field on `TyFunc`, a rendering in `tyname.vl`, an arity rule in the
`call_ref` path, and a decision about whether `(i32, i32[]) => i32` and `(...i32[]) => i32` are
the same type. Nothing in the ruling needs it, and `sortBy`-shaped callbacks do not want it.

### 4.2 UFCS

`xs.f(a, b)` where `function f(self: X, ...parts: T[])` **packs**, exactly as the direct call
does — `ufcsCallTy`'s arity gate learns the rest the same way `checkCallOnFuncTy` does, and the
rewrite in §3.1 runs after the receiver has already been spliced to slot 0, so it sees an
ordinary call.

`function f(...self: T[])` is refused (§2.1): the receiver is first and a rest is last.

A spread may not carry the receiver — `ys.f(...)` spreads into `f`'s rest, never into `self`.

### 4.3 Defaults and optional parameters

They compose in the only order that is unambiguous: fixed parameters, then defaulted ones, then
the rest. `f(a: i32, b: i32 = 0, ...xs: i32[])` accepts 1 or more arguments; the second fills
`b`, and everything after it packs. `fnRequiredArity` is unchanged — it already stops at the
first default, and a rest parameter is simply not counted in the upper bound.

A **named** argument may not fill the rest parameter (§2.5): named arguments bind by name to one
slot, and the rest is many.

### 4.4 `readonly`

A spread SOURCE may be a `readonly T[]` — spreading reads it, and the packed list is a fresh
mutable one, so nothing is laundered. This is the whole reason the packed list is not itself a
view: `readonly` in, mutable out, and the conversion is a copy rather than a claim.

### 4.5 `vl fmt`

`...` prints where it was written, from the surface markers: `parRest` on `Param` (beside
`parOpt`, which has the same job) and the `Spread` node's own arm in `expr()`. Because the call
and array printers both route their items through `expr()`, one arm serves both positions.

---

## 5. What is NOT built, named

* **A covariant spread source.** `Circle[]` spread into `...Shape[]` (where `Shape = Circle | Sq`)
  is refused, because `array.copy` relates one wasm array type and the two lists have different
  heap types. The element-converting copy D791 built for the ordinary covariant delivery is the
  lowering this wants; wiring it into the spread path is a follow-up.
* **A rest parameter in a function TYPE** — §4.1, with the alternative stated.
* **A rest parameter on an `extern`.** `parseExternParams` stores type spellings only and has no
  `Param` node to carry the marker; a host import's arity is its whole contract.
* **A rest element hole pinned to a BOXED union** — §2.4. `f(1, "x")` into `...xs: T[]` is a
  loud check reject naming `...xs: (i32 | string)[]`, which runs. The gap underneath it is
  D1851's, not the rest parameter's: the same pin at the explicit-list spelling is a loud emit
  reject on master.
