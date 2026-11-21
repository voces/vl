# IR: a record literal at its destination's record type (2026-11-20, lane IR-N2)

Legacy builds a struct literal at the row its destination names (`structIndexOfObjCtx`). It writes
the row in layout order (`objLitLayoutRowOf`), or through its order stash (`objLitStashRowOf`)
when the source order is observable. The builder's `objLit` built the literal at the row's
recorded type (`sTyIx`) only when the literal was in layout order. Otherwise it used the
literal's own type. Both types can hold a field at another rep than the destination's record:
`rdKind: kind` holds a plain atom where `RepDesc.rdKind` is `VKind | null`. The atom is the same
i32 either way, so the struct has the same layout and legacy writes the same bytes. The literal
came back at a record rep the declaration, return or nullable return did not take. The
self-compile's `repMk`, `irFnNew` and `eplFresh` missed at `declaration coercion` or
`return coercion` this way.

## The change

`objLit` (`ir_build.vl`), struct arm: the row legacy builds at is the layout row, else the stash
row. When the delivery's type (`ctxTyAt`) is a closed record whose row
(`structIndexOfTy`) is that row, the literal is built at that type through `objLitAt`. Each field
is then delivered at the destination's field rep, as legacy's row writes it. A nullable record
destination is read through its niche's rep (`recordPartTy`: the niche's inner rep and its type,
`repTyOf`). That keeps the builder off the checker's `nonNullTy`, whose import would raise the
phase-state surface.

## Witness

`tests/cases/records/literal-at-declared-row-type.vl` builds the stash-ordered `RepDesc` shape
declared, returned, and returned into a nullable result. Under the merge-base seed one of its
four functions is covered: the others stop at `declaration coercion` and `return coercion`.
After, all four are covered and matched. Shadow row `LIT_AT_DECLARED_ROW`.
