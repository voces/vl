# Step 7: does a row key need declaration identity? A census and a design proposal, 2026-11-11

Family B's floors (#7269, #7279, #7285, #7294) and w311's variant floor (#7274) each ended at a
name read that was said to carry **declaration identity**: something the checked type does not
say, because two declarations share one type. The proposed close was a row key of
`(canonical type, declaration id)`. This note asks the prior question: where does the language
make two same-shape types distinct? It then measures whether any of those name reads changes an
emitted module. Nothing in the compiler changes. Base is master `ebe1862f` (#7293), whose
fixpoint seed is 6,622,870 bytes. The population is the sweep's 23,925 programs.

## 1. What the language says

| construct | distinct from a same-shape type? | where it is decided | at runtime |
| --- | --- | --- | --- |
| a newtype brand, `type N = new B` | yes, in the checker | the brand sidecar (`nwTyIxs`/`nwNames`, `nomNameOfTy`) | **erased**: no wrapper and no private heap type, deliberately kept out of `repCanonKey` (DECISIONS, "A nominal type is `type N = new B`, and it is ERASED"; `docs/internals/newtype-design.md` §3) |
| two declared records of one shape | no | structural | one heap type (`buildStructTwins`); "nominal names are a WasmGC implementation detail, not semantics" (DECISIONS, structural slot dedup) |
| a union arm and a same-shape record | no | structural | one heap type across the variant⇄struct seam (`uVarSTwin`, D280/D282) |
| two same-shape arms of one union | no | owner ruling 2026-09-02 (D1023) | `is A` is a discriminant-**value** test; a pair with no distinguishing literal field is refused by the checker |
| a future opaque type | yes | not built | the reserved seam: inject identity into `repCanonKey` for a private heap type (DECISIONS, A14 forward-compat) |

So nothing in today's language makes two same-shape types distinct at runtime. Declaration identity
exists in the checker, as the brand and as which declaration a spelling names, for diagnostics and
assignability. A struct or variant row may differ by declaration, but its heap does not.

## 2. Where the checker records declaration identity today

- `cStructNames` / `cStructTyIxs` / `cStructFirstPos` (`check_types`): each declared record and
  its type. `structNameOfTy` answers the first declared at a type.
- `cVariantMemberTyIxs` / `cVariantMemberTyIxSet`: the types that are declared union members.
  `tyIsVariantMember` (#7285) is its type-level reader.
- `annDeclPos` / `annUnionDecl` (`check_node_tys`, #7139/#7150), written by `annDeclNote`: the
  record and union declaration an annotation, cast or `is` test names. Its readers are
  `annDeclVariantRow`, `annDeclNameOf`, `declVariantRowAt` and `annArmDeclPosOf`.
- The brand sidecar `nwTyIxs`/`nwNames`/`nwBaseTyIxs`, read by `nomNameOfTy`.

## 3. The experiment: switch each floor to the type and compare the modules

Each experiment compiler was built twice from base plus one change (a fixpoint) and never refreshed
into `build/`. Its sweep was diffed against base's.

| | name read | count the floor was named for | switched to | sweep vs base |
| --- | --- | --- | --- | --- |
| E1 | `retStructRowIndex`'s declared-name rung, `#anonN` handles kept (#7279's floor) | 109 programs whose name row is not the type's row, mostly the brands `I32View`/`F32View` | the type's row (`recordStructRow`) | **23,924 same**, 1 mover: D15730 |
| E2 | `rlElemVariantHeap` (`variantIndexOf(rlElemName[slot])`) | 861 twin programs, 69 ARM2 programs predicted to "move onto the wrong heap" (banked-spellings note) | `repVariantShapeRowOf` of the element type | **23,925 same** |
| E3 | w311's variant floor: `rlElemStructRow`'s arm-name gate and `rlElemVariantRow` | 1,715 programs where the type "cannot say this is the arm" | `tyIsVariantMember` + `repVariantShapeRowOf` of the element type | **23,925 same** |

D15730, the one mover, is an open `check-clean invalid wasm` row. Its literal `{ k: null }`
builds at its own row, and the inline annotation's spelling names another. Both compilers emit a
module that fails validation; only the validator's message differs, and the outcome is
`compiler_trap` both ways. The rung E1 switches is the one D15730's annotation passes through, so
that switch is graded against D15730 and recorded with it, as w314's row.

**Grading.** The three floors decided which row a value is named by. Because the language merges
those rows' heaps, the name never decided a wasm type in this population. They are name reads that
the merged heaps made redundant, not missing declaration identity.

## 4. Proposal: build no declaration key

The key stays `repCanonKey`'s canonical type. Declaration identity stays in the checker. The
emitter's name reads are switched to the type one reader at a time, each byte-identity-graded by
sweep. Where a question really is per-union (an arm's **tag**), the key is
`(the receiver's union row, the member's type)`, which the receiver's type already carries. This
is `annArmDeclPosOf`'s second rule ("the member of the named union whose type is `armTy`"),
without the declaration.

The seam DECISIONS reserves is unchanged. A future opaque type injects its identity into
`repCanonKey` and gets a private heap, and only then does a row need a declaration.

## 5. The readers, and the cut order

| order | reader | programs it is reached in or decides | evidence | owner |
| --- | --- | --- | --- | --- |
| 1 | `rlElemStructRow`'s arm gate, `rlElemVariantRow` | 1,715 | E3: 0 movers | w311 (ref-list rows) |
| 2 | `rlElemVariantHeap`; then `rlWidenVariantOf` and `idxStoreClassify`, the same `rlElemName` variant lookup | 861 twin programs | E2: 0 movers for the first; the other two need their own probe | w311 |
| 3 | `retStructRowIndex`'s name rung (non-`#anon`) | 109 | E1: 0 movers but D15730's message | w324, with w314 for D15730 |
| 4 | `structRowOfNameTy`'s arm test | 5 where a typed test answers otherwise (#7279) | not yet switched | w324 |
| 5 | the `annDeclPos` column's readers: `annDeclVariantRow` (`letAnnVariantIdx`, `alcNamesArm`, `annVariantRowOf`, `fnRetVariantIndexSid`), `declVariantRowAt` (`isTestedRowOf`, `cloRetValSlot`), `annArmDeclPosOf` (`unionArmTagsOfTy`), `annDeclNameOf` (`retStructRowIndex`) | byte-identical by construction except at a cast (#7139: 1 program, the ARM2 cast `m2(n) as A2`; #7150: D15670) | the cast's tag is per union, so it reads `(receiver union, member type)` | w324 |
| 6 | the columns `annDeclPos` and `annUnionDecl`, once 5 leaves them unread | — | — | w324 |
| 7 | `isTestedRowIn`'s name round trip | 29 (an inline arm in two unions; dedup-by-name is its contract) | — | w316 (the union registry, once it keys rows by type) |

Each cut is one PR that deletes the name read it switches, or names its floor with a measured
mover. Cuts 1–2 are w311's functions, so they are proposed to w311 rather than taken.

## What this does not claim

- The sweep is the population, not the language. A program outside the 23,925 could reach a floor
  with rows whose heaps do not merge. Each cut's PR re-probes its own site (reached, differ) before
  switching, as Family B's did.
- D1023's same-shape-arms ruling has open rows of its own; this note does not grade them.
