# Step 7 L6 (lane G, cut 4c): the inline union registrar reads its members' types, not its spelling's atoms, 2026-11-12

The base is master `dc22884b`. `registerInlineUnionGo` registers an inline union. It split its
spelling into atoms (`unionSetAtomsOfTy`, which falls back to `splitUnionAtoms`) and decided three
things from that text:

- whether a map member beside another member is refused;
- which list and map members register their own element or value union;
- whether the union boxes as a variant box and is minted.

The census in `2026-11-12-step7-union-reg-retag-by-type.md` counted 3,024 split fallbacks in 1,858
programs inside `unionSetAtomsOfTy` for this caller, and 889 more with no type.

## Why not the type's atom text

A first probe compared the split atoms with the type's arms (`unionTyArms`). The two lists differ
in vocabulary in 645 calls in 310 programs:

- a nullable closure loses its parentheses;
- a string literal set widens to `string`;
- a generic application appears expanded.

Swapping one text for the other is not identity. The decisions are made from the member types
instead.

## The member list

`riuMemberTys(sty)` is the union's canonical members (`canonUnionMembersInto`: nested unions
flattened, numeric literals at their base, equal members once, `null` as -1). A declared union
alias's own type (`unionAliasDeclNameOfTy`) is one member.

The second rule is the text path's: the alias name splits to one atom, and the alias's
declaration registers its row. Without it, 925 calls in 86 programs would mint a second row for a
recursive alias reached by name (`Json`, `J`, `Node`): D14742's pair.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, ran these exact
functions beside the text path. It tallied each decision and reported once per program, at the
end of `emitProgram`, over the sweep list (24,020 programs graded):

| decision | agree | differ |
| --- | --- | --- |
| map member refused (no / yes) | 10,591 / 375 | 0 |
| the sub-unions registered | 10,966 | 0 |
| fewer than two members | 5,703 | 0 |
| the union boxes (no / yes) | 7,241 / 2,772 | 2 calls in 1 program |
| two or more text atoms, one member | — | 14 calls in 7 programs |

- **The box difference** is `#anon0|i32` in `generics/lambda-join-type-params-keeps-null.vl`. The
  text path could not align the heap-row name `#anon0` with its record type, so it read the
  member as neither a record nor a value and minted nothing. The member type is a record, so the
  union now boxes and is minted. The program prints what master prints.
- **The 14 calls** are string literal sets (`"a"|"b"`), which are one member at their base. Their
  text atoms are literals, which register no sub-union and refuse no map, so the pass did
  nothing for them either way.

## Changed

- `registerInlineUnionMembers(stmts, mtys)` replaces `registerInlineUnionAtoms`. It refuses an
  unboxable map member and registers each member's sub-union from the member types.
- `isVariantBoxUnionTys(mtys)` decides the box: two or more non-null members, each a record, a
  value atom (`boxTagOfTy`, a literal union), a map or a list, at least one not a value atom. It
  is `isVariantBoxUnionAtoms`'s rule over types only.
- `registerInlineUnionGo` no longer calls `unionSetAtomsOfTy` or `isVariantBoxUnionOfTy`.
  `registerCloResultUnion` still does; it was outside this census.

## Graded by output

The program whose box verdict moved, and the literal-set programs, run on a master seed and on the
candidate: 5 programs, 0 differ.

## Proof

- **Seed:** fixpoint, 6,725,088 bytes.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, render-parse, dead-exports, emitter-state-audit.
- **The full sweep:** CI's `sweep` label. The expected mover is
  `generics/lambda-join-type-params-keeps-null.vl`'s bytes.
