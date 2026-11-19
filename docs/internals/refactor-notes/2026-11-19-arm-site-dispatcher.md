# One per-arm dispatcher for list and map unions at a pin (2026-11-19)

D16975: a union of maps handed to an un-annotated parameter. This is the map analogue of D16897,
built by generalising the list-union per-arm emit instead of copying it.

## The dispatcher
`emitArmSite(site)` (wasmEmit.vl) takes a read site the pin typed and left unrewritten. For each
arm of the receiver's union, it:
1. tests the arm's box tag;
2. casts the payload to the arm's heap into a wrapper local;
3. overrides the receiver to that arm (`luOvEnter`, `luOvLocalEnter`);
4. re-emits the site, and delivers its value into the site's type.

There is no per-op code. The op is the site node itself.

| site (`armSiteRecv`, emit_classify.vl) | list arm | map arm |
| --- | --- | --- |
| `r[i]` / `r[k]` | element | value or null |
| `r.length` | length | size |
| `r.has(k)` | — | boolean |
| `r.get(k)` | — | value or null; the pin spells it `r[k]`, as for one map (`monoPinMemberCall`) |

The arm rows are `listIsArmTag` (which already tags map arms), `armHeapOf` (a list's wrapper, or
the map struct its shape names) and `armWrapLocal` (the list scratch, or code 47's non-null map
ref). A receiver that is no name, such as `a[0].length` over an arm read, is read once into the
box stash. A name is re-read per arm, as the index read always did.

## Checker
- `lmReadAt` types a union-of-maps read under `monoRecheckDepth` and leaves the body alone
  (`lmPinRead`). It declines `keys`/`values` and a record value (`luPinDeclines`, D16930's rule
  for lists).
- `lmMembersAt` is `lmMembers` without the pin guard, as `luMembersAt` is for lists.
- The pin's `.length` row (`memCstrMsg`) admits a union of maps.
- The call's map demand admits a union of maps member by member (`holeMapDemandMet`).

## Deleted
- `emitListUnionArmRead`, `emitListUnionArmChain` and `LU_ARM_LEN`. A list union's `.length`
  goes through the dispatcher.
- The list-union `for` keeps a length chain over its own plan (`emitListUnionForLen`) until
  step 4 moves the loop onto the dispatcher.

## Measured (master fixpoint vs this branch's fixpoint)
- Identity over the list-union and union-of-maps cases (117 files that spell such a union): 101
  same, 13 failing on both sides, 3 differing.
- The three that differ are the `.length` reads through a hole
  (`list-union-length-through-hole`, `-element-`, `-for-`). Their output is the same; the receiver
  is re-read per arm and the arm's payload goes through its local. Every index read is
  byte-identical.
- Capability matrices: `union-of-maps-index-read-open` 62 → 64 of 64, and both
  `union-of-maps-second-store-into-wider-slot` templates take their `argument` cell. Over every
  list-union and union-of-maps template, `runs → not-runs` 0 and `→ silent` 0.
