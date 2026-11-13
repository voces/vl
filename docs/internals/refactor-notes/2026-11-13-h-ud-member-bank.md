# Step 7, lane H: declared-union members read the checker's resolution, 2026-11-13

`collectDeclaredUnion` (the member walk) and `declArmsMatchRow` resolved each
member of a declared union by re-parsing its spelling (`declTyIxOfName(vs[i])`).
That spelling is not the author's: the post-check canon pass rewrites
`udVariants` in place (`canonEmitNameTs`, check_program). For example,
`Box<i32>` becomes `{v:i32}`, `{ k: 1, n: i32 }` is softened to `{k:i32,n:i32}`,
and a function member loses its parameter names. The checker had already
resolved every member from the parser's spelling tree
(`annotResolve(variants[vi], udTsRootAt(sx, vi))`).

## Graded by origin

A probe over 24,217 programs recorded each spelling these callers parsed, graded
by the census's rule (source when, ignoring whitespace, a substring of the
program's text):

| caller                                 | (program, spelling) pairs | source | render |
| -------------------------------------- | ------------------------- | ------ | ------ |
| the member walk (`vs[i]` and `vsx[i]`) | 408                       | 369    | 39     |
| `declArmsMatchRow`                     | 12                        | 12     | 0      |

The member walk blocks. Its renders are canon's rewrites (generic applications,
softened literal tags, unnamed function parameters) and the atoms `unionTyArms`
rendered from a nullable alias member.

## The change

- **The checker banks each member's resolution.** `fillUnionDeclMembers` records
  `m`, the resolved type or the placeholder a cycle falls back to, per
  declaration node and member position (`udMemberTySet`, check_canon_raw).
  `synthInlineLitUnionDecls` banks the literal types its `#lu` declarations are
  spelled from, since those declarations never reach the fill.
- **The emitter reads the bank.** `declMemberTy` serves the member walk and
  `declArmsMatchRow`. An expanded nullable member takes the arm types
  `unionTyArms` already returned beside the atoms.
- **A miss fails loudly.** After the `#lu` bank, a second probe found every
  member read in 5,629 programs banked, with 0 misses. So the re-parse fallback
  is a floor: an unbanked member `emitFail`s.

The banked type is the checker's, not the canon render's. They differ under
`tySame` in 3,114 programs (a literal tag kept, not softened), and no byte
moves: the walk uses the type only to expand an alias or nullable member, and as
the fallback for a variant `declVariantPos` does not place.

## Measurement

- **Sweep** (`sweep.vl diff`, fixpoint seeds, master ad5abe1bc against this):
  24,221 programs, all the same. 0 bytes-only movers, 0 output movers.
- **Census:** does not move. `declTyIxOfName`'s parse is graded once for the
  whole function, and its other callers remain.
- rep-fuzz-check exact; the remaining gates pass.
