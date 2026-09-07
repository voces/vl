# Flow narrowing

How VL refines types along control flow. Implementation in `compiler/typecheck.vl`
(`conditionNarrowing` / `atomFact` / `postGuardNarrowings`, plus the `intersectType` /
`subtractType` algebra and the `narrowedPaths` overlay), consumed by the WasmGC emitter
(`compiler/wasmEmit.vl`). Roadmap items A5 / A3 / A4.

## The shared fact, applied by both phases

A narrowing is a fact about a **place** — a name (`x`) or a property path (`o.v`, `x.y`) — that
becomes a different type within a branch. The fact is produced once (in the checker,
`typecheck.vl`) and applied by both phases:

- **The checker** narrows the type scope around the branch (a name via the scope stack, a path via
  the `narrowedPaths` overlay).
- **The emitter** keeps a `narrowed` overlay consulted during codegen. The local keeps its *declared*
  (possibly nullable) wasm type — only the type-level view changes — so `local.get` / `struct.get`
  (which accept a nullable ref) stay valid; codegen unboxes a union per the narrowed view.

## Narrowing applies to READS

A narrowing changes what a place **reads as**, never what it **accepts**. A write is checked
against the place's DECLARED type and then re-narrows it to the member it wrote, for the reads
that follow until the region ends or the next write — TypeScript's and Kotlin's rule. So both of
these are legal, and both print `4` and then `true`:

```vl
let x: i64 | boolean = 3
if x is i64 { print(x + 1)      // reads as i64
  x = true                      // checked against `i64 | boolean`
  print(x) }                    // reads as boolean

let y: i64 | boolean = 3
while y is i64 { print(y + 1)   // a loop head narrows its body, re-tested every iteration
  y = true                      // the flip is how a loop over a union terminates
  print(y) }
```

A write of a NON-member is still refused, and the diagnostic names the declared type:
`x = "s"` above is `cannot assign string to i64 | boolean`. One place the rule stops short: a
write inside a NESTED block retires the narrowing for everything after that block rather than
re-narrowing across it.

## What narrows

- **Nullness:** `if x != null` / `if x is T` → `x` non-null in the then-branch.
- **Union members:** `if x is A { … } else { … }` → `A` in then, the complement `U − A` in else. An
  N-case union peels one variant per `if`; nested narrowings compose on the *current* view, not the
  declared type.
- **Post-guard (guard clauses):** `if x == null { return }` → `x` non-null for the rest of the block
  (any divergent then-branch — return/break/continue, via `divergesStatement`). Post-guard
  subtractions **accumulate**, both across a sequence of separate `if`s and down an `else if`
  chain, so `if u is A { return } else if u is B { return }` leaves the tail a bare `U − A − B`.
  The accumulation stops at the first arm that does *not* diverge — control can leave the chain
  through that arm's body with its condition true — and it applies to **bare names only**
  (a property path's narrowing can be retired inside an arm, so it is not carried out). An arm on
  the fall-through path that WRITES a different member into the place drops the residual for that
  name: the write is legal, and what it costs is the fact the code below the chain would have had.
- **Loop bodies:** a `while` head narrows its body exactly as an `if` then-arm does — a null
  strip and an `is T` pin alike, a property path as much as a bare name. What could falsify a
  fact mid-body retires it: a write, or a call that can reach the place. A guard from an
  ENCLOSING `if` is different: a write in the loop body that falsifies it is refused, because
  the reads textually before the write run again after it and no back edge re-tests that guard.
- **`&&` / `||` chains:** a guard narrows a *list* of facts. `&&` narrows several places at once
  (`x != null && x.y is i32`), and its RHS is type-checked *and* codegen'd with the LHS's narrowing
  already applied (short-circuit). `||` is the De Morgan dual — `if x == null || y == null { return }`
  narrows **both** after.
- **The type parameter itself:** inside a generic body, `if y is T` tests against the
  *instantiated* `T` rather than making you spell its arms out — `function pick<T>(x: T, y: T | null): T { if y is T { return y } x }`.
  The checker always accepted this; codegen answers it by SUBSTITUTING the check spelling at the
  monomorphization pin, so `y is T` at `T := i32` is byte-for-byte the program `y is i32` is,
  and every rep the concrete spelling handles this one handles too (D951).
- **Literals:** `x == L` narrows then to `x & L`, else to `x − L`.
- **`?.`:** `if x?.y is T { … }` narrows both the receiver (`x` non-null) and the path (`x.y` is `T`),
  so the body reads `x.y` directly. One `?.` guards the WHOLE chain to its right — `o?.y.z` reads
  as `o == null ? null : o.y.z` and `p?.f()` as `p == null ? null : p.f()`, so the result carries
  the `| null` once, at the chain's end. A link that is nullable in its own right still needs its
  own `?.`: `o?.y.z` over a `y` of type `Leaf | null` is refused, exactly as `o.y.z` would be.
- **Exhaustiveness:** an `if/else if` chain that subtracts the discriminated place to `Never` has no
  reachable fall-through — no spurious `| null`, and codegen emits `unreachable` for the impossible
  path (`conditionsExhaust`).

## The algebra (A3 / A4)

`intersectType` (the then-branch refinement, `x & A`) and `subtractType` (the else-branch, `x − A`)
back all of the above. `Intersection` / `Negation` are real type nodes but simplify aggressively
against finite unions, so codegen rarely sees them; an open-world residual (`i32 − 1`) is dropped to
its positive part. **Holes are never inspected** by these helpers — `validateType` greedily *pins* an
`Unknown`/`Infer` hole, so narrowing on a generic param would contaminate it; `sameVariant`/`meet`
treat a hole as never-the-same-variant and refine toward the concrete side instead.

## Remaining

`case` / multi-guard (no grammar yet); the stored-witness correlation (A6b Stage B); and per-call
reachability-pruned return types (`foo(0): i32`, `foo("0"): boolean`) — blocked on the
once-inferred-with-holes **memoization** (the body's expression types are cached against the generic
param, so a per-call re-walk can't re-derive them without per-instance re-type-checking). See A6b.
