# Step 7 P5: `letDeclResolveAnnot` reads the held annotation type, 2026-11-13

`letDeclResolveAnnot` resolves a `let`'s annotation by re-parsing its spelling (`nameToTyAt`). The
coordinator's witness is the capture-cell rewrite's `((T)=>void)[]` in
`closures/capture-cell-annotated-written-with-generic-by-shared-closure.vl`. There the annotation
node already holds the type an earlier check of the same body recorded. A probe that resets per
compiled program swept 24,209 programs:

| reading | programs |
| --- | --- |
| the annotation node holds a type when the re-parse runs | 1,272, every one inside a quiet inference pass |
| the held type is `tySame` to the re-parse | none in a quiet pass where it holds a type variable |
| `substTyDeep(held, tpEnvNames, tpEnvTys)`, as `mintedAnnTy` does, is `tySame` to the re-parse | 1,271 of 1,272 |

The one exception is `generics/nested-generic-shadowed-param-capture.vl`: a nested generic that
redeclares its encloser's `T`. Building the change showed the probe's first-hit comparison
understated it. With two bound parameters named `T`, the substitution can also give a concrete
but wrong type (`boolean[]` where the instance is `f64[]`), and the repro then refused.

## Change

`letAnnHeldTyAt` reads the held type at the pass's bindings. It answers -1, so the spelling is
re-parsed, when:

- the node holds no type;
- a type variable survives the substitution;
- or two bound type parameters share a name (`tpEnvNamesRepeat`).

The last case is filed as [D16012](../inventory/D16012.md), runs today and must keep running. It
is carried past step 7, because the checker keys a type parameter by name.

## Measured

| instrument | result |
| --- | --- |
| full sweep, 24,209 programs, base f163a56d1 against this change, both fixpoint seeds | 24,208 same; 1 bytes-only mover; 0 output movers; 0 runs → not-runs; 0 new traps |
| fast set on the same tree | all green |

The mover is `generics/type-param-write-union-place-reads-at-pin.vl`, 14 bytes smaller. In
`cell<T>`, base wraps `a[0] ?? "n\"` in an `if` whose condition is the constant `1`, so its `else`
arm, the boxed-null constructor, is dead. The candidate reads `a[0]` directly. The output is the
same.
