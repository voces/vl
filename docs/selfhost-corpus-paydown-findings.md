# Self-host corpus pay-down — measured findings (2026-06-10)

A measurement pass over the full single-file corpus through the **native `vl`**
tool (`vl run` / `vl check` against `build/vl-compiler.wasm`), re-ranking the
remaining work so the next checker/parser/emitter slice can be picked by
count-per-effort with eyes open. This is the "measure first" step for work-queue
item 3 (the checker/parser parity tail). No checker/emitter change shipped in
this pass — see the closing note on why each slice is multi-layer or
gate-sensitive enough to warrant a deliberate, supervised attack rather than an
overnight rush.

## Headline metric — runtime oracle (@run files that emit + run correctly)

Sweeping all 308 single-file `@run` files through `vl run` and diffing stdout
against the `@log` directives:

```
@run pass: 122   fail: 186
fail by stage:  emit 68   parse 58   type 55   logdiff 4   other 1
```

The 122 that pass are (a superset of) the Tier-2 whitelist. The 186 failures are
the pay-down. **Emit (68) is the single biggest blocker** — these files
type-check clean but the emitter can't lower them.

### Emit-stage buckets (68 files), by emitter message

| count | emitter failure | feature |
|------:|-----------------|---------|
| 13 | `only i32, boolean, struct, union, array, or string parameters` | **inline union params** — `function f(v: A \| B)`; a *named* alias `type N = A\|B` already works (see below) |
| 7 | `callee is not a function name` | first-class / indirect function values, method dispatch |
| 7 | `only i32[] arrays and struct/union element arrays` | other array element types (`f64[]`, `string[]`, nested) |
| 6 | `ref valtype with no interned shape` | type-interning gap (often co-occurs with inline unions) |
| 5 | `` `??` is only supported on a map index get `` | null-coalescing outside map-index position |
| 4 | `only i32 / boolean / string / array struct field…` | other struct field types |
| 4 | `bare null needs a struct-typed context` | `null` literal inference |
| 3 | `unsupported member-call statement` | method calls in statement position |
| 3 | `` `is` test but no union type declared `` | `is` against non-union / inline union |
| 2 each | nested arrays · unsupported statement · for-in iterable · unknown function · non-i32 map values | assorted |

### logdiff (4 files) — **emit + run, but WRONG output** (correctness bugs)

These are the smallest-surface, highest-value targets: the pipeline already
produces a running module, the value is just wrong.

- **`operators/unary.vl`** — postfix `x++`/`x--` yields the **new** value, not the
  old. Root cause: `compiler/parser.vl` desugars `x++` → `x = x + 1`
  (assignment-as-expression = new value). Correct only in statement position; the
  file uses `print(x++)`. *Golden-safe* (no golden source uses `++`/`--`), but a
  correct fix needs a postfix AST node lowered context-sensitively (statement:
  increment+drop, same bytes as today; expression: push old, then increment) —
  i.e. parser + typecheck + emitter, ~3 layers for +1 oracle file.
- **`literals/hex.vl`** — `0xDEAD_BEEF` prints `-559038737` (signed i32) vs the
  expected `3735928559` (unsigned). Subtle: a blanket "print i32 unsigned" would
  break negative-number printing; needs literal-typing care. *Risk: soundness.*
- **`arrays/f64-elems.vl`, `literals/separators.vl`** — f64 values mis-rendered.
  f64 is a whole missing type, out of scope for a small slice.

## The inline-union-param finding (bounded, single-layer-ish)

Measured directly:

```
type N = A | B; function f(v: N) { if v is A { return v.x } ... }   → emits + runs ✓
function f(v: A | B) { ... }                                        → emit error ✗
```

A **named** union alias param works end-to-end; an **inline** `A | B` param trips
`checkParams` (`compiler/wasmEmit.vl:6157`) because an inline union AST node
isn't classified like a named `isUName` alias, and its variant shapes are never
interned (hence the co-occurring `ref valtype with no interned shape`, 6 files).
Direction: route inline union type nodes through the same shape-interning
(`collectU`) + classification path as named aliases. This is the **biggest emit
bucket (13, plus ~6 interning)** and the cleanest conceptual unit, but it spans
the emitter's type-collection + param-classification, not a one-liner.

