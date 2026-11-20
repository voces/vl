# An object literal under legacy's source-order stash (2026-11-20)

The self-compile's `object layout` rows were object literals with a context row whose layout
order permutes an observable source order: `{ msg: desc(k), at: P.pos }` into `Diag`, laid out
`at, msg`. Legacy evaluates each initialiser in source order into a scratch local
(`objOrderStashSlot`) and reads them back in layout order before `struct.new` (D1510).

## Shape
- **Rows.** `objLitStashRowOf`/`objLitStashRowAt` (struct) and `objLitVariantStashOf`/`At`
  (variant) are the layout predicates with the order stash required instead of refused; a
  literal that drops a field (D1696) or omits one stays legacy's.
- **Builder.** `objLitAt` falls back to the stash row and builds the fields in source order
  (`objFieldSrcOrder`), recording that order in `RMakeRec.mrSrc`.
- **Lowering.** `makeRecStashed` lowers each field in source order, `local.set` into the slot
  `objOrderStashSlot` opens for it (the calls legacy makes, in legacy's order), then reads every
  slot in layout order before the row's `struct.new`.

## Measured
See the PR body.
