# Type hash-cons stage 2b: an open collection child is a hole, and a pin solves it (lane H), 2026-11-15

Stage 2b of `2026-11-14-type-hashcons-design.md` §2.2, on top of 2a's three writers. Three commits:

1. **API** (250008e9). `tyOpen(child)` becomes the one openness test: the 243 `.aElem`, `.mKey`
   and `.mVal` `< 0` / `>= 0` comparisons in 51 files call it. `declKeyOf(node)` keys
   `mkTyVarSlot`'s binder, which is L5's `DeclKey` seam.
2. **Accessors.** The 1,766 field reads go through `tyElemOf`, `tyKeyOf` and `tyValOf`, so the
   field's representation belongs to `check_types.vl` alone.
3. **The hole column.**
   - A minted open child (`TY_OPEN`) is a hole, stored in its field as `-4 - h`. That is below both
     sentinels: −1 means no type, and −3 means open.
   - `tyPin*` solve `holeSol[h]` and never rewrite the row.
   - The accessors read a solved hole as its solution, and an unsolved one as `TY_OPEN`, so every
     reader sees exactly what it saw before.
   - `holeReset` runs with the arena's reset.
   - **So the 33 collection pins no longer mutate a row.**

The first attempt encoded holes as `-2 - h`. The cost was 178 files differing and a seed that
could not rebuild itself, because `TY_OPEN = -3` is a second open sentinel: it read as hole 1. The
code range now starts below every sentinel.

Measured against this branch's base (master after #8109), built to its own fixpoint from
`git archive`:

| reading | value |
|---|---|
| seed | fixpoint (both refreshes exit 0, then byte-identical) |
| L2 identity | byte-identical |
| corpus identity | 1,833 of 1,833 files (the 596-cell sample, 465 empty-collection files, 814 generic files): same module and diagnostics after each commit |
| L2 guest fuel | 86,017,219,806 → 86,119,638,940 (+0.12%, the accessor calls), against master's fixpoint after the final merge |
| L2 peak RSS | 4,269,784 KB warm (the base run was cold) |
| plumb fuel | main 9,020,596,637, tail 6,535,301,137 |
| net compiler lines | **+539**: 286 import lines (`vl fmt` writes one name per line in a multi-line import block), about 70 lines of logic (the column, the accessors, `tyOpen`, `tyElemOpen`/`tyKeyOpen`/`tyValOpen`, `declKeyOf`), and about 180 re-wraps of lines the accessor calls lengthened. Collapsing the 244 `tyOpen(tyXOf(r))` sites into `tyXOpen(r)` and dropping the unused imports took it from +554. |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
| byte movers | none |

**Still to do (2c):**
- The 10 non-pin bump causes: the function-type patches, the placeholder fills, the null-fold tie
  and the shape field.
- `tyVarOwner` on hole binders.
- The row-variable accessor `tyElemHole`, which lands with lane G's first caller.

Stage 3's interning removes the accessor cost, because a child is then an id.

**Phase-state baseline.** Routing reads through the accessors raises L5's census "surface" in 36
non-checker modules. Those reads were already direct field accesses on checker types, so this is
the same dependence made visible, not new reach. The coordinator ruled for a baseline rewrite in
this PR. The long-term fix is for the census to count a type-arena child read as no checker fact
(lane Q).

**2b deletes nothing yet.** The 10 non-pin bumps, the `TY_OPEN` sentinel handling and
`tyVarOwner`'s hole half are 2c, with D16365's hole-to-hole union and G's matrix as its
acceptance test.