## Front-end verdict parity (checker/parser), for reference

Driving all 428 single-file cases through `vl check` and comparing the front-end
verdict (reject iff rejected at parse/type) to the `@error` directive:

```
agree 299   false-reject 114   false-accept 15
false-reject by stage:  parse 59   type 55
false-reject by dir:     soundness 40   types 26   functions 8   objects 7
                         generics 6   index 5   …
```

### Largest false-reject (valid program VL wrongly refuses) clusters

- **`is`-narrowing on struct unions** (~10, type): the THEN branch narrows fine
  (matches Tier-1 `t_union`), but the **`else` branch / `else if` chain**
  complement-narrowing and **shared-field access on a union** (`(A|B).tag`) are
  unimplemented. Verified minimal repros: `if v is A { v.x } else { v.y }` →
  `.y on non-object`; `function f(v:A|B){ return v.tag }` → `.tag on non-object`.
- **literal-union types** (~12, parse): `type T = "a" | "b"`, `x is "lit"` →
  `expected IDENT but found STRING/NUMBER/NULL`. **CAREFUL** (carried warning): a
  naive base-scalar collapse regresses 6 must-reject conformance tests; needs
  literal-typed values threaded through the checker.
- **generic type aliases** (~6, parse): `type Box<T> = …` → `expected EQUAL but
  found LT`. Implies monomorphization in emit — large.
- **optional chaining / `??`** (~8, type): `o?.n ?? 0`, nullable member access
  after a guard — `member access '.x' on non-object {x:i32}?`.
- **recursive nullable struct refs** (~6, type): `{value, next: <none>?}` — `null`
  not unifying with a nullable self-referential struct ref in construction.
- **param type inference** (lambdas / indirect generics, ~7, type): `parameter
  needs a type annotation` — inference from usage.

### false-accept (invalid program VL wrongly admits) — soundness gaps (15)

`types/redeclaration` (same-scope `let a … let a`), `chars/empty` / `chars/multi`
(`''` / `'ab'`), `lint/for-step-zero`, `maps/error-no-annotation`,
`soundness/equality-union-field-reject`, definite-assignment reads
(`use-before-assign`, `one-branch-error`, `after-loop-error`), etc. Each is a
checker/lexer *rejection* to add. Low golden risk (the construct never appears in
a valid golden), but redeclaration/definite-assign must be scoped precisely so
they don't trip the **self-typecheck gate** on the compiler's own source.

## Why nothing shipped here, and recommended attack order

Every coherent slice is either (a) **multi-layer** — inline unions and `is`-union
narrowing need checker *and* emitter + type-interning; (b) **gate-sensitive** — a
checker rejection (redeclaration, definite-assign) risks the `SELFHOST_FULL_FIXPOINT`
self-typecheck of the compiler's own source, and any emit change risks the
byte-identical goldens / native fixpoint; or (c) a **large feature** (generics,
f64, optional chaining, first-class functions). None is a safe, self-contained
overnight change, so this pass measured rather than rushed.

Recommended order (highest value / most bounded first), each its own PR with the
oracle delta in the title and gates green:

1. **`operators/unary.vl` postfix fix** (+1 oracle, correctness bug, golden-safe) —
   smallest concrete win; add a postfix node, lower context-sensitively, prove the
   goldens + native fixpoint stay byte-identical.
2. **inline union params + shape interning** (~13–19 emit files) — route inline
   `A | B` through `collectU`/classification like named aliases.
3. **`is`-union `else`/`else if` complement narrowing + shared-field access**
   (~10 checker files; pairs with #2 to actually run).
4. **false-accept soundness rejections** (redeclaration, definite-assign, empty
   char) — front-end only; gate each against the self-typecheck of the compiler.

Reproduce any of the above with the native tool:

```
cd scripts/vl-host && cargo build --release
scripts/fetch-seed.sh
echo 'print(0xDEAD_BEEF)' > /tmp/t.vl
scripts/vl-host/target/release/vl run /tmp/t.vl --compiler build/vl-compiler.wasm
```
