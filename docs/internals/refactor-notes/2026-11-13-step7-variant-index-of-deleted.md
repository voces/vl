# Step 7 L6: `variantIndexOf` deleted, its readers by type, 2026-11-13

`variantIndexOf(name)` was the last variant NAME producer on the census. It read a sid-keyed index
(`uVariantRowBySid`) filled from two places:

- `uVariantsPush`, under the spelling each union pushed;
- `declArmsMatchRow(bind)`, which bound a twin arm's declared name to its row.

There are 12 code sites; the other grep hits are comments. Each reader was graded with a probe compiler over the sweep (24,204 programs). The probe compared
the name answer with the arm row of the declared type, `exactArmRowOfTy(declTyIxOfName(name))`.

| site | reached / name says variant | typed reading |
| --- | --- | --- |
| `unionArmRowsOfExpr` atom fallback (emit_classify) | 207 programs | agrees on every atom |
| `unionArmRowsOfTy` atom fallback (wasmEmit) | 100 | agrees |
| a box retag's arm set (wasmEmit) | 2 | agrees |
| `unionBoxEqColumns` spelling arm (wasmEmit) | never reached | floored on master by #7714 first |
| `mvVal` variant column / arm name (emit_union_atoms) | 172 | agrees on the declared name; the caller's `armTy` does not answer there |
| `structElemArrayLowerable`, `nameIsStructDecl`, `gaeArgIsTyParam` | never true | never true |
| an arm-mint field's arm (emit_shape_intern, D15095) | 14 | agrees by the field's type; 17 more where the type finds an arm the name did not |

No site picked a different row when both readings found one.

Lane D ran an independent reach probe on master 36048dd2 (24,070 programs) before handing the
item back. Only four sites ever answer:

- the bind write;
- `structElemArrayLowerable`, 3 decisions, where the typed test agrees;
- the two `mvVal` rungs, 172 programs.

The atom fallbacks are reached but always answer -1. The row dump and the `==` spelling arm are
never reached by a corpus program. The bind write found a different row already bound once, in
`unions/variant-twin-heap.vl`, and the `< 0` guard kept the first. The typed read gives the first
row of the type, which that program's unchanged sweep cell confirms.

## Change

- Every reader of a declared identifier now asks `exactArmRowOfTy(cUserTypes[name] ?? -1)`. That
  is an identifier lookup of the checker's declared-type table, then the arm row by type, with no
  spelling parse.
- The arm-mint field reads `exactArmRowOfTy(tyPeelNul(fldTy))`, the field's own type.
- `gaeArgIsTyParam` reads the `baseTy` it already held.
- `rowDumpVariantOf` is the typed read alone.
- Deleted: `variantIndexOf`, `uVariantRowBySid` and its resets, the index write in
  `uVariantsPush`, and `declArmsMatchRow`'s `bind` pass, which only wrote the index.

## Measured

Base 55c764120 against this change, both fixpoint seeds:

| instrument | result |
| --- | --- |
| full sweep, 24,204 programs | 24,202 same; 0 output movers; 0 runs → not-runs; 0 new traps |
| bytes-only movers | 2: `unions/self-recursive-arm-field.vl`, `unions/struct-holding-self-recursive-arm.vl` |
| `vl_row_classes_test.ts` | 19 passed |
| `vkind-census --slots-list`, variant `name` | 1 → 0 |

The two movers come from the arm-mint field. Four bytes move in each: the function types
`(ref $7, ref $7)` and `(ref $5, ref $5)` swap places, where `$5` and `$7` are the mutually
recursive struct pair. The type set is the same, and so are the output and `wasm-dis` text.

The only struct name producer left is `structIndexByName`, under the `sNameIx` contract.

## The `sNameIx` contract carries no exception

Lane G converted `utkAtomText` in cut 7a (#7704). It now keys a union atom by its member's type,
and keys a member with no type as `?` plus its spelling, a case the sweep never reaches.
`emit_union_tykey` no longer reads `structIndexByName`. So the
[`sNameIx` contract](2026-11-12-step7-snameix-contract.md) holds with no exception clause: every
key is an identifier or an `#anonN` handle. Lane F's `rlElemStructRow` reads it under F's
contract (#7636).
