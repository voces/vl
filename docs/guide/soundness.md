# VL soundness contract

> **Every well-typed VL program is type-safe at runtime.**

VL is **statically sound**: if a program type-checks (zero ERROR diagnostics),
then no operation will ever see a value of the wrong type at runtime. There is
**no `dynamic`** and no escape hatch — inference holes are not a dynamic type,
they are *unresolved* types that the compiler resolves to a single concrete type
before codegen. A program either pins down a concrete type for every value or it
fails to compile; it never defers a type decision to runtime.

This document states the contract. The executable form of the contract lives in
[`tests/cases/soundness/`](../../tests/cases/soundness/): a curated, growing corpus
of small "must-error" and "must-not-error" programs. The test runner is **strict
by default** — a case fails on any diagnostic (error, warning, or info) it did
not declare, and `@run` cases compare the entire log output — so a "must-not-error"
case is simply one with no `@error` directive: clean compile is the default
assertion, no `@ok` needed. Deep changes to inference, flow narrowing, union
representation, or codegen must keep that corpus green (`deno task test`); a
soundness regression either makes a clean case start erroring, or removes the
error from a `@error` case, and breaks the suite.

## What the contract guarantees

- **Inference holes resolve to concrete types.** An un-annotated parameter or
  `let` is a hole, not a dynamic value. Each call site monomorphizes a fresh copy
  of a generic function's signature and *collapses* the resolved holes to
  concrete types, so the checks at that site are strict (see
  `functions/inferred-return-soundness.vl`).
- **No `dynamic` / no implicit `any`.** There is no type that silently accepts
  every value and defers checking. Where a value can be one of several types, it
  has an explicit **union** type and must be narrowed before use.
  The *diagnostics* say the same thing: an unresolved hole renders as the blank
  `_` — "comparison expects numeric operands, got `_` and boolean", "cannot
  assign `(_, _) -> _` to 'c' of type `(i32, i32) -> string`". `_` is not a type
  name; it is an unfilled slot, and there is nothing to write in it because the
  fix is to constrain the hole (pass a different argument, add an annotation),
  never to name a top type.

## The rules the corpus pins down

### Flow narrowing
After `if x is T { … }`, the value is `T` in the then-branch and the
**complement** (`U − T`) in the else-branch; after `if x != null { … }` /
`if x == null { return }`, the value is non-null where it is used. A use that
depends on a narrowing the compiler can prove is sound compiles clean (`@run`);
a use that relies on the *opposite* of what was narrowed is rejected (`@error`).

- sound: `narrowing-is-sound.vl`, `narrowing-null-guard.vl`,
  `nullable-access-guarded.vl`
- rejected: `narrowing-is-unsound-use.vl`

### Nullable access
A member access on a `T | null` value is rejected until a guard narrows it to
`T`. The nullable can hide one level deep in a field path (`o.v.x`).

- rejected: `nullable-access-unguarded.vl`, `nullable-access-nested.vl`

### Union discrimination & exhaustiveness
An `is`/`==` chain that covers **every** variant is exhaustive: the fall-through
carries no spurious `| null`, so the function returns a non-null type with no
dummy `else`. A **missing case** leaves the result nullable — and that `| null`
is the soundness signal "you forgot a case": returning it where a non-null type
is declared is an error.

- sound (exhaustive): `exhaustive-union-sound.vl`, `literal-union-sound.vl`
- rejected (missing case ⇒ nullable): `exhaustive-missing-literal-case.vl`,
  `exhaustive-missing-is-case.vl`

### Struct-union discrimination & shared fields
`v is A` over a union of **struct** types is correct — true iff the runtime value
really is an `A`. Each struct variant carries a distinct runtime tag keyed on its
field-name-aware **shape** (WasmGC erases field names, so the tag, not the wasm
type, is what tells `{tag,x}` from `{tag,y}` apart). Discrimination is by
structural shape: two same-shape `type` aliases are the same variant (a `B` value
IS an `A`), so a same-shape union needs an explicit discriminant field. A field
present on **every** member with the **same** type is readable on the union
directly, without narrowing (`(A | B).tag`); an unshared field still requires an
`is`/`==` narrowing.

