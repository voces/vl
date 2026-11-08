# Step 2 and 7's last classifier rung (2026-11-08)

After [`monoHoleBinding` is deleted](2026-11-08-mono-hole-binding-deleted.md) (#6879). Base is
master `957c647d` with #6879 merged in, and both seeds are fixpoints.

## The two reads

`classifier-census --callers` read `pre-only 0 · both 5` on the base, from **21 calls** before
monomorphize finished. The calls came through two template reads in `emit_mono.vl`, not one.

| read | calls | programs | what it answered |
|---|---|---|---|
| `monoArgTyNameCascade` → `fnSigKeyOf` | 19 | 13 | a named function value's TEMPLATE `$fnsig` key |
| `monoArgFnTypeName` → `cloRetTypeName` | 2 | 2 | a lambda's TEMPLATE inferred result kind |

`cloRetKindOf`, `cloRetValKind`, `blockTailIsClosure` and `exprIsClosureNoLocal` were callees of
these two reads.

**The first read.** Its 13 programs were all loud emit rejects. In every one, the argument named a
generic function (`take(id, id)`, `run(add)` with `add(a, b)` un-annotated) that no closed pin
reached, so the key was the template's. For an un-annotated parameter that key is the `i32`
default. The read is replaced by `monoNamedFnValPin`. A generic function with no closed pin is now
refused at the argument, with the value floor's text (`a generic function taken as a value
reaches no call that fixes its type`). A function with no type parameter or hole pins at its
declared type's key, which is a type read and not a classifier. Removing the read with no
replacement left 12 programs loud, but
`error-binding-of-one-typaram-seeded-from-another-generic` became **invalid wasm**, because
`monoPinTyParamComposite`'s `openArg` arm bound `F` from the call instance instead. So the refusal is
needed.

**The second read.** In `generic-call-in-generic-body-binds-its-own-same-named-t` and D15033,
`each(x, (v) => { n = n + 1 })` named the lambda `(i32)=>i32`. The `i32` result was
`cloRetValKind`'s default for a body with no value. The lambda fallback now names only a declared
result. Where it names none, `monoPinTyParamComposite` reads the parameter's closed type from the call key
(`elabCallParamTy`), which is what the `Index` arm below it already did. Both programs print as
before.

## Measured

| | base | candidate |
|---|---|---|
| `classifier-census --callers` | pre-only 0 · both 5 | **pre-only 0 · both 0** (post-only 73) |
| sweep, 23,713 programs | | 23,703 same · 0 bytes-only · 10 output movers (message only) · 0 `runs → not-runs` · 0 new traps |
| seed (fixpoint) | 6,577,862 | 6,577,925 (+63) |

The 13 programs keep their outcome (`emit_reject`), and their message and position move to the
argument. Two `tests/cases/closures` headers quote the new text. The eight inventory rows among the
13 (D1666, D14843, D15011, D15105, D15154, D15483, D15566, D15568) grade `as filed` under
`check-filed-witnesses --strict`.

## What stands

* D15568, D15011, D14843 and D15105 are still loud. They refuse earlier and with one message. Each
  needs the elaboration to close the argument, at a tagged set or a call key, and then the
  cascade no longer reaches them.
* D15568's join: `elabListParamSource` returns one parameter. Two parameters writing one list need
  it to return the set of parameters, and the tag plan (`check_fn_tag.vl`) must type the slots at
  the union of their sets.
