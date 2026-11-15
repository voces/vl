# Type hash-cons stage 4a: the layout id and the probes the switch needs (lane H), 2026-11-15

Stage 4's first slice, on top of 3b (#8221). Nothing switches yet. This slice adds the third public
id that lane E's `repOf` asked for, and grades it. It also adds the probes that 3b found missing.

## Probes

`tySameSpelled`'s "equal" side had only 8 distinct-row pairs in the 1,833-file corpus. Four new
`@run` cases in `tests/cases/sets/` test a Set and its boolean map through a pinned generic, as a
list element, a record field, a map value and a generic record's argument. They add 8 more
pairs, and the comparer and the ids agree on all of them. Two cases in `tests/cases/unions/` hold
lane E's literal-union probes: `type K = "a" | "b"` against the same set inline, once as a
record field and once under a nullable.

The record-field probe found D16435. A list literal that mixes a held `RA` with a fresh literal,
at an annotated `RA[]` whose field is a literal union, is refused. The same list with only fresh
elements, or a `push` of the literal, runs.

## The layout id

`tyCanonLayout(ty)` starts from the spelled equality (written member order, a Set as its boolean
map). It is finer wherever the rep tree is:
- a union alias row keeps its declaration (`CK_ALIAS`), and flattening stops at it;
- a nullable stays opaque;
- a one-member union is not collapsed into its member, because a one-member literal union is the
  atom while a bare literal is its base string;
- a function carries its tag bit (`fnTagTyIsTagged`), because a tagged function type stores its
  set's tag rather than a closure;
- a newtype brand wraps any kind.

The record arm bit (`repTyIsVariant`) is **not** in the id. It reads emit-time variant shapes, so
it is a fact about the program rather than the type, and a content id cannot hold it without going
stale. The shadow pairs it with the id at the top level.

## Layout shadow

`repTreeOfTy` reports each node it returns. The shadow fails on a merge: one id meeting two nodes
in the same tree. A split, one node meeting two ids, is safe (the id is finer) and only counted.
`rtSync`'s reset drops the table along with the tree.

1,839 files (the 1,833 of 3b's sample plus the six new cases):

| reading | count |
|---|---|
| agree | 1,391,377 |
| merge | 20, all in one file |
| split (finer, safe) | 42,261 |

The first cut had 1,108 merges in 65 files:
- tagged functions;
- one-member unions;
- records whose arm bit differs, on their own or inside a list.

The tag bit and the uncollapsed union fixed the first two classes. The top-level arm pairing fixed
records on their own. The 20 left are in `scripts/silent-sweep/distilled/named/dord032.vl`: lists
of records whose arm bits differ one level down.

**So `repOf` cannot key a list or map of records on `tyCanonLayout` alone.** It needs the arm bit at
every record below the container too: either a per-program arm-aware id built on top of the
layout id, or the rep tree keeps its own key for containers of records. That is lane E's call for
stage 3½.

## Measurements

Against master's fixpoint seed (50e2c3f4):

| reading | value |
|---|---|
| seed | fixpoint (two refreshes byte-identical) |
| corpus identity, shadow off | 1,839 of 1,839 files, same module and diagnostics |
| seed size | 6,384,110 → 6,388,091 bytes (+0.06%) |
| net compiler lines | +192: `emit_ty_seal.vl` +174 (the layout flavour about 75, the layout shadow and its report about 95), `emit_rep.vl` +18 (the hook, the reset and `rtArmBitOf`) |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
