# Soundness corpus — findings

Bugs discovered while expanding the soundness test corpus (A12). Each entry has a
minimal repro, the expected vs. actual behaviour, and a note on which part of the
compiler to investigate.

---

## struct-union-null-is-chain — RESOLVED

**Status:** RESOLVED. `is` discriminates on the value's *representation* type (its
declared union/nullable layout), not the flow-narrowed type. In an `else if v is
B` arm `v` has narrowed to `B | null` (whose own layout would be a niche nullable
ref) but is still the boxed `{tag, anyref}` union it was passed as — so the test
reads the box tag instead of emitting a niche null test on the boxed struct.
Fixed in `compiler/toWasm.ts` (`Is` case + `unnarrowedType` helper). Pinned by
`tests/cases/soundness/struct-union-null-is-chain-sound.vl` (+ `-multi`).

**Severity:** runtime trap / illegal cast (valid program crashes at runtime)

**Minimal repro:**

```vl
type A = { kind: i32, x: i32 }
type B = { kind: i32, y: i32 }

function read(v: A | B | null): i32 {
  if v is A { return v.x }
  else if v is B { return v.y }
  else { return -1 }   // null branch
}
print(read({ kind: 0, x: 1 }))  // 1 — ok
print(read(null))                // TRAPS: "illegal cast" at `v is A` (line 5)
```

**Expected:** compiles and runs correctly; `read(A-value)` returns `x`, `read(B-value)` returns `y`, `read(null)` returns -1.

**Actual:** runtime trap "illegal cast" when `null` is passed and the `is A` arm is evaluated. Non-null struct values (A or B) are discriminated correctly. The type-checker accepts the program (no compile errors).

**Workaround:** guard `null` first, then discriminate the remaining non-null union:

```vl
if v != null {
  if v is A { return v.x }
  else { return v.y }
}
return -1
```

**Root cause hypothesis:** when `null` is a peer variant alongside struct variants (`A | B | null`), the flat `is`-chain's codegen for `is A` tries to unbox the value as the `A | B` boxed-union representation without first checking for `null`. The `null` value passes through the boxing step and then causes an illegal cast when the `is A` tag compare is attempted on it. The nested null-first guard works because it checks for `null` before any unboxing.

**Test case added (workaround):** `tests/cases/soundness/struct-union-nullable-member-sound.vl`
uses the null-first guard idiom to pin the correct behaviour until this is fixed.

**xfail:** `tests/cases/soundness/xfail-struct-union-null-is-chain.vl` pins the
current behaviour (trap on null input) so the regression guard fires when the bug
is fixed.

---

## literal-is-always-false — RESOLVED

**Status:** RESOLVED. `is <literal>` is now a runtime VALUE test (same answer as
`== <literal>`): literal variants sharing a representation share a tag, so the
codegen compares the value, not just the tag. Scalar/narrowed operands compare
directly; a boxed-union operand checks tag (for the rep) then the unboxed payload.
Fixed in `compiler/toWasm.ts` (`Is` case + `literalCheckExpr` helper). Pinned by
`tests/cases/soundness/literal-is-runtime-value.vl` and
`literal-is-union-param-dispatch.vl`.

**Severity:** silent wrong result (codegen bug — `is <literal>` always evaluates false)

**Minimal repro:**

```vl
const n: 0 | 1 = 0
if n is 0 { print("zero") } else { print("one") }
// prints "one" — WRONG, should print "zero"
```

Also affects string literals:

```vl
const s: "a" | "b" = "a"
if s is "a" { print("a") } else { print("b") }
// prints "b" — WRONG, should print "a"
```

**Expected:** `is <literal>` discriminates the value at runtime just like `== <literal>` does.

**Actual:** `is <literal>` is always false — every value takes the else branch regardless of its actual value.

**Does not affect `==` form:** `n == 0` / `s == "a"` work correctly and are the recommended idiom.

**Root cause hypothesis:** the `is` codegen for literal variants (numeric or string) emits a comparison that is always false — possibly comparing to a tag value of 0 / the wrong constant, or the literal-union `is` path generates `unreachable` or a constant-false without looking up the literal's value. The `==` path uses a different code path that correctly compares the scalar value.

**Test case added (workaround):** `tests/cases/soundness/numeric-literal-union-exhaustive-is.vl`
and `tests/cases/soundness/union-four-variant-exhaustive.vl` use `==` instead of `is` for literal discrimination.

**xfail:** `tests/cases/soundness/xfail-literal-is-always-false.vl` pins the bug as an always-false check.

---

## optional-chain-named-alias — RESOLVED

**Status:** RESOLVED. `getChildType` now unwraps a named `type` alias (`Type`
node) via `getConcreteType` before the field lookup — the `?.` path passes
`nonNullable(...)`, which could leave the alias wrapper in place. The
`OptionalAccess` result-type path unwraps it too. So `Config | null`'s `?.port`
type-checks (and runs) exactly like the inline `{ port: i32 } | null` form,
including chained `o?.inner?.v` over nested aliases. Fixed in
`compiler/typecheck.ts`. Pinned by
`tests/cases/soundness/optional-chain-coalesce-sound.vl`.

**Severity:** type-checker false positive (valid program wrongly rejected)

**Minimal repro:**

```vl
type Config = { port: i32 }
const cfg: Config | null = { port: 42 }
const p: i32 | null = cfg?.port   // error: expected {port: any}, got {port: i32}
```

**Expected:** compiles clean; `p` is `i32 | null` (the optional-chained field type).

**Actual:** `Type error: expected {port: any}, got {port: i32}`

**Does not affect inline struct form:** replacing `Config` with `{ port: i32 }` inline
compiles and runs correctly:

```vl
const cfg: { port: i32 } | null = { port: 42 }
const p: i32 | null = cfg?.port   // ok
```

**Root cause hypothesis:** the optional-chain lowering in `typecheck.ts` /
`toWasm.ts` does not unwrap a named `Type` alias wrapper before checking the
receiver's field. The struct-type check (the `expected {port: any}` message is
the "expected a struct with that field" diagnostic) sees the alias node instead
of the underlying struct, so the field cannot be found. The fix is to call
`getConcreteType` (or the equivalent alias-unwrapper) on the receiver type before
the field lookup in the optional-chain path.

**Affected surface:** `?.field` where the receiver is typed as `NamedAlias | null`.
A plain `if x != null { x.field }` guard works correctly, as does `x?.field` on
an inline-typed receiver. Function-call form `x?.method()` is likely also affected.

**Test case added (workaround):** `tests/cases/soundness/optional-chain-coalesce-sound.vl`
uses the inline struct form to pin the correct behaviour until this is fixed.
