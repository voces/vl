# Step 7 L2, mono, R1 (a): three pin decisions read the type, not their text (2026-11-13)

Lane D. Lane I's render triage puts R1 (mono pin spellings) with lane D. Group (a) is the three
sites that decide on a pin's text; group (b), the key sites, is graded floor by #7782.

## Cut

1. **`monoRecordNominalPin`.** It scanned its nominal render for a `{` not followed by `[`, a
   record spelled by its fields, and answered `""`. That decision is now `monoTyHasFieldRecord`,
   a type walk. It stops at a declared record name, a generic application, a nominal brand and a
   declared union alias, which is where the render prints a name instead of fields. The spaces
   are stripped with `nameStripSpaces`.
2. **`monoTagRecordPinKind`.** It compared the pin's text with the spelling of the record's
   stored type. Now `monoTagMapRepTy(ty) >= 0` decides, and the `pin` parameter is gone.
3. **`monoSubstAnnNode`.** It refused a substitution whose spelling equalled the written
   annotation. That comparison never fires, since the substituted type is closed while the
   annotation names a type parameter, so it is deleted. The empty-spelling guard stays.

## Decision tables

From `MPROBE` builds over the 24,070-record population:

| site | old and new decisions agree | disagree |
| --- | --- | --- |
| `monoRecordNominalPin` | 465 programs, 2,322 decisions | 0 |
| `monoTagRecordPinKind` | 1,828 programs, 4,097 decisions | 0 |
| `monoSubstAnnNode` (`sub == tyName`) | never true: 192 programs, 625 decisions | n/a |

The walk took two refinements before it agreed with the scan:
- stopping at a nominal brand;
- stopping at a declared union alias (`type N = {…} | {…}`, rendered `N|null`).

## Byte comparison

Master vs PR over every program reaching any of the three: **2,515 of 2,515 identical** (2,501
SAME, 14 SAME refusal).
