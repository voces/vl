# Flow narrowing

How VL refines types along control flow. Implementation in `compiler/typecheck.ts`
(`conditionNarrowing` / `atomFact` / `thenNarrowings` / `elseNarrowings` / `postGuardNarrowings` /
`withNarrowings`, plus the `intersectType` / `subtractType` algebra), applied by **both**
`compiler/toAST.ts` and `compiler/toWasm.ts`. Roadmap items A5 / A3 / A4.

## The shared fact, applied by both passes

A narrowing is a fact about a **place** — a name (`x`) or a property path (`o.v`, `x.y`) — that
becomes a different type within a branch. The fact is produced once (in `typecheck.ts`) and applied
by both passes:

- **toAST** narrows the type scope around the branch (a name via the scope stack, a path via the
  `narrowedPaths` overlay).
- **toWasm** keeps a `narrowed` overlay consulted by `codegenType`. The local keeps its *declared*
  (possibly nullable) wasm type — only the type-level view changes — so `local.get` / `struct.get`
  (which accept a nullable ref) stay valid; codegen unboxes a union per the narrowed view.

## What narrows

- **Nullness:** `if x != null` / `if x is T` → `x` non-null in the then-branch.
- **Union members:** `if x is A { … } else { … }` → `A` in then, the complement `U − A` in else. An
  N-case union peels one variant per `if`; nested narrowings compose on the *current* view, not the
  declared type.
- **Post-guard (guard clauses):** `if x == null { return }` → `x` non-null for the rest of the block
  (any divergent then-branch — return/break/continue, via `divergesStatement`).
- **`&&` / `||` chains:** a guard narrows a *list* of facts. `&&` narrows several places at once
  (`x != null && x.y is i32`), and its RHS is type-checked *and* codegen'd with the LHS's narrowing
  already applied (short-circuit). `||` is the De Morgan dual — `if x == null || y == null { return }`
  narrows **both** after.
- **Literals:** `x == L` narrows then to `x & L`, else to `x − L`.
- **`?.`:** `if x?.y is T { … }` narrows both the receiver (`x` non-null) and the path (`x.y` is `T`),
  so the body reads `x.y` directly.
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
