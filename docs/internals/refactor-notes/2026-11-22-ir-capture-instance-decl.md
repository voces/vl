# IR: a cloned instance's nested function captures the frame's own clone of a binding, 2026-11-22

Lane IR-N6. The coordinator ruled the three capture classes next: `closure env capture`,
`capture binding` and `callee captures`. They are the two largest tests/cases classes on the
0857c51a census. The ruling was to group them by ablation first. An instrumented scratch seed,
never pushed, split each miss site by the condition that fired. Delta-debugging then gave one
family worth 178 functions: 101 `closure env capture` plus 77 `callee captures`.

## The family

A generic function's instance is a clone of its body. A nested function in that clone reads a
`let` of the frame, and the read's `identDeclOf` still names the template's `LetDecl`.
`liftCapDecl` found that declaration, `ownBinding` refused it because it is not the instance frame's
own, and the capture had no variable. So `cloEnvOf` missed with `closure env capture` and
`liftCaps` with `callee captures`.

Witness and ablation:

```
function a<T>(x: T) {
  let k = (u) => { print(u) }
  const rd = () => { k(x) }
  rd()
}
a(1)
a(true)
```

| variant | misses |
| --- | --- |
| as written | yes |
| `const k` | yes |
| `(u: T)` instead of a hole | yes |
| one instance | yes (the callee row) |
| a non-generic frame | no |
| a concrete-typed lambda `(u: i32)` | no |
| no nested capture (`k(x)` in the frame) | no |

Over the whole population, all 206 sites had exactly one own `LetDecl` minted from the found
declaration, by `declOrigOf`.

## The change

`ownBinding`'s existing walk over the frame's own declarations also records each one minted from
another, keyed by its `declOrigOf`. `liftCapDecl` maps a found declaration that is not own to that
clone. Legacy reads the same local by live scope: `emitCaptureRead` → `captureHomeOf(fnIx, name)`,
which is `declaredIndexAt(fnIx, scopeSlotOf(name))`. The IR asks the clone table symbols.vl records,
with no slot or name reasoning of its own.

Two clones of one template declaration in the same frame do not pick one: the map records -2 and
`liftCapDecl` misses with `capture instance twin ambiguous`. That miss fires 0 times on self, the
corpus and tests/cases. A non-own declaration with no clone in the frame is an outer binding. It
still falls through to this frame's environment field (`captureSlotOf`), as before.

## Readings (base master cc27c3ea8, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases functions with no blocker | 68,513 | 68,620 |
| tests/cases `closure env capture` (any / alone) | 172 / 106 | 56 / 36 |
| tests/cases `callee captures` (any / alone) | 123 / 65 | 40 / 29 |
| corpus functions with no blocker | 45,099 | 45,106 |
| corpus `closure env capture` / `callee captures` (any) | 9 / 5 | 6 / 1 |
| self-compile functions with no blocker | 19,807 | 19,807 |
| `capture instance twin ambiguous`, all three populations | — | 0 |

`ir-only-census` builds its probe compiler from the checkout's own source, so each side ran in
its own tree: tests/cases programs fully IR-only went from 4,021 to 4,037 of 7,051. Missed
functions went from 154 to 43 for `closure env capture` and from 88 to 31 for `callee captures`.
The self-compile still misses 61 functions.

The functions still missing `closure env capture` are the other families, which are not built
here: a capture with no rep, and a frame variable at another rep than its capture. A second
instance of the witness above is one of the latter. `capture binding` is unchanged, since its
largest family, a narrowed nullable capture, is the next slice.

Legacy lines deleted: 0. Moved to `@ir`: 0.
