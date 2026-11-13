# Four `declTyIxOfName` callers graded by origin; the mv name fallbacks are deleted, 2026-11-13

Lane A. `declTyIxOfName` answers a declared name from the declaration table, a primitive keyword
from the primitive leaf, and anything else by parsing the spelling (`resolveAnnot`). The
render-parse census grades that parse as render-origin, over 394 programs. This note grades four
of its callers by where their argument comes from.

**Method.** A probe tagged every `declTyIxOfName` call with its caller and fan-in site. It
recorded which of the three rungs answered, and every name that reached the parse. It ran over
the sweep population (24,222 programs, master `0b123e39`).

**Passes: source text only.**
- `repSlotOfElemTy` (1,465 programs) and `rlDeclTwinTy` (1,047) pass `nominalStructNameOfTy`'s
  answer, which is the `tdName` of a root `TypeDecl`. Every call was answered by the declaration
  table, and none reached the parse.

**Fails: rendered spellings, now handed the held type.**
- `fieldElemTyIxOfName` through `mvValTyIxOfNameRow`: 866 programs from the mv-slot interner and
  95 from the mv-row bank. Every name that reached the parse was a render, such as
  `{r:i32|null}` or `{[string]:Circle}`.
  - `mvShapeOfMapHeldTy` renders the value name from `tyMapValOf(m)`, and now hands that type
    down as the row's type.
  - Where the interner rewrites the spelling, the bank records the rewritten spelling's own
    type: the union row's `unTyIx`, or the `i32` list a tagged set's ids are stored as
    (`fnTagListRepTy`).
  - Every entry to the interner returns before it when its type is -1, so `rowTy >= 0` by
    construction. `mvValTyIxOfNameRow` and its name fallback are deleted.
- `repNameCanonId` through `mvValTwinCanonId`: 33 programs, all renders (`{[string]:i32}`,
  `i32[]`, `S[]`, function types). The twin identity now reads `tyPeelNul` of the slot's banked
  type, and its name fallback is deleted.
- `repNameCanonId` keeps one caller, `call_bind_shadow`'s mono instrument. It was not reached
  in the population, since it runs only on an armed compile.

**Verified before deleting.** A second probe, on the fix, compared each handed type with the
name's resolution:
- the twin identities agree in every program;
- no fan-in path reached the name rung.

The handed types disagree with the name's resolution under `tySame && tyEq` in 43 programs. All
fall in already-graded classes, checked by printing both types:
- a literal against its widened type (`N12 | null` against `i32 | null`; `Dot = {r: 1 | 2}`
  against `{r: i32}`);
- a readonly list against a plain one;
- a newtype brand against its base (`EView`, `A1[]`; D16003);
- an alias or declared name against its structural spelling (`Circle[]`, `Set<i32>`, `D`);
- a union's member order.

The plain sweep reads no movers.

**Not taken.** `fieldElemTyIxOfName` from `rlInternNameTyK`'s stored-name rung (480 programs,
all renders) goes with lane B's `repElemTyOfName` work, by agreement.
