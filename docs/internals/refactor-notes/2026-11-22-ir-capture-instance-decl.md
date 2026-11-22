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