- sound: `is-struct-union-sound.vl`, `is-struct-union-dispatch.vl`,
  `struct-union-shared-field.vl`
- rejected (unshared field ⇒ narrow first): `struct-union-unshared-field-reject.vl`

### Literal unions are closed sets
A literal union (`"a" | "b"`, `0 | 1 | 2`) accepts only its listed members, on
argument-passing, assignment, **and** comparison. `"c"` is never a `"a" | "b"`.

- rejected: `literal-union-reject-arg.vl`, `literal-union-reject-assign.vl`,
  `literal-union-reject-compare.vl`

### Equality is typed
`==`/`!=` require comparable operand types — there is no JS-style cross-type
equality that silently returns `false`. `==`/`!=` against `null` is always
well-typed on a nullable value and narrows the place in the branch.

- rejected: `equality-type-mismatch.vl`
- sound: `equality-nullness-sound.vl`

### Union variance
Narrower → wider union assignment is sound (every `string` is a `string | i32`).
Wider → narrower is rejected; it requires an explicit narrowing first.

- sound: `union-widen-ok.vl`
- rejected: `union-narrow-reject.vl`

### `is` on a generic (un-annotated) parameter
The guard does not pin the parameter — each call monomorphizes independently, and
`is T` on the per-call concrete type is decided statically at codegen, so calls
do not cross-contaminate.

- sound: `is-generic-param-sound.vl`

### Operators over inference holes

An operator whose operand is an unresolved hole cannot be decided in the body — a
hole is permissively assignable to string *and* numeric, so an eager check would
have to guess a branch. The body records a deferred `(lt, op, rt)` constraint
instead, and **every generic call site re-validates it under the substituted
argument types**. One rule covers the whole capability: arithmetic, string
concat, relational, and equality.

So the annotated and un-annotated spellings of the same mistake reject alike —
inference buys brevity, never a weaker check.

- rejected: `arith-hole-operand-reject.vl` (`add(1, "x")` over
  `function add(a, b) a + b`), `equality-hole-operand-reject.vl`,
  `arith-annotated-mismatch.vl` (the annotated twin)
- sound: `equality-hole-operand-sound.vl` (the same generic at four
  self-compatible types), `equality-hole-null-test-sound.vl` (`x == null` asks
  about the storage, not about type agreement, so it is exempt),
  `functions/operator-capability-poly.vl`

## Known-unsound corners (documented gaps)

The contract is the goal; a corner where the checker is *wrong* is captured as an
`xfail-*.vl` file that pins today's behavior and is annotated with what it *should*
do — the regression guard fires the moment a fix changes the behavior, surfacing it
at merge.

A checker can be wrong in two opposite directions, so the prefix always says which
(`tests/cases/soundness/README.vl` is the normative statement):

| prefix | meaning | directive shape | closing it |
|---|---|---|---|
| `xfail-unsound-*` | **accepts too much** — a program that should be refused compiles clean. A hole in the contract above. | no `@error`, plus a `TODO(soundness):` note | tightens the checker; the file becomes an ordinary `*-reject.vl` `@error` pin |
| `xfail-false-reject-*` | **rejects too much** — a SOUND program is refused. A completeness gap, never a soundness one. | an `@error` pinning the *undesired* diagnostic | **loosens** the checker, so it needs reject-parity work; the file drops the prefix and flips to `@run` + `@log` |

`xfail-` is about the *compiler* being wrong, never about the *test* failing: a
file named `xfail-…` still passes `deno task test`, and a name that merely sounds
like a known failure while pinning correct behavior is a documentation defect —
six such files here left ROADMAP A13 reading OPEN long after its defect was fixed.
A must-error pin is named `*-reject.vl`, whatever it took to get it there.

There are currently **no** `xfail-unsound-*` files. Container element variance is
the live unsound corner and is **not** pinned here at all: a `Cat[]` flowing into
an `Animal[]` parameter is silently accepted and emits invalid wasm
(`docs/internals/open-rulings.md`).
